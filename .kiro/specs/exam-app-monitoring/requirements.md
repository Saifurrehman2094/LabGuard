# Requirements Document

## Introduction

This feature implements system-level application monitoring during active exams to detect and log unauthorized application usage. The system will continuously monitor the active/focused applications on the student's device during exam sessions, compare them against the teacher-defined allowed applications list, and automatically capture evidence of violations including timestamps, application details, and screenshots.

## Requirements

### Requirement 1

**User Story:** As a teacher, I want the system to automatically monitor student application usage during exams, so that I can ensure academic integrity and detect unauthorized software usage.

#### Acceptance Criteria

1. WHEN an exam is started by a student THEN the system SHALL begin monitoring active/focused applications continuously
2. WHEN the system detects an application focus change THEN the system SHALL check if the application is in the allowed applications list for that exam
3. WHEN an unauthorized application gains focus THEN the system SHALL log the violation with start timestamp, application name, and capture a screenshot
4. WHEN an unauthorized application loses focus THEN the system SHALL update the violation log with end timestamp
5. WHEN the exam ends THEN the system SHALL stop application monitoring for that session

### Requirement 2

**User Story:** As a system administrator, I want violation data to be securely stored with detailed evidence, so that teachers can review potential academic integrity issues with proper documentation.

#### Acceptance Criteria

1. WHEN a violation is detected THEN the system SHALL store a violation record containing exam ID, student ID, application name, focus start timestamp, focus end timestamp, and screenshot file path
2. WHEN a screenshot is captured THEN the system SHALL save it with a unique filename in a secure directory structure organized by exam and student
3. WHEN storing violation data THEN the system SHALL ensure all timestamps are in ISO format with timezone information
4. IF screenshot capture fails THEN the system SHALL still log the violation but mark screenshot as unavailable
5. WHEN violation data is stored THEN the system SHALL ensure it cannot be modified by students

### Requirement 3

**User Story:** As a teacher, I want to view detailed violation reports with visual evidence, so that I can make informed decisions about potential academic integrity violations.

#### Acceptance Criteria

1. WHEN a teacher views exam monitoring results THEN the system SHALL display all violations with application names, duration, and timestamps
2. WHEN a teacher clicks on a violation record THEN the system SHALL display the associated screenshot if available
3. WHEN displaying violation data THEN the system SHALL show total time spent in unauthorized applications per student
4. WHEN no violations occurred THEN the system SHALL clearly indicate clean exam completion
5. WHEN violations exist THEN the system SHALL provide summary statistics including most common unauthorized applications

### Requirement 4

**User Story:** As a student, I want to receive immediate feedback when using unauthorized applications, so that I can correct my behavior and avoid unintentional violations.

#### Acceptance Criteria

1. WHEN an unauthorized application gains focus THEN the system SHALL display a warning log card showing the violation details
2. WHEN a warning log card is displayed THEN the system SHALL show application name, timestamp, and duration of unauthorized usage
3. WHEN multiple violations occur THEN the system SHALL display multiple warning log cards in a scrollable interface
4. WHEN a violation ends THEN the system SHALL update the corresponding warning log card with end timestamp and total duration
5. WHEN warning log cards are displayed THEN the system SHALL keep them visible throughout the exam session for student awareness

### Requirement 5

**User Story:** As a system developer, I want the monitoring system to be Windows-compatible and performant, so that it works reliably on Windows systems without impacting exam performance.

#### Acceptance Criteria

1. WHEN the system runs on Windows THEN the monitoring SHALL use Windows APIs (GetForegroundWindow, GetWindowText, etc.) for application detection
2. WHEN taking screenshots THEN the system SHALL use Windows GDI+ or similar APIs to capture the active window
3. WHEN monitoring is active THEN the system SHALL consume minimal CPU and memory resources (< 5% CPU, < 100MB RAM)
4. WHEN taking screenshots THEN the system SHALL capture only the active window, not the entire screen for privacy
5. WHEN Windows security features block access THEN the system SHALL request appropriate permissions or provide clear error messages

### Requirement 6

**User Story:** As a system administrator, I want comprehensive error handling and logging, so that monitoring failures don't compromise exam integrity and issues can be diagnosed.

#### Acceptance Criteria

1. WHEN OS-level API calls fail THEN the system SHALL log the error and attempt alternative detection methods
2. WHEN screenshot capture fails THEN the system SHALL log the failure reason and continue monitoring
3. WHEN monitoring service crashes THEN the system SHALL automatically restart monitoring and log the incident
4. WHEN permissions are insufficient THEN the system SHALL display clear error messages and guidance for resolution
5. WHEN monitoring cannot start THEN the system SHALL prevent exam start and notify the student of required permissions