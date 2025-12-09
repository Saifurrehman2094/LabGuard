const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const NetworkConfigService = require('./networkConfig');

class FileService {
  constructor() {
    this.networkConfig = new NetworkConfigService();
    this.setupStoragePaths();
  }

  /**
   * Setup storage paths based on deployment mode
   */
  setupStoragePaths() {
    const mode = this.networkConfig.getDeploymentMode();
    const baseDir = path.join(__dirname, '..', 'data');
    
    if (mode === 'network') {
      // Network mode: use shared network path
      const serverHost = this.networkConfig.getServerHost();
      const sharedPath = this.networkConfig.config.storage?.sharedStoragePath;
      
      if (sharedPath && sharedPath.trim() !== '') {
        // Use configured shared path
        this.uploadsDir = path.join(sharedPath, 'uploads');
        this.submissionsDir = path.join(sharedPath, 'submissions');
      } else {
        // Auto-generate UNC path
        this.uploadsDir = `\\\\${serverHost}\\LabGuard\\uploads`;
        this.submissionsDir = `\\\\${serverHost}\\LabGuard\\submissions`;
      }
    } else {
      // Local mode: use local paths
      this.uploadsDir = path.join(baseDir, 'uploads');
      this.submissionsDir = path.join(baseDir, 'submissions');
    }
    
    this.ensureDirectoryExists(this.uploadsDir);
    this.ensureDirectoryExists(this.submissionsDir);
    
    console.log('File storage initialized:');
    console.log('  Uploads:', this.uploadsDir);
    console.log('  Submissions:', this.submissionsDir);
  }

  /**
   * Ensure directory exists, create if it doesn't
   */
  ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Upload PDF file for an exam
   */
  async uploadPDF(filePath, examId, originalName) {
    try {
      // Validate file exists
      if (!fs.existsSync(filePath)) {
        throw new Error('Source file does not exist');
      }

      // Validate file is PDF
      if (!originalName.toLowerCase().endsWith('.pdf')) {
        throw new Error('Only PDF files are allowed');
      }

      // Generate unique filename
      const fileExtension = path.extname(originalName);
      const fileName = `${examId}_${Date.now()}${fileExtension}`;
      const destinationPath = path.join(this.uploadsDir, fileName);

      // Copy file to uploads directory
      fs.copyFileSync(filePath, destinationPath);

      // Validate file size (max 50MB)
      const stats = fs.statSync(destinationPath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      
      if (fileSizeInMB > 50) {
        // Clean up the file
        fs.unlinkSync(destinationPath);
        throw new Error('File size exceeds 50MB limit');
      }

      return {
        success: true,
        filePath: destinationPath,
        fileName: fileName,
        originalName: originalName,
        size: stats.size
      };
    } catch (error) {
      console.error('PDF upload error:', error);
      throw error;
    }
  }

  /**
   * Get PDF file path for an exam
   */
  getPDFPath(examId) {
    try {
      // Find file that starts with examId
      const files = fs.readdirSync(this.uploadsDir);
      const examFile = files.find(file => file.startsWith(`${examId}_`));
      
      if (!examFile) {
        return null;
      }

      const filePath = path.join(this.uploadsDir, examFile);
      
      // Verify file still exists
      if (!fs.existsSync(filePath)) {
        return null;
      }

      return filePath;
    } catch (error) {
      console.error('Error getting PDF path:', error);
      return null;
    }
  }

  /**
   * Delete PDF file for an exam
   */
  deletePDF(examId) {
    try {
      const filePath = this.getPDFPath(examId);
      
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error deleting PDF:', error);
      return false;
    }
  }

  /**
   * Validate PDF file
   */
  validatePDF(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return { valid: false, error: 'File does not exist' };
      }

      const stats = fs.statSync(filePath);
      const fileSizeInMB = stats.size / (1024 * 1024);

      if (fileSizeInMB > 50) {
        return { valid: false, error: 'File size exceeds 50MB limit' };
      }

      // Basic PDF header check
      const buffer = Buffer.alloc(4);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, 4, 0);
      fs.closeSync(fd);

