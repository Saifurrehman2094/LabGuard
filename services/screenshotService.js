const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

/**
 * ScreenshotService - Handles screenshot capture for violation evidence
 * Implements comprehensive error handling and fallback mechanisms
 */
class ScreenshotService {
    constructor(storageBasePath = 'data/screenshots') {
        this.storageBasePath = storageBasePath;
        this.logger = console; // Will be replaced with proper logger
        this.minDiskSpaceMB = 100; // Minimum disk space required in MB
    }

    /**
     * Capture screenshot of active window with comprehensive error handling
     * @param {string} examId - Exam identifier
     * @param {string} studentId - Student identifier  
     * @param {string} appName - Application name for filename
     * @returns {Promise<{success: boolean, filePath?: string, error?: string}>}
     */
    async captureActiveWindow(examId, studentId, appName) {
        try {
            // Check disk space before attempting capture
            const diskSpaceCheck = await this.checkDiskSpace();
            if (!diskSpaceCheck.hasSpace) {
                const error = `Insufficient disk space: ${diskSpaceCheck.availableMB}MB available, ${this.minDiskSpaceMB}MB required`;
                this.logger.error('Screenshot capture failed:', error);
                return { success: false, error };
            }

            // Ensure directory structure exists
            const screenshotDir = await this.ensureDirectoryStructure(examId, studentId);

            // Generate unique filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const sanitizedAppName = this.sanitizeFilename(appName);
            const filename = `violation-${timestamp}-${sanitizedAppName}.png`;
            const filePath = path.join(screenshotDir, filename);

            // Attempt screenshot capture with multiple fallback methods
            const captureResult = await this.attemptScreenshotCapture(filePath);

            if (captureResult.success) {
                this.logger.info(`Screenshot captured successfully: ${filePath}`);
                return { success: true, filePath };
            } else {
                this.logger.error('Screenshot capture failed:', captureResult.error);
                return { success: false, error: captureResult.error };
            }

        } catch (error) {
            const errorMessage = `Screenshot capture failed with unexpected error: ${error.message}`;
            this.logger.error(errorMessage, error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Check available disk space before screenshot capture
     * @returns {Promise<{hasSpace: boolean, availableMB: number}>}
     */
    async checkDiskSpace() {
        try {
            // Get disk space for the storage path
            const stats = await fs.stat(this.storageBasePath).catch(() => null);

            if (!stats) {
                // If directory doesn't exist, check parent directory
                const parentDir = path.dirname(this.storageBasePath);
                await fs.stat(parentDir);
            }

            // Use Windows dir command to check disk space
            const drive = path.parse(path.resolve(this.storageBasePath)).root;
            const output = execSync(`dir /-c "${drive}"`, { encoding: 'utf8' });

            // Parse the output to get free space
            const freeSpaceMatch = output.match(/(\d+) bytes free/);
            if (freeSpaceMatch) {
                const freeBytes = parseInt(freeSpaceMatch[1]);
                const freeMB = Math.floor(freeBytes / (1024 * 1024));
                return {
                    hasSpace: freeMB >= this.minDiskSpaceMB,
                    availableMB: freeMB
                };
            }

            // Fallback: assume we have space if we can't determine
            this.logger.warn('Could not determine disk space, assuming sufficient space available');
            return { hasSpace: true, availableMB: -1 };

        } catch (error) {
            this.logger.warn('Disk space check failed, assuming sufficient space:', error.message);
            return { hasSpace: true, availableMB: -1 };
        }
    }

    /**
     * Attempt screenshot capture using multiple methods with fallbacks
     * @param {string} filePath - Target file path for screenshot
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async attemptScreenshotCapture(filePath) {
        const methods = [
            () => this.captureWithPowerShell(filePath),
            () => this.captureWithNirCmd(filePath),
            () => this.captureWithPrintScreen(filePath)
        ];

        let lastError = null;

        for (const method of methods) {
            try {
                const result = await method();
                if (result.success) {
                    return result;
                }
                lastError = result.error;
            } catch (error) {
                lastError = error.message;
                this.logger.warn(`Screenshot method failed, trying next method:`, error.message);
            }
        }

        return {
            success: false,
            error: `All screenshot methods failed. Last error: ${lastError}`
        };
    }

    /**
     * Capture screenshot using PowerShell (primary method)
     * @param {string} filePath - Target file path
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async captureWithPowerShell(filePath) {
        try {
            const powershellScript = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        
        # Get the active window
        $activeWindow = [System.Windows.Forms.Form]::ActiveForm
        if ($null -eq $activeWindow) {
          # Fallback to screen capture if no active form
          $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        } else {
          $bounds = $activeWindow.Bounds
        }
        
        # Create bitmap and capture
        $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
        
        # Save to file
        $bitmap.Save("${filePath}", [System.Drawing.Imaging.ImageFormat]::Png)
        
        # Cleanup
        $graphics.Dispose()
        $bitmap.Dispose()
        
        Write-Output "SUCCESS"
      `;

            const result = execSync(`powershell -Command "${powershellScript.replace(/"/g, '\\"')}"`, {
                encoding: 'utf8',
                timeout: 10000 // 10 second timeout
            });

            if (result.includes('SUCCESS')) {
                // Verify file was created
                const stats = await fs.stat(filePath);
                if (stats.size > 0) {
                    return { success: true };
                }
            }

            return { success: false, error: 'PowerShell screenshot failed or produced empty file' };

        } catch (error) {
            return { success: false, error: `PowerShell screenshot failed: ${error.message}` };
        }
    }

    /**
     * Capture screenshot using NirCmd (fallback method)
     * @param {string} filePath - Target file path
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async captureWithNirCmd(filePath) {
        try {
            // NirCmd is a third-party tool, this is a fallback if available
            execSync(`nircmd savescreenshot "${filePath}"`, {
                timeout: 5000,
                stdio: 'ignore'
            });

            // Verify file was created
            const stats = await fs.stat(filePath);
            if (stats.size > 0) {
                return { success: true };
            }

            return { success: false, error: 'NirCmd screenshot produced empty file' };

        } catch (error) {
            return { success: false, error: `NirCmd screenshot failed: ${error.message}` };
        }
    }

    /**
     * Capture screenshot using Windows built-in tools (last resort)
     * @param {string} filePath - Target file path
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async captureWithPrintScreen(filePath) {
        try {
            // This is a basic fallback that simulates print screen
            // In a real implementation, this would use Windows GDI+ APIs
            const script = `
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait("%{PRTSC}")
        Start-Sleep -Milliseconds 500
      `;

            execSync(`powershell -Command "${script}"`, {
                timeout: 5000,
                stdio: 'ignore'
            });

            // This method doesn't directly save to file, so we return a controlled failure
            return { success: false, error: 'Print screen method requires clipboard handling (not implemented)' };

        } catch (error) {
            return { success: false, error: `Print screen screenshot failed: ${error.message}` };
        }
    }

    /**
     * Ensure directory structure exists for screenshots
     * @param {string} examId - Exam identifier
     * @param {string} studentId - Student identifier
     * @returns {Promise<string>} Directory path
     */
    async ensureDirectoryStructure(examId, studentId) {
        const examDir = path.join(this.storageBasePath, `exam-${examId}`);
        const studentDir = path.join(examDir, `student-${studentId}`);

        try {
            await fs.mkdir(studentDir, { recursive: true });
            return studentDir;
        } catch (error) {
            throw new Error(`Failed to create screenshot directory: ${error.message}`);
        }
    }

    /**
     * Sanitize filename to remove invalid characters
     * @param {string} filename - Original filename
     * @returns {string} Sanitized filename
     */
    sanitizeFilename(filename) {
        return filename
            .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters
            .replace(/\s+/g, '_') // Replace spaces with underscores
            .substring(0, 50); // Limit length
    }

    /**
     * Get screenshot path for a given exam, student, and timestamp
     * @param {string} examId - Exam identifier
     * @param {string} studentId - Student identifier
     * @param {string} timestamp - Timestamp for filename
     * @returns {string} Full file path
     */
    getScreenshotPath(examId, studentId, timestamp) {
        const examDir = path.join(this.storageBasePath, `exam-${examId}`);
        const studentDir = path.join(examDir, `student-${studentId}`);
        return path.join(studentDir, `violation-${timestamp}.png`);
    }

    /**
     * Clean up old screenshots for an exam
     * @param {string} examId - Exam identifier
     * @param {number} maxAgeHours - Maximum age in hours (default 24)
     */
    async cleanupOldScreenshots(examId, maxAgeHours = 24) {
        try {
            const examDir = path.join(this.storageBasePath, `exam-${examId}`);
            const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);

            const examDirExists = await fs.access(examDir).then(() => true).catch(() => false);
            if (!examDirExists) {
                return;
            }

            const studentDirs = await fs.readdir(examDir);

            for (const studentDir of studentDirs) {
                const studentPath = path.join(examDir, studentDir);
                const files = await fs.readdir(studentPath);

                for (const file of files) {
                    const filePath = path.join(studentPath, file);
                    const stats = await fs.stat(filePath);

                    if (stats.mtime.getTime() < cutoffTime) {
                        await fs.unlink(filePath);
                        this.logger.info(`Cleaned up old screenshot: ${filePath}`);
                    }
                }
            }
        } catch (error) {
            this.logger.error('Screenshot cleanup failed:', error.message);
        }
    }

    /**
     * Validate screenshot file integrity
     * @param {string} filePath - Path to screenshot file
     * @returns {Promise<{valid: boolean, error?: string}>}
     */
    async validateScreenshot(filePath) {
        try {
            const stats = await fs.stat(filePath);

            if (stats.size === 0) {
                return { valid: false, error: 'Screenshot file is empty' };
            }

            if (stats.size < 1000) { // Less than 1KB is suspicious for a PNG
                return { valid: false, error: 'Screenshot file is too small' };
            }

            // Check if file is a valid PNG by reading header
            const buffer = Buffer.alloc(8);
            const fileHandle = await fs.open(filePath, 'r');
            await fileHandle.read(buffer, 0, 8, 0);
            await fileHandle.close();

            // PNG signature: 89 50 4E 47 0D 0A 1A 0A
            const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

            if (!buffer.equals(pngSignature)) {
                return { valid: false, error: 'File is not a valid PNG image' };
            }

            return { valid: true };

        } catch (error) {
            return { valid: false, error: `Screenshot validation failed: ${error.message}` };
        }
    }
}

module.exports = ScreenshotService;