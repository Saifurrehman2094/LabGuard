# Implementation Plan

- [x] 1. Set up Windows API integration and core monitoring infrastructure





  - Install and configure `ffi-napi` package for Windows API access
  - Create basic Windows API wrapper functions for `GetForegroundWindow`, `GetWindowText`, and `GetWindowThreadProcessId`
  - Implement application detection logic to identify active applications
  - _Requirements: 5.1, 5.2_

- [x] 2. Implement Windows Monitor Service





  - [x] 2.1 Create WindowsMonitorService class with polling mechanism


    - Write service class with configurable polling interval (default 1000ms)
    - Implement continuous monitoring loop with start/stop functionality
    - Add application focus change detection and event emission
    - _Requirements: 1.1, 1.2_

  - [x] 2.2 Implement allowed application checking logic


    - Create method to compare detected applications against allowed list
    - Handle application name normalization and matching
    - Add violation detection when unauthorized apps gain focus
    - _Requirements: 1.3_

  - [x] 2.3 Write unit tests for monitor service






    - Create tests for application detection logic
    - Mock Windows API responses for testing
    - Test allowed/disallowed app classification
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 3. Extend database schema and violation logging





  - [x] 3.1 Create app_violations table and database migration


    - Add new table schema with violation tracking fields
    - Implement database migration logic for existing installations
    - Add foreign key relationships to exams and users tables
    - _Requirements: 2.1, 2.3_

  - [x] 3.2 Implement violation logging methods in DatabaseService


    - Add `logAppViolation()` method to create violation records
    - Implement `updateViolationEndTime()` for violation duration tracking
    - Create query methods for retrieving violations by exam and student
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 3.3 Write database integration tests






    - Test violation record creation and updates
    - Verify foreign key constraints and data integrity
    - Test query performance with sample violation data
    - _Requirements: 2.1, 2.3_

- [ ] 4. Implement screenshot capture service
  - [ ] 4.1 Create ScreenshotService class for Windows screenshot capture
    - Implement active window screenshot capture using Windows APIs
    - Create organized file storage structure by exam and student
    - Add unique filename generation with timestamps and app names
    - _Requirements: 2.2, 5.4_

  - [x] 4.2 Implement screenshot error handling and fallback





    - Handle screenshot capture failures gracefully
    - Log failures while maintaining violation records
    - Implement disk space checking before capture
    - _Requirements: 2.4, 6.2_

  - [x] 4.3 Write screenshot service tests






    - Mock screenshot capture functionality for testing
    - Test file naming and storage organization
    - Verify error handling for various failure scenarios
    - _Requirements: 2.2, 2.4_

- [x] 5. Create monitoring controller and orchestration





  - [x] 5.1 Implement MonitoringController class


    - Create controller to orchestrate monitoring workflow
    - Implement exam monitoring start/stop with state management
    - Add violation handling that coordinates logging and screenshots
    - _Requirements: 1.1, 1.5, 2.1_

  - [x] 5.2 Add monitoring IPC handlers to main.js


    - Extend existing monitoring IPC handlers with new functionality
    - Add handlers for starting/stopping enhanced monitoring
    - Implement real-time violation event broadcasting to renderer
    - _Requirements: 1.1, 1.5_

  - [x] 5.3 Write controller integration tests






    - Test end-to-end monitoring workflow
    - Verify coordination between monitoring, logging, and screenshot services
    - Test error recovery and service restart mechanisms
    - _Requirements: 1.1, 1.5, 6.3_

- [x] 6. Implement warning system frontend components





  - [x] 6.1 Create WarningLogCard React component


    - Design and implement individual violation warning cards
    - Display app name, timestamps, duration, and violation status
    - Add visual indicators for active vs completed violations
    - _Requirements: 4.1, 4.2_

  - [x] 6.2 Create WarningPanel container component


    - Implement scrollable container for multiple warning cards
    - Add real-time updates via IPC event listeners
    - Integrate with existing StudentDashboard component
    - _Requirements: 4.3, 4.5_

  - [x] 6.3 Add warning system CSS styling


    - Create responsive styles for warning cards and panel
    - Implement visual hierarchy and attention-grabbing design
    - Add animations for new violation appearances
    - _Requirements: 4.1, 4.2_

- [x] 7. Integrate monitoring system with student exam flow





  - [x] 7.1 Update StudentDashboard to include monitoring components


    - Add WarningPanel to exam interface
    - Implement monitoring status indicators
    - Connect real-time violation updates to warning display
    - _Requirements: 4.1, 4.3, 4.5_

  - [x] 7.2 Enhance exam start/stop workflow with monitoring


    - Update exam start process to initialize monitoring with allowed apps
    - Modify exam end process to stop monitoring and finalize violations
    - Add monitoring status to exam session state management
    - _Requirements: 1.1, 1.5_

  - [x] 7.3 Write end-to-end integration tests






    - Test complete exam monitoring workflow from start to finish
    - Verify violation detection, logging, and warning display
    - Test monitoring cleanup on exam completion
    - _Requirements: 1.1, 1.5, 4.1_

- [x] 8. Add teacher violation reporting interface




  - [x] 8.1 Create violation report components for teachers


    - Implement violation summary view with statistics
    - Add detailed violation list with timestamps and evidence
    - Create screenshot viewing functionality for violation evidence
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 8.2 Extend teacher dashboard with monitoring results


    - Add violation reporting section to existing teacher interface
    - Implement filtering and sorting for violation data
    - Add export functionality for violation reports
    - _Requirements: 3.1, 3.4, 3.5_

  - [ ]* 8.3 Write teacher interface tests
    - Test violation data display and filtering
    - Verify screenshot viewing functionality
    - Test report generation and export features
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 9. Implement error handling and system reliability
  - [ ] 9.1 Add comprehensive error handling to monitoring services
    - Implement Windows API failure detection and fallback methods
    - Add service crash detection and automatic restart logic
    - Create error logging and diagnostic information collection
    - _Requirements: 6.1, 6.3, 6.4_

  - [ ] 9.2 Add permission and system requirement validation
    - Implement Windows permission checking for monitoring APIs
    - Add system requirement validation (Windows version, etc.)
    - Create user-friendly error messages and resolution guidance
    - _Requirements: 6.4, 6.5_

  - [ ]* 9.3 Write error handling and recovery tests
    - Test various failure scenarios and recovery mechanisms
    - Verify error message clarity and user guidance
    - Test system requirement validation logic
    - _Requirements: 6.1, 6.3, 6.4_

- [ ] 10. Performance optimization and final integration
  - [ ] 10.1 Optimize monitoring performance and resource usage
    - Implement efficient polling mechanisms to minimize CPU usage
    - Add memory management for violation data and screenshots
    - Optimize database queries for violation retrieval
    - _Requirements: 5.3_

  - [ ] 10.2 Add monitoring configuration and settings
    - Create configurable settings for polling intervals and thresholds
    - Add admin interface for monitoring system configuration
    - Implement monitoring feature enable/disable functionality
    - _Requirements: 5.3, 5.5_

  - [ ]* 10.3 Write performance and load tests
    - Test resource usage during extended monitoring sessions
    - Verify performance with multiple concurrent monitoring sessions
    - Test database performance with large violation datasets
    - _Requirements: 5.3_