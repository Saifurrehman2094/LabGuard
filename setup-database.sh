#!/bin/bash

# ============================================================================
# LIVE DATABASE SETUP SCRIPT
# Creates PostgreSQL database and runs migrations
# 
# Usage:
#   bash setup-database.sh
# ============================================================================

set -e

echo "=========================================="
echo "LAB-Guard Live Database Setup"
echo "=========================================="

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres}
DB_NAME=${DB_NAME:-lab_guard_cloud}

echo "[INFO] Database configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  User: $DB_USER"
echo "  Database: $DB_NAME"
echo ""

# Function to run psql command
run_psql() {
  PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres "$@"
}

# Create database if it doesn't exist
echo "[DB] Creating database '$DB_NAME'..."
run_psql << EOF
SELECT 'CREATE DATABASE $DB_NAME' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec
EOF

echo "[DB] ✅ Database created/exists"

# Create tables
echo "[DB] Creating tables..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME << 'EOSQL'

-- Cloud Users
CREATE TABLE IF NOT EXISTS cloud_users (
  user_id UUID PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  full_name VARCHAR(255),
  email VARCHAR(255),
  school_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);

-- Cloud Exams
CREATE TABLE IF NOT EXISTS cloud_exams (
  exam_id UUID PRIMARY KEY,
  teacher_id UUID NOT NULL,
  course_id UUID,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  pdf_url VARCHAR(500),
  pdf_s3_key VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  duration_minutes INT,
  allowed_apps TEXT,
  sync_metadata JSONB,
  created_device_id VARCHAR(255),
  FOREIGN KEY (teacher_id) REFERENCES cloud_users(user_id)
);

-- Cloud Exam Questions
CREATE TABLE IF NOT EXISTS cloud_exam_questions (
  question_id UUID PRIMARY KEY,
  exam_id UUID NOT NULL,
  question_number INT,
  question_text TEXT NOT NULL,
  constraints_json JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (exam_id) REFERENCES cloud_exams(exam_id)
);

-- Cloud Test Cases
CREATE TABLE IF NOT EXISTS cloud_test_cases (
  test_case_id UUID PRIMARY KEY,
  question_id UUID NOT NULL,
  input TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  is_hidden BOOLEAN DEFAULT FALSE,
  is_edge_case BOOLEAN DEFAULT FALSE,
  weight FLOAT DEFAULT 1.0,
  time_limit_ms INT DEFAULT 3000,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (question_id) REFERENCES cloud_exam_questions(question_id)
);

-- Cloud Exam Submissions
CREATE TABLE IF NOT EXISTS cloud_exam_submissions (
  submission_id UUID PRIMARY KEY,
  exam_id UUID NOT NULL,
  student_id UUID,
  student_name VARCHAR(255),
  submitted_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'received',
  submission_data JSONB,
  violations_summary JSONB,
  evidence_s3_keys TEXT[],
  device_id VARCHAR(255),
  sync_timestamp TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (exam_id) REFERENCES cloud_exams(exam_id)
);

-- Cloud Submission Details
CREATE TABLE IF NOT EXISTS cloud_submission_details (
  detail_id UUID PRIMARY KEY,
  submission_id UUID NOT NULL,
  code_evaluations JSONB,
  test_case_results JSONB,
  app_violations JSONB,
  camera_violations JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (submission_id) REFERENCES cloud_exam_submissions(submission_id)
);

-- Cloud Class Analytics
CREATE TABLE IF NOT EXISTS cloud_class_analytics (
  analytics_id UUID PRIMARY KEY,
  exam_id UUID NOT NULL,
  total_submissions INT DEFAULT 0,
  average_score FLOAT DEFAULT 0,
  submission_rate FLOAT DEFAULT 0,
  violation_rate FLOAT DEFAULT 0,
  question_stats JSONB,
  temporal_stats JSONB,
  last_updated TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (exam_id) REFERENCES cloud_exams(exam_id)
);

-- Cloud Teacher Reports
CREATE TABLE IF NOT EXISTS cloud_teacher_reports (
  report_id UUID PRIMARY KEY,
  exam_id UUID NOT NULL,
  teacher_id UUID NOT NULL,
  report_type VARCHAR(100),
  report_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (exam_id) REFERENCES cloud_exams(exam_id),
  FOREIGN KEY (teacher_id) REFERENCES cloud_users(user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_exams_teacher ON cloud_exams(teacher_id);
CREATE INDEX IF NOT EXISTS idx_exams_published ON cloud_exams(published_at);
CREATE INDEX IF NOT EXISTS idx_submissions_exam ON cloud_exam_submissions(exam_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON cloud_exam_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_timestamp ON cloud_exam_submissions(submitted_at);
CREATE INDEX IF NOT EXISTS idx_questions_exam ON cloud_exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON cloud_users(username);

EOSQL

echo "[DB] ✅ Tables created"

# Add test data (optional)
read -p "[SETUP] Add test data? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "[DB] Adding test data..."
  
  PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME << 'EOSQL'
  
  -- Insert test teacher
  INSERT INTO cloud_users (user_id, username, password_hash, role, full_name, email)
  VALUES (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'teacher1',
    '$2b$10$abc123...',  -- bcrypt hash of 'password123'
    'teacher',
    'John Doe',
    'john@school.edu'
  ) ON CONFLICT DO NOTHING;
  
  -- Insert test student
  INSERT INTO cloud_users (user_id, username, password_hash, role, full_name, email)
  VALUES (
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'student1',
    '$2b$10$xyz789...',
    'student',
    'Jane Smith',
    'jane@school.edu'
  ) ON CONFLICT DO NOTHING;
  
  SELECT 'Test data added' as status;
  
EOSQL
  
  echo "[DB] ✅ Test data added"
fi

echo ""
echo "=========================================="
echo "✅ Database setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Create .env file from .env.example"
echo "2. Update database credentials in .env"
echo "3. Run: npm install"
echo "4. Run: node live-db-server.js"
echo ""
