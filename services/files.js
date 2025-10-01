const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class FileService {
  constructor() {
    this.uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
    this.ensureDirectoryExists(this.uploadsDir);
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
}

module.exports = FileService;