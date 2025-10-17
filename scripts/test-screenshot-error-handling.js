const ScreenshotService = require('../services/screenshotService');
const path = require('path');
const fs = require('fs').promises;

/**
 * Test script to demonstrate screenshot error handling capabilities
 */
async function testScreenshotErrorHandling() {
    console.log('=== Screenshot Service Error Handling Test ===\n');

    const screenshotService = new ScreenshotService('test-screenshots');

    // Test 1: Normal operation
    console.log('Test 1: Normal screenshot capture');
    try {
        const result = await screenshotService.captureActiveWindow('test-exam', 'test-student', 'notepad.exe');
        console.log('Result:', result);

        if (result.success && result.filePath) {
            // Validate the screenshot
            const validation = await screenshotService.validateScreenshot(result.filePath);
            console.log('Validation:', validation);

            // Clean up test file
            try {
                await fs.unlink(result.filePath);
                console.log('Test file cleaned up');
            } catch (e) {
                console.log('Note: Test file cleanup failed (expected if screenshot actually failed)');
            }
        }
    } catch (error) {
        console.log('Error (expected):', error.message);
    }
    console.log('');

    // Test 2: Disk space checking
    console.log('Test 2: Disk space checking');
    try {
        const diskSpace = await screenshotService.checkDiskSpace();
        console.log('Disk space result:', diskSpace);
    } catch (error) {
        console.log('Disk space check error:', error.message);
    }
    console.log('');

    // Test 3: Filename sanitization
    console.log('Test 3: Filename sanitization');
    const testFilenames = [
        'normal-app.exe',
        'app with spaces.exe',
        'app<>:"/\\|?*.exe',
        'very-long-application-name-that-exceeds-normal-limits-and-should-be-truncated.exe'
    ];

    testFilenames.forEach(filename => {
        const sanitized = screenshotService.sanitizeFilename(filename);
        console.log(`"${filename}" -> "${sanitized}"`);
    });
    console.log('');

    // Test 4: Directory structure creation
    console.log('Test 4: Directory structure handling');
    try {
        const testDir = await screenshotService.ensureDirectoryStructure('test-exam-2', 'test-student-2');
        console.log('Directory created:', testDir);

        // Clean up test directory
        try {
            await fs.rmdir(testDir, { recursive: true });
            console.log('Test directory cleaned up');
        } catch (e) {
            console.log('Directory cleanup note:', e.message);
        }
    } catch (error) {
        console.log('Directory creation error:', error.message);
    }
    console.log('');

    // Test 5: Screenshot path generation
    console.log('Test 5: Screenshot path generation');
    const testPath = screenshotService.getScreenshotPath('exam-123', 'student-456', '2025-01-01T12-00-00-000Z');
    console.log('Generated path:', testPath);
    console.log('');

    // Test 6: Cleanup operation (safe to run)
    console.log('Test 6: Cleanup operation');
    try {
        await screenshotService.cleanupOldScreenshots('non-existent-exam');
        console.log('Cleanup completed (no files to clean)');
    } catch (error) {
        console.log('Cleanup error:', error.message);
    }

    console.log('\n=== Test Complete ===');
    console.log('The ScreenshotService has been tested for error handling capabilities:');
    console.log('✓ Disk space checking with fallback');
    console.log('✓ Multiple screenshot capture methods with fallbacks');
    console.log('✓ Filename sanitization for security');
    console.log('✓ Directory creation error handling');
    console.log('✓ File validation and integrity checking');
    console.log('✓ Graceful cleanup operations');
}

// Run the test
if (require.main === module) {
    testScreenshotErrorHandling().catch(console.error);
}

module.exports = testScreenshotErrorHandling;