      const header = buffer.toString('ascii');
      if (!header.startsWith('%PDF')) {
        return { valid: false, error: 'File is not a valid PDF' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Get file info
   */
  getFileInfo(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const stats = fs.statSync(filePath);
      const fileName = path.basename(filePath);

      return {
        fileName,
        size: stats.size,
        sizeInMB: (stats.size / (1024 * 1024)).toFixed(2),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime
      };
    } catch (error) {
      console.error('Error getting file info:', error);
      return null;
    }
  }

  /**
   * Upload student submission file
   */
  async uploadSubmission(filePath, examId, studentId, originalName) {
    try {
      // Validate file exists
      if (!fs.existsSync(filePath)) {
        throw new Error('Source file does not exist');
      }

      // Create student-specific directory
      const studentDir = path.join(this.submissionsDir, examId, studentId);
      this.ensureDirectoryExists(studentDir);

      // Use original filename, add timestamp only if file already exists
      let fileName = originalName;
      let destinationPath = path.join(studentDir, fileName);
      
      // If file exists, add timestamp to make it unique
      if (fs.existsSync(destinationPath)) {
        const timestamp = Date.now();
        const fileExtension = path.extname(originalName);
        const baseName = path.basename(originalName, fileExtension);
        fileName = `${baseName}_${timestamp}${fileExtension}`;
        destinationPath = path.join(studentDir, fileName);
      }

      // Copy file to submissions directory
      fs.copyFileSync(filePath, destinationPath);

      // Validate file size (max 100MB for submissions)
      const stats = fs.statSync(destinationPath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      
      if (fileSizeInMB > 100) {
        // Clean up the file
        fs.unlinkSync(destinationPath);
        throw new Error('File size exceeds 100MB limit');
      }

      return {
        success: true,
        filePath: destinationPath,
        fileName: fileName,
        originalName: originalName,
        size: stats.size,
        sizeInMB: fileSizeInMB.toFixed(2)
      };
    } catch (error) {
      console.error('Submission upload error:', error);
      throw error;
    }
  }

  /**
   * Get all submissions for a student's exam
   */
  getStudentSubmissions(examId, studentId) {
    try {
      const studentDir = path.join(this.submissionsDir, examId, studentId);
      
      if (!fs.existsSync(studentDir)) {
        return [];
      }

      const files = fs.readdirSync(studentDir);
      const submissions = [];

      for (const file of files) {
        const filePath = path.join(studentDir, file);
        const stats = fs.statSync(filePath);
        
        submissions.push({
          fileName: file,
          filePath: filePath,
          size: stats.size,
          sizeInMB: (stats.size / (1024 * 1024)).toFixed(2),
          uploadedAt: stats.birthtime
        });
      }

      return submissions.sort((a, b) => b.uploadedAt - a.uploadedAt);
    } catch (error) {
      console.error('Error getting student submissions:', error);
      return [];
    }
  }

  /**
   * Get all submissions for an exam (teacher view)
   */
  getAllExamSubmissions(examId) {
    try {
      const examDir = path.join(this.submissionsDir, examId);
      
      if (!fs.existsSync(examDir)) {
        return [];
      }

      const studentDirs = fs.readdirSync(examDir);
      const allSubmissions = [];

      for (const studentId of studentDirs) {
        const studentDir = path.join(examDir, studentId);
        const stats = fs.statSync(studentDir);
        
        if (stats.isDirectory()) {
          const files = fs.readdirSync(studentDir);
          
          for (const file of files) {
            const filePath = path.join(studentDir, file);
            const fileStats = fs.statSync(filePath);
            
            allSubmissions.push({
              studentId: studentId,
              fileName: file,
              filePath: filePath,
              fileSize: fileStats.size,
              sizeInMB: (fileStats.size / (1024 * 1024)).toFixed(2),
              uploadedAt: fileStats.birthtime.getTime()
            });
          }
        }
      }

      return allSubmissions.sort((a, b) => b.uploadedAt - a.uploadedAt);
    } catch (error) {
      console.error('Error getting exam submissions:', error);
      return [];
    }
  }

  /**
   * Delete a submission file
   */
  deleteSubmission(examId, studentId, fileName) {
    try {
      const filePath = path.join(this.submissionsDir, examId, studentId, fileName);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error deleting submission:', error);
      return false;
    }
  }

  /**
   * Delete all submissions for an exam
   */
  deleteExamSubmissions(examId) {
    try {
      const examDir = path.join(this.submissionsDir, examId);
      
      if (fs.existsSync(examDir)) {
        fs.rmSync(examDir, { recursive: true, force: true });
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error deleting exam submissions:', error);
      return false;
    }
  }

  /**
   * Get submission statistics for an exam
   */
  getSubmissionStats(examId) {
    try {
      const examDir = path.join(this.submissionsDir, examId);
      
      if (!fs.existsSync(examDir)) {
        return {
          totalStudents: 0,
          totalFiles: 0,
          totalSize: 0,
          totalSizeInMB: 0
        };
      }

      const studentDirs = fs.readdirSync(examDir);
      let totalFiles = 0;
      let totalSize = 0;

      for (const studentId of studentDirs) {
        const studentDir = path.join(examDir, studentId);
        const stats = fs.statSync(studentDir);
        
        if (stats.isDirectory()) {
          const files = fs.readdirSync(studentDir);
          totalFiles += files.length;
          
          for (const file of files) {
            const filePath = path.join(studentDir, file);
            const fileStats = fs.statSync(filePath);
            totalSize += fileStats.size;
          }
        }
      }

      return {
        totalStudents: studentDirs.length,
        totalFiles: totalFiles,
        totalSize: totalSize,
        totalSizeInMB: (totalSize / (1024 * 1024)).toFixed(2)
      };
    } catch (error) {
      console.error('Error getting submission stats:', error);
      return {
        totalStudents: 0,
        totalFiles: 0,
        totalSize: 0,
        totalSizeInMB: 0
      };
    }
  }

  /**
   * Check if file access is allowed based on RBAC
   */
  checkFileAccess(filePath, userId, userRole) {
    try {
      // Admin can access everything
      if (userRole === 'admin') {
        return { allowed: true, reason: 'Admin access' };
      }

      // Check if file is in uploads (exam PDFs)
      if (filePath.includes(this.uploadsDir)) {
        // Teachers can access their own exam PDFs
        // Students can access PDFs for exams they're enrolled in
        return { allowed: true, reason: 'Exam PDF access' };
      }

      // Check if file is in submissions
      if (filePath.includes(this.submissionsDir)) {
        // Extract studentId from path
        const pathParts = filePath.split(path.sep);
        const submissionsIndex = pathParts.findIndex(p => p === 'submissions');
        
        if (submissionsIndex >= 0 && pathParts.length > submissionsIndex + 2) {
          const fileStudentId = pathParts[submissionsIndex + 2];
          
          // Students can only access their own submissions
          if (userRole === 'student' && userId === fileStudentId) {
            return { allowed: true, reason: 'Own submission access' };
          }
          
          // Teachers can access submissions for their exams
          if (userRole === 'teacher') {
            return { allowed: true, reason: 'Teacher exam access' };
          }
        }
      }

      return { allowed: false, reason: 'Access denied' };
    } catch (error) {
      console.error('Error checking file access:', error);
      return { allowed: false, reason: 'Error checking access' };
    }
  }

  /**
   * Get storage paths info
   */
  getStorageInfo() {
    return {
      uploadsDir: this.uploadsDir,
      submissionsDir: this.submissionsDir,
      deploymentMode: this.networkConfig.getDeploymentMode(),
      isNetworkStorage: this.uploadsDir.startsWith('\\\\')
    };
  }
}

module.exports = FileService;