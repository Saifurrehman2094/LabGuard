# Screenshot Service Error Handling

This document describes the comprehensive error handling and fallback mechanisms implemented in the ScreenshotService for the exam monitoring system.

## Overview

The ScreenshotService implements multiple layers of error handling to ensure that violation logging continues even when screenshot capture fails, meeting requirements 2.4 and 6.2.

## Error Handling Features

### 1. Disk Space Checking

**Purpose**: Prevent screenshot capture failures due to insufficient disk space.

**Implementation**:
- Checks available disk space before attempting screenshot capture
- Configurable minimum space requirement (default: 100MB)
- Graceful fallback if disk space cannot be determined

**Error Scenarios Handled**:
- Insufficient disk space
- Permission denied when checking disk space
- Command execution failures

```javascript
// Example usage
const diskSpace = await screenshotService.checkDiskSpace();
if (!diskSpace.hasSpace) {
  // Handle insufficient space gracefully
  console.log(`Only ${diskSpace.availableMB}MB available`);
}
```

### 2. Multiple Screenshot Capture Methods

**Purpose**: Provide fallback mechanisms when primary screenshot methods fail.

**Methods (in order of preference)**:
1. **PowerShell with System.Drawing** - Primary method using .NET APIs
2. **NirCmd** - Third-party tool fallback (if available)
3. **Print Screen simulation** - Last resort method

**Error Scenarios Handled**:
- PowerShell execution failures
- .NET API unavailability
- Permission restrictions
- Tool unavailability

```javascript
// The service automatically tries multiple methods
const result = await screenshotService.captureActiveWindow(examId, studentId, appName);
if (!result.success) {
  console.log('All methods failed:', result.error);
  // Violation is still logged without screenshot
}
```

### 3. File System Error Handling

**Purpose**: Handle file system related errors gracefully.

**Error Scenarios Handled**:
- Directory creation failures
- Permission denied errors
- File write failures
- Path length limitations

**Features**:
- Automatic directory structure creation
- Filename sanitization for security
- File validation and integrity checking

### 4. Screenshot Validation

**Purpose**: Ensure captured screenshots are valid and usable.

**Validation Checks**:
- File size validation (not empty, not too small)
- PNG signature verification
- File accessibility checks

```javascript
// Automatic validation after capture
const validation = await screenshotService.validateScreenshot(filePath);
if (!validation.valid) {
  console.log('Invalid screenshot:', validation.error);
}
```

### 5. Filename Sanitization

**Purpose**: Prevent security issues and file system errors from malicious application names.

**Sanitization Rules**:
- Remove invalid file system characters: `<>:"/\|?*`
- Replace spaces with underscores
- Limit filename length to 50 characters
- Preserve file extensions

```javascript
// Examples of sanitization
'app<>:"/\|?*.exe' → 'app_________.exe'
'My App Name.exe' → 'My_App_Name.exe'
'very-long-name...' → 'very-long-application-name-that-exceeds-normal-lim'
```

### 6. Cleanup Error Handling

**Purpose**: Safely clean up old screenshots without affecting system stability.

**Error Scenarios Handled**:
- Non-existent directories
- Permission denied during cleanup
- File access errors
- Concurrent access issues

## Integration with Violation Logging

The error handling system is designed to ensure that **violation logging continues even when screenshot capture fails**, as required by the specifications.

### Workflow

1. **Violation Detected** → Always log violation record
2. **Attempt Screenshot** → Try multiple methods with fallbacks
3. **Screenshot Success** → Update violation record with file path
4. **Screenshot Failure** → Log error but keep violation record with `screenshot_captured = 0`

### Database Integration

```sql
-- Violation records are always created, regardless of screenshot success
INSERT INTO app_violations (
  violation_id, exam_id, student_id, app_name,
  focus_start_time, screenshot_captured, screenshot_path
) VALUES (?, ?, ?, ?, ?, 0, NULL); -- screenshot_captured = 0 on failure
```

## Error Logging

All errors are logged with appropriate detail levels:

- **INFO**: Successful operations
- **WARN**: Non-critical failures with fallbacks
- **ERROR**: Critical failures that affect functionality

## Configuration Options

The service supports configuration for error handling behavior:

```javascript
const screenshotService = new ScreenshotService('screenshots', {
  minDiskSpaceMB: 100,        // Minimum disk space required
  maxRetries: 3,              // Maximum retry attempts
  timeoutMs: 10000,           // Screenshot capture timeout
  validateScreenshots: true   // Enable screenshot validation
});
```

## Testing

Comprehensive test coverage includes:

- Disk space checking scenarios
- Multiple screenshot method failures
- File system error conditions
- Validation edge cases
- Cleanup operations

Run tests with:
```bash
npm test -- screenshotService.test.js
```

## Requirements Compliance

This implementation satisfies the following requirements:

- **Requirement 2.4**: "IF screenshot capture fails THEN the system SHALL still log the violation but mark screenshot as unavailable"
- **Requirement 6.2**: "WHEN screenshot capture fails THEN the system SHALL log the failure reason and continue monitoring"

The error handling ensures that monitoring continues uninterrupted even when screenshot capture encounters issues, maintaining the integrity of the violation detection system.