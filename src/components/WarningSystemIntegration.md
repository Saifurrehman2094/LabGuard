# Warning System Integration Guide

## Overview
This document shows how to integrate the WarningPanel component into the StudentDashboard for real-time violation monitoring during exams.

## Integration Steps

### 1. Import the WarningPanel Component

```typescript
import WarningPanel from './WarningPanel';
```

### 2. Add WarningPanel to Exam Session View

In the `StudentDashboard.tsx` component, add the WarningPanel inside the exam session section:

```typescript
{currentSession && currentSession.isActive ? (
  <div className="exam-session">
    {/* Existing session header and info */}
    
    {/* Add Warning Panel here */}
    <WarningPanel 
      examId={currentSession.examId}
      studentId={user.userId}
      isMonitoringActive={true}
    />
    
    {/* Existing session actions */}
  </div>
) : (
  // ... existing dashboard content
)}
```

### 3. Update Electron API Types

Add monitoring event types to `src/types/electron.d.ts`:

```typescript
interface ElectronAPI {
  // ... existing methods
  
  // Monitoring event listener
  onMonitoringEvent: (callback: (event: any, data: {
    type: 'violation_start' | 'violation_end' | 'violation_update';
    violation: ViolationRecord;
  }) => void) => () => void;
}
```

### 4. Backend Integration

The WarningPanel expects monitoring events from the Electron main process. The MonitoringController should emit events like:

```javascript
// In MonitoringController.js
handleViolation(violationData) {
  // Log to database
  this.dbService.logAppViolation(violationData);
  
  // Emit to renderer process
  this.mainWindow.webContents.send('monitoring-event', {
    type: 'violation_start',
    violation: violationData
  });
}

handleViolationEnd(violationData) {
  // Update database
  this.dbService.updateViolationEndTime(violationData.violationId, violationData.focusEndTime);
  
  // Emit to renderer process
  this.mainWindow.webContents.send('monitoring-event', {
    type: 'violation_end',
    violation: violationData
  });
}
```

## Component Features

### WarningLogCard
- Displays individual violation details
- Shows app name, timestamps, and duration
- Visual indicators for active vs completed violations
- Responsive design with animations
- Accessibility support

### WarningPanel
- Container for multiple warning cards
- Real-time updates via IPC events
- Collapsible interface to save space
- Violation statistics and summary
- Scrollable list for multiple violations

## Styling

The warning system uses a consistent design language with:
- Red color scheme for violations (#e74c3c)
- Smooth animations and transitions
- Responsive design for mobile devices
- High contrast and reduced motion support
- Accessibility-focused design

## Testing

To test the warning system:

1. Start an exam session
2. Use unauthorized applications to trigger violations
3. Verify warning cards appear in real-time
4. Check that violations are properly logged and displayed
5. Test the collapsible panel functionality

## Customization

The warning system can be customized by:
- Modifying CSS custom properties in `WarningSystem.css`
- Adjusting animation timings and effects
- Changing color schemes for different severity levels
- Adding custom violation types or categories