/**
 * HYBRID DATABASE ARCHITECTURE - IMPLEMENTATION CODE SAMPLES
 * These samples show how to integrate cloud sync with existing LAB-Guard architecture
 */

// =============================================================================
// 1. CloudSyncService - Main sync orchestrator
// =============================================================================

const fetch = require('node-fetch');
const { v4: uuid } = require('uuid');
const database = require('./database');

class CloudSyncService {
  constructor(baseUrl, apiKey, localDB) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.localDB = localDB;
    this.isOnline = true;
    this.syncInterval = 15 * 60 * 1000; // 15 minutes
    this.retryCount = 0;
    this.maxRetries = 3;
    
    // Monitor connection status
    this.monitorConnection();
  }

  // =========================================================================
  // UPLOAD OPERATIONS (Student → Cloud)
  // =========================================================================

  /**
   * Upload student exam submission to cloud database
   * Called after student clicks "Submit"
   */
  async uploadExamSubmission(examId, submissionId) {
    console.log(`[CloudSync] Uploading submission ${submissionId}...`);

    try {
      // 1. Gather data from local SQLite
      const submission = this.localDB.prepare(
        'SELECT * FROM exam_submissions WHERE submission_id = ?'
      ).get(submissionId);

      const violations = this.localDB.prepare(
        'SELECT * FROM app_violations WHERE exam_id = ?'
      ).all(examId);

      const cameraViolations = this.localDB.prepare(
        'SELECT * FROM camera_violations WHERE exam_id = ?'
      ).all(examId);

      const evaluation = this.localDB.prepare(
        'SELECT * FROM code_evaluations WHERE submission_id = ?'
      ).get(submissionId);

      const testResults = this.localDB.prepare(
        'SELECT * FROM test_case_results WHERE evaluation_id = ?'
      ).all(evaluation?.evaluation_id);

      // 2. Compress evidence files (screenshots)
      const evidenceFiles = this.gatherEvidenceFiles(examId, submissionId);

      // 3. Prepare upload payload
      const payload = {
        exam_id: examId,
        student_id: submission.student_id,
        submission_data: {
          submitted_at: submission.submitted_at,
          files_data: submission.files_data,
          status: submission.status
        },
        violations: {
          app_violations: violations,
          camera_violations: cameraViolations,
          violation_count: violations.length + cameraViolations.length
        },
        evaluation: {
          score: evaluation?.score,
          max_score: evaluation?.max_score,
          compile_status: evaluation?.status,
          test_results: testResults
        },
        device_id: this.getDeviceId(),
        timestamp: new Date().toISOString()
      };

      // 4. Upload to live database
      const response = await this.request('POST', '/api/submissions/upload', payload);

      // 5. Update local sync status
      this.localDB.prepare(
        'UPDATE exam_submissions SET sync_status = ? WHERE submission_id = ?'
      ).run('uploaded', submissionId);

      // 6. Mark violations as synced
      this.localDB.prepare(
        'UPDATE app_violations SET sync_status = ? WHERE exam_id = ?'
      ).run('uploaded', examId);

      this.localDB.prepare(
        'UPDATE camera_violations SET sync_status = ? WHERE exam_id = ?'
      ).run('uploaded', examId);

      // 7. Log successful sync
      this.addSyncHistory('upload', 'success', 1);
      console.log(`[CloudSync] ✅ Submission ${submissionId} uploaded successfully`);

      return response;
    } catch (error) {
      console.error(`[CloudSync] ❌ Upload failed: ${error.message}`);

      // Queue for retry
      this.addToSyncQueue(submissionId, 'upload', 'high', error.message);

      throw error;
    }
  }

  /**
   * Upload exam from teacher PC to cloud
   */
  async uploadExam(examId) {
    console.log(`[CloudSync] Uploading exam ${examId}...`);

    try {
      // Gather exam data
      const exam = this.localDB.prepare(
        'SELECT * FROM exams WHERE exam_id = ?'
      ).get(examId);

      const questions = this.localDB.prepare(
        'SELECT * FROM exam_questions WHERE exam_id = ?'
      ).all(examId);

      const testCases = this.localDB.prepare(
        `SELECT tc.* FROM test_cases tc
         JOIN exam_questions eq ON tc.question_id = eq.question_id
         WHERE eq.exam_id = ?`
      ).all(examId);

      // Read PDF file
      const fs = require('fs');
      const pdfBuffer = fs.readFileSync(exam.pdf_path);

      // Prepare payload
      const payload = {
        exam_data: {
          title: exam.title,
          description: exam.instructions_text,
          start_time: exam.start_time,
          end_time: exam.end_time,
          duration_minutes: exam.duration_minutes,
          allowed_apps: exam.allowed_apps
        },
        questions: questions,
        test_cases: testCases,
        pdf_base64: pdfBuffer.toString('base64'),
        teacher_id: exam.teacher_id,
        course_id: exam.course_id,
        metadata: {
          uploader_device_id: this.getDeviceId(),
          upload_time: new Date().toISOString(),
          version: 1
        }
      };

      // Upload to cloud
      const response = await this.request('POST', '/api/exams/upload', payload);

      // Update local exam with cloud exam_id
      this.localDB.prepare(
        'UPDATE exams SET cloud_exam_id = ?, sync_status = ? WHERE exam_id = ?'
      ).run(response.exam_id, 'uploaded', examId);

      console.log(`[CloudSync] ✅ Exam ${examId} uploaded with cloud ID: ${response.exam_id}`);

      return response;
    } catch (error) {
      console.error(`[CloudSync] ❌ Exam upload failed: ${error.message}`);
      this.addToSyncQueue(examId, 'exam_upload', 'high', error.message);
      throw error;
    }
  }

  // =========================================================================
  // DOWNLOAD OPERATIONS (Cloud → Student/Teacher)
  // =========================================================================

  /**
   * Download available exams for student
   */
  async downloadAvailableExams(studentId) {
    console.log(`[CloudSync] Fetching available exams for student ${studentId}...`);

    try {
      const exams = await this.request('GET', '/api/exams/available', {
        student_id: studentId
      });

      console.log(`[CloudSync] ✅ Retrieved ${exams.length} exams`);
      return exams;
    } catch (error) {
      console.error(`[CloudSync] ❌ Download exams failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download full exam (exam data + PDF + test cases)
   * Called when student clicks "Start Exam"
   */
  async downloadExamFull(examId) {
    console.log(`[CloudSync] Downloading full exam ${examId}...`);

    try {
      // 1. Request full exam from cloud
      const examData = await this.request('GET', `/api/exams/${examId}/download`);

      // 2. Convert PDF from base64
      const fs = require('fs');
      const pdfPath = `/data/uploads/exams/${examId}/exam.pdf`;
      fs.mkdirSync(`/data/uploads/exams/${examId}`, { recursive: true });
      fs.writeFileSync(pdfPath, Buffer.from(examData.pdf_base64, 'base64'));

      // 3. Store in local SQLite
      this.localDB.prepare(
        `INSERT INTO exam_sessions 
         (session_id, exam_id, exam_data, pdf_path, start_time, end_time, status, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uuid(),
        examId,
        JSON.stringify(examData),
        pdfPath,
        examData.start_time,
        examData.end_time,
        'active',
        'local'
      );

      console.log(`[CloudSync] ✅ Exam ${examId} downloaded and cached locally`);
      return examData;
    } catch (error) {
      console.error(`[CloudSync] ❌ Download exam failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download student submissions for teacher
   */
  async downloadSubmissions(examId, options = {}) {
    console.log(`[CloudSync] Downloading submissions for exam ${examId}...`);

    try {
      // 1. Request from cloud
      const submissions = await this.request('GET', 
        `/api/exams/${examId}/submissions`, 
        options
      );

      // 2. Cache in teacher local DB
      for (const sub of submissions) {
        this.localDB.prepare(
          `INSERT OR REPLACE INTO teacher_submissions 
           (submission_id, exam_id, student_name, student_id, submission_data, 
            cached_until, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          sub.submission_id,
          examId,
          sub.student_name,
          sub.student_id,
          JSON.stringify(sub),
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Cache for 7 days
          'cached'
        );
      }

      console.log(`[CloudSync] ✅ Cached ${submissions.length} submissions`);
      return submissions;
    } catch (error) {
      console.error(`[CloudSync] ❌ Download submissions failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download class analytics
   */
  async downloadClassAnalytics(examId) {
    console.log(`[CloudSync] Fetching class analytics for exam ${examId}...`);

    try {
      const analytics = await this.request('GET', `/api/exams/${examId}/analytics`);

      console.log(`[CloudSync] ✅ Analytics: Avg score ${analytics.average_score}%`);
      return analytics;
    } catch (error) {
      console.error(`[CloudSync] ❌ Download analytics failed: ${error.message}`);
      throw error;
    }
  }

  // =========================================================================
  // SYNC QUEUE & RETRY MANAGEMENT
  // =========================================================================

  /**
   * Add failed sync to retry queue
   */
  addToSyncQueue(recordId, operation, priority, errorMsg) {
    console.log(`[CloudSync] ⏳ Queuing ${operation} for ${recordId}`);

    this.localDB.prepare(
      `INSERT INTO sync_queue 
       (queue_id, table_name, record_id, operation, priority, status, last_error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uuid(),
      'exam_submissions',
      recordId,
      operation,
      priority,
      'pending',
      errorMsg,
      new Date()
    );
  }

  /**
   * Retry failed syncs with exponential backoff
   */
  async retrySyncQueue() {
    const pending = this.localDB.prepare(
      `SELECT * FROM sync_queue 
       WHERE status = ? AND attempted_count < ? 
       ORDER BY priority DESC`
    ).all('pending', this.maxRetries);

    console.log(`[CloudSync] Retrying ${pending.length} failed syncs...`);

    for (const item of pending) {
      try {
        // Exponential backoff: 1s → 2s → 4s → 8s
        const backoffMs = Math.pow(2, item.attempted_count) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffMs));

        if (item.operation === 'upload') {
          await this.uploadExamSubmission(item.record_id, item.record_id);
        } else if (item.operation === 'download') {
          await this.downloadExamFull(item.record_id);
        }

        // Mark as completed
        this.localDB.prepare(
          'UPDATE sync_queue SET status = ? WHERE queue_id = ?'
        ).run('completed', item.queue_id);

        console.log(`[CloudSync] ✅ Retried ${item.operation} for ${item.record_id}`);
      } catch (error) {
        // Update attempt count
        this.localDB.prepare(
          `UPDATE sync_queue 
           SET attempted_count = ?, last_error = ? 
           WHERE queue_id = ?`
        ).run(item.attempted_count + 1, error.message, item.queue_id);

        console.error(`[CloudSync] ❌ Retry failed: ${error.message}`);
      }
    }
  }

  /**
   * Periodic sync of pending items
   */
  startPeriodicSync() {
    setInterval(async () => {
      if (this.isOnline) {
        try {
          await this.retrySyncQueue();
        } catch (error) {
          console.error(`[CloudSync] Periodic sync failed: ${error.message}`);
        }
      }
    }, this.syncInterval);
  }

  // =========================================================================
  // CONNECTION & UTILITY METHODS
  // =========================================================================

  /**
   * Monitor cloud connectivity
   */
  monitorConnection() {
    setInterval(async () => {
      try {
        await this.request('GET', '/health');
        if (!this.isOnline) {
          console.log('[CloudSync] ✅ Connection restored');
          this.isOnline = true;
        }
      } catch (error) {
        if (this.isOnline) {
          console.log('[CloudSync] ⚠️  Connection lost - queuing operations');
          this.isOnline = false;
        }
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * HTTP request wrapper
   */
  async request(method, endpoint, data = null, params = {}) {
    const url = new URL(endpoint, this.baseUrl);
    
    // Add query parameters
    Object.entries(params).forEach(([k, v]) => {
      url.searchParams.set(k, v);
    });

    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Device-ID': this.getDeviceId(),
      'Timestamp': new Date().toISOString()
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : null,
        timeout: 30000
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      throw new CloudSyncError(error.message);
    }
  }

  /**
   * Get or generate device ID (for fingerprinting)
   */
  getDeviceId() {
    let deviceId = this.localDB.prepare(
      'SELECT device_id FROM device_info LIMIT 1'
    ).get();

    if (!deviceId) {
      const crypto = require('crypto');
      const os = require('os');

      deviceId = crypto.createHash('sha256').update(
        os.hostname() + os.platform() + os.arch() + os.cpus().length
      ).digest('hex');

      this.localDB.prepare(
        `INSERT INTO device_info (device_id, device_fingerprint, last_sync)
         VALUES (?, ?, ?)`
      ).run(deviceId, 'fingerprint_data', new Date());
    }

    return deviceId;
  }

  /**
   * Gather evidence files (screenshots, etc.)
   */
  gatherEvidenceFiles(examId, submissionId) {
    const fs = require('fs');
    const path = `/data/uploads/screenshots/${examId}`;

    if (!fs.existsSync(path)) {
      return [];
    }

    const files = fs.readdirSync(path);
    return files.map(file => ({
      name: file,
      path: `${path}/${file}`,
      size: fs.statSync(`${path}/${file}`).size
    }));
  }

  /**
   * Log sync history
   */
  addSyncHistory(syncType, status, recordCount) {
    this.localDB.prepare(
      `INSERT INTO sync_history 
       (sync_id, sync_type, status, record_count, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    ).run(uuid(), syncType, status, recordCount, new Date());
  }
}

module.exports = CloudSyncService;

// =============================================================================
// 2. Integration with existing MonitoringController
// =============================================================================

/**
 * Modified ExamPage.tsx component (React)
 * Shows how to integrate cloud sync with existing exam flow
 */

/*
import React, { useEffect, useState } from 'react';
import { electronAPI } from './preload';

export function ExamPage({ examId, studentId }) {
  const [examData, setExamData] = useState(null);
  const [syncStatus, setSyncStatus] = useState('downloading');

  useEffect(() => {
    downloadExamFromCloud();
  }, [examId]);

  const downloadExamFromCloud = async () => {
    try {
      // Download from cloud
      const data = await electronAPI.cloudSync.downloadExamFull(examId);
      setExamData(data);
      setSyncStatus('ready');
    } catch (error) {
      // Fallback: check local cache
      const cached = await electronAPI.cloudSync.getCachedExam(examId);
      if (cached) {
        setExamData(cached);
        setSyncStatus('offline');
      } else {
        setSyncStatus('error');
      }
    }
  };

  const handleSubmit = async (files) => {
    try {
      setSyncStatus('uploading');

      // Existing submission logic
      await electronAPI.submitExam(examId, files);

      // NEW: Upload to cloud
      const submissionId = await electronAPI.getLastSubmissionId();
      await electronAPI.cloudSync.uploadExamSubmission(examId, submissionId);

      setSyncStatus('uploaded');
    } catch (error) {
      setSyncStatus('queue'); // Queued for retry
    }
  };

  return (
    <div>
      <h1>Exam</h1>
      <div>Status: {syncStatus}</div>
      {/* Rest of component... */}
    </div>
  );
}
*/

// =============================================================================
// 3. Modified Preload Script - Adding Cloud Sync API
// =============================================================================

/*
// Add to backend/app/preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing APIs ...

  // NEW: Cloud Sync API
  cloudSync: {
    downloadExamFull: (examId) => 
      ipcRenderer.invoke('cloud:download-exam-full', examId),
    
    downloadSubmissions: (examId) => 
      ipcRenderer.invoke('cloud:download-submissions', examId),
    
    uploadExamSubmission: (examId, submissionId) => 
      ipcRenderer.invoke('cloud:upload-submission', { examId, submissionId }),
    
    getConnectionStatus: () => 
      ipcRenderer.invoke('cloud:connection-status'),
    
    getSyncQueue: () => 
      ipcRenderer.invoke('cloud:sync-queue'),
    
    downloadClassAnalytics: (examId) => 
      ipcRenderer.invoke('cloud:download-analytics', examId),
    
    // Listen for sync events
    onSyncComplete: (callback) => 
      ipcRenderer.on('cloud:sync-complete', callback),
    
    onSyncError: (callback) => 
      ipcRenderer.on('cloud:sync-error', callback)
  }
});
*/

// =============================================================================
// 4. IPC Handlers in Main Process
// =============================================================================

/*
// Add to backend/app/main.js

// Initialize cloud sync service
const CloudSyncService = require('./services/cloudSyncService');
let cloudSync;

ipcMain.handle('cloud:download-exam-full', async (event, examId) => {
  try {
    const examData = await cloudSync.downloadExamFull(examId);
    mainWindow.webContents.send('cloud:sync-complete', { 
      type: 'exam-download', 
      examId 
    });
    return examData;
  } catch (error) {
    mainWindow.webContents.send('cloud:sync-error', { 
      error: error.message 
    });
    throw error;
  }
});

ipcMain.handle('cloud:upload-submission', async (event, { examId, submissionId }) => {
  try {
    const result = await cloudSync.uploadExamSubmission(examId, submissionId);
    mainWindow.webContents.send('cloud:sync-complete', { 
      type: 'submission-upload', 
      submissionId 
    });
    return result;
  } catch (error) {
    mainWindow.webContents.send('cloud:sync-error', { 
      error: error.message 
    });
    throw error;
  }
});

ipcMain.handle('cloud:download-submissions', async (event, examId) => {
  try {
    const submissions = await cloudSync.downloadSubmissions(examId);
    return submissions;
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('cloud:connection-status', () => {
  return cloudSync.isOnline ? 'online' : 'offline';
});

ipcMain.handle('cloud:sync-queue', () => {
  return cloudSync.getSyncQueueStatus();
});

// Start periodic sync on app launch
cloudSync = new CloudSyncService(
  process.env.CLOUD_DB_URL || 'http://localhost:5000',
  process.env.CLOUD_API_KEY,
  databaseService.getDB()
);
cloudSync.startPeriodicSync();
*/

// =============================================================================
// 5. Error Class
// =============================================================================

class CloudSyncError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CloudSyncError';
  }
}

module.exports = { CloudSyncService, CloudSyncError };
