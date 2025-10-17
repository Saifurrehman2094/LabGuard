const ScreenshotService = require('../../services/screenshotService');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Mock dependencies
jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn(),
        stat: jest.fn(),
        access: jest.fn(),
        readdir: jest.fn(),
        unlink: jest.fn(),
        open: jest.fn(),
    }
}));

jest.mock('child_process', () => ({
    execSync: jest.fn()
}));

jest.mock('path', () => ({
    ...jest.requireActual('path'),
    join: jest.fn((...args) => args.join('/')),
    dirname: jest.fn((p) => p.split('/').slice(0, -1).join('/')),
    parse: jest.fn((p) => ({ root: 'C:\\' })),
    resolve: jest.fn((p) => p)
}));

describe('ScreenshotService Error Handling', () => {
    let screenshotService;
    let mockLogger;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        };

        screenshotService = new ScreenshotService('test/screenshots');
        screenshotService.logger = mockLogger;

        // Reset all mocks
        jest.clearAllMocks();
    });

    describe('Disk Space Checking', () => {
        test('should detect insufficient disk space', async () => {
            // Mock low disk space scenario
            fs.stat.mockResolvedValue({ isDirectory: () => true });
            execSync.mockReturnValue('50000000 bytes free'); // ~50MB - less than required 100MB

            const result = await screenshotService.checkDiskSpace();

            expect(result.hasSpace).toBe(false);
            expect(result.availableMB).toBe(47); // 50MB / 1024 / 1024 = ~47MB
        });

        test('should handle disk space check failures gracefully', async () => {
            // Mock disk space check failure
            fs.stat.mockRejectedValue(new Error('Access denied'));
            execSync.mockImplementation(() => {
                throw new Error('Command failed');
            });

            const result = await screenshotService.checkDiskSpace();

            expect(result.hasSpace).toBe(true); // Should assume space available on failure
            expect(result.availableMB).toBe(-1);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Disk space check failed'),
                expect.any(String)
            );
        });

        test('should detect sufficient disk space', async () => {
            // Mock sufficient disk space
            fs.stat.mockResolvedValue({ isDirectory: () => true });
            execSync.mockReturnValue('500000000 bytes free'); // ~500MB

            const result = await screenshotService.checkDiskSpace();

            expect(result.hasSpace).toBe(true);
            expect(result.availableMB).toBe(476); // 500MB / 1024 / 1024 = ~476MB
        });
    });

    describe('Screenshot Capture Error Handling', () => {
        test('should fail gracefully when disk space is insufficient', async () => {
            // Mock insufficient disk space
            jest.spyOn(screenshotService, 'checkDiskSpace').mockResolvedValue({
                hasSpace: false,
                availableMB: 50
            });

            const result = await screenshotService.captureActiveWindow('exam1', 'student1', 'notepad.exe');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Insufficient disk space');
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Screenshot capture failed:',
                expect.stringContaining('Insufficient disk space')
            );
        });

        test('should handle directory creation failures', async () => {
            // Mock sufficient disk space but directory creation failure
            jest.spyOn(screenshotService, 'checkDiskSpace').mockResolvedValue({
                hasSpace: true,
                availableMB: 200
            });

            fs.mkdir.mockRejectedValue(new Error('Permission denied'));

            const result = await screenshotService.captureActiveWindow('exam1', 'student1', 'notepad.exe');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to create screenshot directory');
        });

        test('should try multiple screenshot methods on failure', async () => {
            // Mock successful disk space and directory creation
            jest.spyOn(screenshotService, 'checkDiskSpace').mockResolvedValue({
                hasSpace: true,
                availableMB: 200
            });

            fs.mkdir.mockResolvedValue();

            // Mock all screenshot methods failing
            jest.spyOn(screenshotService, 'captureWithPowerShell').mockResolvedValue({
                success: false,
                error: 'PowerShell failed'
            });

            jest.spyOn(screenshotService, 'captureWithNirCmd').mockResolvedValue({
                success: false,
                error: 'NirCmd failed'
            });

            jest.spyOn(screenshotService, 'captureWithPrintScreen').mockResolvedValue({
                success: false,
                error: 'PrintScreen failed'
            });

            const result = await screenshotService.captureActiveWindow('exam1', 'student1', 'notepad.exe');

            expect(result.success).toBe(false);
            expect(result.error).toContain('All screenshot methods failed');
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Screenshot capture failed:',
                expect.stringContaining('All screenshot methods failed')
            );
        });

        test('should succeed when first method works', async () => {
            // Mock successful scenario
            jest.spyOn(screenshotService, 'checkDiskSpace').mockResolvedValue({
                hasSpace: true,
                availableMB: 200
            });

            fs.mkdir.mockResolvedValue();

            // Mock the attemptScreenshotCapture method to return success
            jest.spyOn(screenshotService, 'attemptScreenshotCapture').mockResolvedValue({
                success: true
            });

            const result = await screenshotService.captureActiveWindow('exam1', 'student1', 'notepad.exe');

            expect(result.success).toBe(true);
            expect(result.filePath).toContain('violation-');
            expect(result.filePath).toContain('notepad.exe.png');
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Screenshot captured successfully')
            );
        });
    });

    describe('PowerShell Screenshot Method', () => {
        test('should handle PowerShell execution failures', async () => {
            execSync.mockImplementation(() => {
                throw new Error('PowerShell not found');
            });

            const result = await screenshotService.captureWithPowerShell('test.png');

            expect(result.success).toBe(false);
            expect(result.error).toContain('PowerShell screenshot failed');
        });

        test('should handle empty file creation', async () => {
            execSync.mockReturnValue('SUCCESS');
            fs.stat.mockResolvedValue({ size: 0 }); // Empty file

            const result = await screenshotService.captureWithPowerShell('test.png');

            expect(result.success).toBe(false);
            expect(result.error).toContain('empty file');
        });

        test('should succeed with valid output', async () => {
            execSync.mockReturnValue('SUCCESS');
            fs.stat.mockResolvedValue({ size: 5000 }); // Valid file size

            const result = await screenshotService.captureWithPowerShell('test.png');

            expect(result.success).toBe(true);
        });
    });

    describe('File Validation', () => {
        test('should detect empty screenshot files', async () => {
            fs.stat.mockResolvedValue({ size: 0 });

            const result = await screenshotService.validateScreenshot('test.png');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('empty');
        });

        test('should detect files that are too small', async () => {
            fs.stat.mockResolvedValue({ size: 500 }); // Too small

            const result = await screenshotService.validateScreenshot('test.png');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('too small');
        });

        test('should validate PNG signature', async () => {
            fs.stat.mockResolvedValue({ size: 5000 });

            const mockFileHandle = {
                read: jest.fn().mockResolvedValue(),
                close: jest.fn().mockResolvedValue()
            };

            fs.open.mockResolvedValue(mockFileHandle);

            // Mock reading PNG signature
            mockFileHandle.read.mockImplementation((buffer) => {
                // Write PNG signature to buffer
                const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
                pngSignature.copy(buffer);
            });

            const result = await screenshotService.validateScreenshot('test.png');

            expect(result.valid).toBe(true);
        });

        test('should detect invalid PNG files', async () => {
            fs.stat.mockResolvedValue({ size: 5000 });

            const mockFileHandle = {
                read: jest.fn().mockResolvedValue(),
                close: jest.fn().mockResolvedValue()
            };

            fs.open.mockResolvedValue(mockFileHandle);

            // Mock reading invalid signature
            mockFileHandle.read.mockImplementation((buffer) => {
                buffer.fill(0); // Invalid signature
            });

            const result = await screenshotService.validateScreenshot('test.png');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('not a valid PNG');
        });
    });

    describe('Filename Sanitization', () => {
        test('should sanitize invalid characters', () => {
            const result = screenshotService.sanitizeFilename('app<>:"/\\|?*.exe');
            expect(result).toBe('app_________.exe');
        });

        test('should replace spaces with underscores', () => {
            const result = screenshotService.sanitizeFilename('My App Name.exe');
            expect(result).toBe('My_App_Name.exe');
        });

        test('should limit filename length', () => {
            const longName = 'a'.repeat(100) + '.exe';
            const result = screenshotService.sanitizeFilename(longName);
            expect(result.length).toBeLessThanOrEqual(50);
        });
    });

    describe('File Naming and Storage Organization (Requirement 2.2)', () => {
        test('should create unique filenames with timestamps and app names', async () => {
            // Mock successful scenario
            jest.spyOn(screenshotService, 'checkDiskSpace').mockResolvedValue({
                hasSpace: true,
                availableMB: 200
            });

            fs.mkdir.mockResolvedValue();
            jest.spyOn(screenshotService, 'attemptScreenshotCapture').mockResolvedValue({
                success: true
            });

            const result = await screenshotService.captureActiveWindow('exam123', 'student456', 'notepad.exe');

            expect(result.success).toBe(true);
            expect(result.filePath).toMatch(/violation-.*-notepad\.exe\.png$/);
            expect(result.filePath).toContain('test/screenshots/exam-exam123/student-student456');
        });

        test('should organize files by exam and student directory structure', async () => {
            // Mock successful scenario
            jest.spyOn(screenshotService, 'checkDiskSpace').mockResolvedValue({
                hasSpace: true,
                availableMB: 200
            });

            fs.mkdir.mockResolvedValue();
            jest.spyOn(screenshotService, 'attemptScreenshotCapture').mockResolvedValue({
                success: true
            });

            await screenshotService.captureActiveWindow('exam123', 'student456', 'notepad.exe');

            expect(fs.mkdir).toHaveBeenCalledWith(
                'test/screenshots/exam-exam123/student-student456',
                { recursive: true }
            );
        });

        test('should sanitize app names in filenames', async () => {
            // Mock successful scenario
            jest.spyOn(screenshotService, 'checkDiskSpace').mockResolvedValue({
                hasSpace: true,
                availableMB: 200
            });

            fs.mkdir.mockResolvedValue();
            jest.spyOn(screenshotService, 'attemptScreenshotCapture').mockResolvedValue({
                success: true
            });

            const result = await screenshotService.captureActiveWindow('exam123', 'student456', 'My App<>:"/\\|?*.exe');

            expect(result.success).toBe(true);
            expect(result.filePath).toContain('My_App_________.exe');
        });

        test('should generate correct screenshot path structure', () => {
            const timestamp = '2024-01-15T10-30-45-123Z';
            const result = screenshotService.getScreenshotPath('exam123', 'student456', timestamp);

            expect(result).toBe('test/screenshots/exam-exam123/student-student456/violation-2024-01-15T10-30-45-123Z.png');
        });
    });

    describe('Screenshot Capture Failure Handling (Requirement 2.4)', () => {
        test('should return failure result when all capture methods fail', async () => {
            // Mock successful disk space and directory creation
            jest.spyOn(screenshotService, 'checkDiskSpace').mockResolvedValue({
                hasSpace: true,
                availableMB: 200
            });

            fs.mkdir.mockResolvedValue();

            // Mock all screenshot methods failing
            jest.spyOn(screenshotService, 'captureWithPowerShell').mockResolvedValue({
                success: false,
                error: 'PowerShell failed'
            });

            jest.spyOn(screenshotService, 'captureWithNirCmd').mockResolvedValue({
                success: false,
                error: 'NirCmd failed'
            });

            jest.spyOn(screenshotService, 'captureWithPrintScreen').mockResolvedValue({
                success: false,
                error: 'PrintScreen failed'
            });

            const result = await screenshotService.captureActiveWindow('exam1', 'student1', 'notepad.exe');

            expect(result.success).toBe(false);
            expect(result.error).toContain('All screenshot methods failed');
            expect(result.filePath).toBeUndefined();
        });

        test('should handle Windows API permission errors', async () => {
            jest.spyOn(screenshotService, 'checkDiskSpace').mockResolvedValue({
                hasSpace: true,
                availableMB: 200
            });

            fs.mkdir.mockResolvedValue();

            execSync.mockImplementation(() => {
                throw new Error('Access is denied');
            });

            const result = await screenshotService.captureWithPowerShell('test.png');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Access is denied');
        });

        test('should handle timeout errors during screenshot capture', async () => {
            jest.spyOn(screenshotService, 'checkDiskSpace').mockResolvedValue({
                hasSpace: true,
                availableMB: 200
            });

            fs.mkdir.mockResolvedValue();

            execSync.mockImplementation(() => {
                throw new Error('Command timed out');
            });

            const result = await screenshotService.captureWithPowerShell('test.png');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Command timed out');
        });

        test('should handle file system write errors', async () => {
            jest.spyOn(screenshotService, 'checkDiskSpace').mockResolvedValue({
                hasSpace: true,
                availableMB: 200
            });

            fs.mkdir.mockRejectedValue(new Error('Read-only file system'));

            const result = await screenshotService.captureActiveWindow('exam1', 'student1', 'notepad.exe');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to create screenshot directory');
        });
    });

    describe('Screenshot Method Fallback Testing', () => {
        test('should try NirCmd when PowerShell fails', async () => {
            jest.spyOn(screenshotService, 'checkDiskSpace').mockResolvedValue({
                hasSpace: true,
                availableMB: 200
            });

            fs.mkdir.mockResolvedValue();

            // PowerShell fails, NirCmd succeeds
            jest.spyOn(screenshotService, 'captureWithPowerShell').mockResolvedValue({
                success: false,
                error: 'PowerShell failed'
            });

            jest.spyOn(screenshotService, 'captureWithNirCmd').mockResolvedValue({
                success: true
            });

            const result = await screenshotService.captureActiveWindow('exam1', 'student1', 'notepad.exe');

            expect(result.success).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Screenshot captured successfully')
            );
        });

        test('should try PrintScreen when PowerShell and NirCmd fail', async () => {
            jest.spyOn(screenshotService, 'checkDiskSpace').mockResolvedValue({
                hasSpace: true,
                availableMB: 200
            });

            fs.mkdir.mockResolvedValue();

            // First two methods fail, third succeeds
            jest.spyOn(screenshotService, 'captureWithPowerShell').mockResolvedValue({
                success: false,
                error: 'PowerShell failed'
            });

            jest.spyOn(screenshotService, 'captureWithNirCmd').mockResolvedValue({
                success: false,
                error: 'NirCmd failed'
            });

            jest.spyOn(screenshotService, 'captureWithPrintScreen').mockResolvedValue({
                success: true
            });

            const result = await screenshotService.captureActiveWindow('exam1', 'student1', 'notepad.exe');

            expect(result.success).toBe(true);
        });
    });

    describe('NirCmd Screenshot Method', () => {
        test('should handle NirCmd not being available', async () => {
            execSync.mockImplementation(() => {
                throw new Error('nircmd is not recognized as an internal or external command');
            });

            const result = await screenshotService.captureWithNirCmd('test.png');

            expect(result.success).toBe(false);
            expect(result.error).toContain('NirCmd screenshot failed');
        });

        test('should handle NirCmd timeout', async () => {
            execSync.mockImplementation(() => {
                throw new Error('Command timed out');
            });

            const result = await screenshotService.captureWithNirCmd('test.png');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Command timed out');
        });

        test('should succeed with valid NirCmd execution', async () => {
            execSync.mockReturnValue(''); // NirCmd typically returns empty on success
            fs.stat.mockResolvedValue({ size: 5000 });

            const result = await screenshotService.captureWithNirCmd('test.png');

            expect(result.success).toBe(true);
        });
    });

    describe('Cleanup Operations', () => {
        test('should handle cleanup when directory does not exist', async () => {
            fs.access.mockRejectedValue(new Error('Directory not found'));

            await screenshotService.cleanupOldScreenshots('exam1');

            // Should not throw error
            expect(mockLogger.error).not.toHaveBeenCalled();
        });

        test('should clean up old files', async () => {
            fs.access.mockResolvedValue();
            fs.readdir.mockResolvedValueOnce(['student1', 'student2'])
                .mockResolvedValueOnce(['old-file.png', 'new-file.png'])
                .mockResolvedValueOnce(['old-file2.png']);

            const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
            const newDate = new Date(Date.now() - 1 * 60 * 60 * 1000);  // 1 hour ago

            fs.stat.mockResolvedValueOnce({ mtime: oldDate })
                .mockResolvedValueOnce({ mtime: newDate })
                .mockResolvedValueOnce({ mtime: oldDate });

            fs.unlink.mockResolvedValue();

            await screenshotService.cleanupOldScreenshots('exam1', 24);

            expect(fs.unlink).toHaveBeenCalledTimes(2); // Should delete 2 old files
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Cleaned up old screenshot')
            );
        });

        test('should handle cleanup errors gracefully', async () => {
            fs.access.mockResolvedValue();
            fs.readdir.mockRejectedValue(new Error('Permission denied'));

            await screenshotService.cleanupOldScreenshots('exam1');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Screenshot cleanup failed:',
                'Permission denied'
            );
        });
    });

    describe('Edge Cases and Error Recovery', () => {
        test('should handle unexpected errors during capture', async () => {
            // Mock an unexpected error during the capture process
            jest.spyOn(screenshotService, 'checkDiskSpace').mockRejectedValue(
                new Error('Unexpected system error')
            );

            const result = await screenshotService.captureActiveWindow('exam1', 'student1', 'notepad.exe');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Screenshot capture failed with unexpected error');
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Screenshot capture failed with unexpected error'),
                expect.any(Error)
            );
        });

        test('should handle very long application names', async () => {
            const longAppName = 'a'.repeat(200) + '.exe';

            jest.spyOn(screenshotService, 'checkDiskSpace').mockResolvedValue({
                hasSpace: true,
                availableMB: 200
            });

            fs.mkdir.mockResolvedValue();
            jest.spyOn(screenshotService, 'attemptScreenshotCapture').mockResolvedValue({
                success: true
            });

            const result = await screenshotService.captureActiveWindow('exam1', 'student1', longAppName);

            expect(result.success).toBe(true);
            // App name should be truncated to 50 characters
            expect(result.success).toBe(true);
            // The sanitized app name should be truncated to 50 characters
            const filename = result.filePath.split('/').pop();
            expect(filename).toContain('violation-');
            expect(filename).toContain('.png');
        });

        test('should handle special characters in exam and student IDs', async () => {
            jest.spyOn(screenshotService, 'checkDiskSpace').mockResolvedValue({
                hasSpace: true,
                availableMB: 200
            });

            fs.mkdir.mockResolvedValue();
            jest.spyOn(screenshotService, 'attemptScreenshotCapture').mockResolvedValue({
                success: true
            });

            const result = await screenshotService.captureActiveWindow('exam<>123', 'student/456', 'notepad.exe');

            expect(result.success).toBe(true);
            expect(fs.mkdir).toHaveBeenCalledWith(
                'test/screenshots/exam-exam<>123/student-student/456',
                { recursive: true }
            );
        });
    });
});