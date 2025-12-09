# LAB-Guard Phase 1 Requirements

## Introduction

LAB-Guard is an exam monitoring system for university computer labs. Phase 1 focuses on building a working prototype with teacher/student authentication, basic app monitoring, and role-based dashboards. The system runs on fixed lab PCs where students rotate for examinations.

## Requirements

### Requirement 1: User Authentication System

**User Story:** As a teacher or student, I want to log into the system with my credentials, so that I can access my role-specific dashboard and functionality.

#### Acceptance Criteria

1. WHEN a user opens the application THEN the system SHALL display a login screen with username and password fields
2. WHEN a user enters valid teacher credentials THEN the system SHALL authenticate them and redirect to the teacher dashboard
3. WHEN a user enters valid student credentials THEN the system SHALL authenticate them and redirect to the student dashboard
4. WHEN a user enters invalid credentials THEN the system SHALL display an error message and remain on the login screen
5. WHEN a user successfully logs in THEN the system SHALL create a JWT session token for subsequent requests

### Requirement 2: Teacher Dashboard and Exam Management

**User Story:** As a teacher, I want to create and manage exams with specific settings, so that I can control what applications students can use during the examination.

#### Acceptance Criteria

1. WHEN a teacher accesses their dashboard THEN the system SHALL display options to create new exams and view existing exams
2. WHEN a teacher creates a new exam THEN the system SHALL allow them to upload a PDF file for the exam
3. WHEN creating an exam THEN the system SHALL allow the teacher to set start time, end time, and duration
4. WHEN creating an exam THEN the system SHALL allow the teacher to select which applications are allowed during the exam
5. WHEN an exam is created THEN the system SHALL save all exam details to the database with a unique exam ID

### Requirement 3: Student Dashboard and Exam Participation

**User Story:** As a student, I want to start an exam session and have my activity monitored, so that the system can track my compliance with exam rules.

#### Acceptance Criteria

1. WHEN a student accesses their dashboard THEN the system SHALL display available exams they can participate in
2. WHEN a student starts an exam THEN the system SHALL begin monitoring their application usage
3. WHEN an exam is active THEN the system SHALL log the student's active window titles and process names
4. WHEN a student uses a non-allowed application THEN the system SHALL record this as a violation event
5. WHEN an exam session ends THEN the system SHALL stop monitoring and save all collected data

### Requirement 4: Application Monitoring System

**User Story:** As the system, I want to continuously monitor active applications during exams, so that I can detect when students use unauthorized software.

#### Acceptance Criteria

1. WHEN exam monitoring is active THEN the system SHALL check the active window title every 5 seconds
2. WHEN the active window changes THEN the system SHALL log the timestamp, window title, and process name
3. WHEN a monitored application is not in the allowed list THEN the system SHALL create a violation event
4. WHEN monitoring data is collected THEN the system SHALL store it in the local database with exam and student associations
5. IF the system cannot detect the active window THEN it SHALL log an error event but continue monitoring

### Requirement 5: Local Database Storage

**User Story:** As the system, I want to store all user data, exam information, and monitoring events locally, so that the application can function without network connectivity.

#### Acceptance Criteria

1. WHEN the application starts THEN the system SHALL initialize a SQLite database with required tables
2. WHEN user authentication occurs THEN the system SHALL query the local user database
3. WHEN exam data is created THEN the system SHALL store it in the local exams table
4. WHEN monitoring events occur THEN the system SHALL insert them into the events table with proper relationships
5. WHEN the database is queried THEN the system SHALL return accurate data for dashboard displays

### Requirement 6: Device Registration

**User Story:** As a lab administrator, I want each lab PC to have a unique device identity, so that I can track which computer each student used during exams.

#### Acceptance Criteria

1. WHEN the application runs for the first time THEN the system SHALL generate a unique device ID for the lab PC
2. WHEN a student logs in THEN the system SHALL associate their session with the current device ID
3. WHEN exam events are logged THEN the system SHALL include the device ID in all event records
4. WHEN querying exam data THEN teachers SHALL be able to see which device each student used
5. IF a device ID already exists THEN the system SHALL reuse the existing ID rather than creating a new one