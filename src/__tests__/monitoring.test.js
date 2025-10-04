const MonitoringService = require('../../services/monitoring');
const DatabaseService = require('../../services/database');

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

// Mock database service
jest.mock('../../services/database');

describe('MonitoringService', () => {
  let monitoringService;
  let mockDatabaseService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabaseService = new DatabaseService();
    mockDatabaseService.logEvent = jest.fn().mockResolvedValue({ eventId: 'test-event-id' });
    monitoringService = new MonitoringService(mockDatabaseService);
  });

  afterEach(async () => {
    if (monitoringService.isMonitoring) {
      await monitoringService.stopMonitoring();
    }
    await monitoringService.cleanup();
  });

  describe('Constructor', () => {
    test('should initialize with default values', () => {
      const service = new MonitoringService();
      expect(service.isMonitoring).toBe(false);
      expect(service.monitoringInterval).toBeNull();
      expect(service.currentSession).toBeNull();
      expect(service.pollingIntervalMs).toBe(5000);
      expect(service.eventQueue).toEqual([]);
    });

    test('should accept custom database service', () => {
      const customDb = new DatabaseService();
      const service = new MonitoringService(customDb);
      expect(service.databaseService).toBe(customDb);
    });
  });

  describe('startMonitoring', () => {
    const examData = {
      examId: 'exam-123',
      studentId: 'student-456',
      deviceId: 'device-789',
      allowedApps: ['notepad', 'calculator']
    };

    test('should start monitoring session successfully', async () => {
      const result = await monitoringService.startMonitoring(
        examData.examId,
        examData.studentId,
        examData.deviceId,
        examData.allowedApps
      );

      expect(result).toBe(true);
      expect(monitoringService.isMonitoring).toBe(true);
      expect(monitoringService.currentSession).toEqual({
        examId: examData.examId,
        studentId: examData.studentId,
        deviceId: examData.deviceId,
        allowedApps: examData.allowedApps,
        startTime: expect.any(String)
      });
      expect(mockDatabaseService.logEvent).toHaveBeenCalledWith({
        examId: examData.examId,
        studentId: examData.studentId,
        deviceId: examData.deviceId,
        eventType: 'exam_start',
        windowTitle: null,
        processName: null,
        isViolation: false
      });
    });

    test('should throw error if monitoring already active', async () => {
      await monitoringService.startMonitoring(
        examData.examId,
        examData.studentId,
        examData.deviceId,
        examData.allowedApps
      );

      await expect(monitoringService.startMonitoring(
        'exam-456',
        'student-789',
        'device-123',
        ['chrome']
      )).rejects.toThrow('Monitoring session already active');
    });

    test('should handle database error during start', async () => {
      mockDatabaseService.logEvent.mockRejectedValueOnce(new Error('Database error'));

      await expect(monitoringService.startMonitoring(
        examData.examId,
        examData.studentId,
        examData.deviceId,
        examData.allowedApps
      )).rejects.toThrow('Database error');
    });
  });

  describe('stopMonitoring', () => {
    const examData = {
      examId: 'exam-123',
      studentId: 'student-456',
      deviceId: 'device-789',
      allowedApps: ['notepad']
    };

    test('should stop monitoring session successfully', async () => {
      await monitoringService.startMonitoring(
        examData.examId,
        examData.studentId,
        examData.deviceId,
        examData.allowedApps
      );

      const result = await monitoringService.stopMonitoring();

      expect(result).toBe(true);
      expect(monitoringService.isMonitoring).toBe(false);
      expect(monitoringService.currentSession).toBeNull();
      expect(mockDatabaseService.logEvent).toHaveBeenCalledWith({
        examId: examData.examId,
        studentId: examData.studentId,
        deviceId: examData.deviceId,
        eventType: 'exam_end',
        windowTitle: null,
        processName: null,
        isViolation: false
      });
    });

    test('should return false if no active session', async () => {
      const result = await monitoringService.stopMonitoring();
      expect(result).toBe(false);
    });
  });

  describe('checkViolation', () => {
    test('should return false for allowed applications', () => {
      const allowedApps = ['notepad', 'calculator', 'chrome'];
      
      expect(monitoringService.checkViolation('Notepad', 'notepad', allowedApps)).toBe(false);
      expect(monitoringService.checkViolation('Calculator', 'calc', allowedApps)).toBe(false);
      expect(monitoringService.checkViolation('Google Chrome', 'chrome', allowedApps)).toBe(false);
    });

    test('should return true for non-allowed applications', () => {
      const allowedApps = ['notepad', 'calculator'];
      
      expect(monitoringService.checkViolation('Discord', 'discord', allowedApps)).toBe(true);
      expect(monitoringService.checkViolation('Steam', 'steam', allowedApps)).toBe(true);
    });

    test('should return false for system processes', () => {
      const allowedApps = ['notepad'];
      
      expect(monitoringService.checkViolation('Desktop Window Manager', 'dwm', allowedApps)).toBe(false);
      expect(monitoringService.checkViolation('Windows Explorer', 'explorer', allowedApps)).toBe(false);
      expect(monitoringService.checkViolation('Service Host', 'svchost', allowedApps)).toBe(false);
    });

    test('should return false if no allowed apps specified', () => {
      expect(monitoringService.checkViolation('Discord', 'discord', [])).toBe(false);
      expect(monitoringService.checkViolation('Steam', 'steam', null)).toBe(false);
    });

    test('should handle case insensitive matching', () => {
      const allowedApps = ['NOTEPAD', 'Calculator'];
      
      expect(monitoringService.checkViolation('notepad', 'NOTEPAD', allowedApps)).toBe(false);
      expect(monitoringService.checkViolation('CALCULATOR', 'calculator', allowedApps)).toBe(false);
    });

    test('should handle partial matching', () => {
      const allowedApps = ['chrome'];
      
      expect(monitoringService.checkViolation('Google Chrome - New Tab', 'chrome', allowedApps)).toBe(false);
      expect(monitoringService.checkViolation('Chrome Browser', 'chrome', allowedApps)).toBe(false);
    });
  });

  describe('getCurrentActiveWindow', () => {
    const { exec } = require('child_process');

    test('should return window information on success', async () => {
      const mockOutput = JSON.stringify({
        WindowTitle: 'Notepad',
        ProcessName: 'notepad',
        ProcessId: 1234
      });

      exec.mockImplementation((command, callback) => {
        callback(null, { stdout: mockOutput, stderr: '' });
      });

      const result = await monitoringService.getCurrentActiveWindow();

      expect(result).toEqual({
        windowTitle: 'Notepad',
        processName: 'notepad',
        processId: 1234
      });
    });

    test('should handle PowerShell errors gracefully', async () => {
      exec.mockImplementation((command, callback) => {
        callback(new Error('PowerShell error'), { stdout: '', stderr: 'Error' });
      });

      const result = await monitoringService.getCurrentActiveWindow();

      expect(result).toEqual({
        windowTitle: 'Error detecting window',
        processName: 'Unknown',
        processId: 0,
        error: expect.any(String)
      });
    });

    test('should handle empty output', async () => {
      exec.mockImplementation((command, callback) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await monitoringService.getCurrentActiveWindow();

      expect(result).toEqual({
        windowTitle: 'Error detecting window',
        processName: 'Unknown',
        processId: 0,
        error: expect.any(String)
      });
    });
  });

  describe('logEvent', () => {
    const eventData = {
      examId: 'exam-123',
      studentId: 'student-456',
      deviceId: 'device-789',
      eventType: 'window_change',
      windowTitle: 'Notepad',
      processName: 'notepad',
      isViolation: false
    };

    test('should log event successfully', async () => {
      const result = await monitoringService.logEvent(eventData);

      expect(mockDatabaseService.logEvent).toHaveBeenCalledWith(eventData);
      expect(result).toEqual({ eventId: 'test-event-id' });
    });

    test('should queue event on database error', async () => {
      mockDatabaseService.logEvent.mockRejectedValueOnce(new Error('Database error'));

      await expect(monitoringService.logEvent(eventData)).rejects.toThrow('Database error');
      expect(monitoringService.eventQueue).toHaveLength(1);
      expect(monitoringService.eventQueue[0]).toMatchObject({
        ...eventData,
        timestamp: expect.any(String),
        retryCount: 0
      });
    });
  });

  describe('retryFailedEvents', () => {
    test('should retry queued events successfully', async () => {
      const eventData = {
        examId: 'exam-123',
        studentId: 'student-456',
        deviceId: 'device-789',
        eventType: 'window_change',
        windowTitle: 'Notepad',
        processName: 'notepad',
        isViolation: false,
        timestamp: new Date().toISOString(),
        retryCount: 0
      };

      monitoringService.eventQueue.push(eventData);

      await monitoringService.retryFailedEvents();

      expect(mockDatabaseService.logEvent).toHaveBeenCalledWith(eventData);
      expect(monitoringService.eventQueue).toHaveLength(0);
    });

    test('should handle retry failures and increment retry count', async () => {
      const eventData = {
        examId: 'exam-123',
        studentId: 'student-456',
        deviceId: 'device-789',
        eventType: 'window_change',
        windowTitle: 'Notepad',
        processName: 'notepad',
        isViolation: false,
        timestamp: new Date().toISOString(),
        retryCount: 0
      };

      monitoringService.eventQueue.push(eventData);
      mockDatabaseService.logEvent.mockRejectedValueOnce(new Error('Still failing'));

      await monitoringService.retryFailedEvents();

      expect(monitoringService.eventQueue).toHaveLength(1);
      expect(monitoringService.eventQueue[0].retryCount).toBe(1);
    });

    test('should drop events after 3 failed retries', async () => {
      const eventData = {
        examId: 'exam-123',
        studentId: 'student-456',
        deviceId: 'device-789',
        eventType: 'window_change',
        windowTitle: 'Notepad',
        processName: 'notepad',
        isViolation: false,
        timestamp: new Date().toISOString(),
        retryCount: 2 // Already tried twice
      };

      monitoringService.eventQueue.push(eventData);
      mockDatabaseService.logEvent.mockRejectedValueOnce(new Error('Final failure'));

      await monitoringService.retryFailedEvents();

      expect(monitoringService.eventQueue).toHaveLength(0); // Event dropped
    });
  });

  describe('getMonitoringStatus', () => {
    test('should return current status', () => {
      const status = monitoringService.getMonitoringStatus();

      expect(status).toEqual({
        isMonitoring: false,
        currentSession: null,
        queuedEvents: 0,
        pollingInterval: 5000
      });
    });

    test('should return status during active monitoring', async () => {
      await monitoringService.startMonitoring('exam-123', 'student-456', 'device-789', ['notepad']);
      
      const status = monitoringService.getMonitoringStatus();

      expect(status.isMonitoring).toBe(true);
      expect(status.currentSession).toBeTruthy();
      expect(status.pollingInterval).toBe(5000);
    });
  });

  describe('setPollingInterval', () => {
    test('should update polling interval', () => {
      monitoringService.setPollingInterval(3000);
      expect(monitoringService.pollingIntervalMs).toBe(3000);
    });

    test('should throw error for intervals less than 1000ms', () => {
      expect(() => {
        monitoringService.setPollingInterval(500);
      }).toThrow('Polling interval must be at least 1000ms');
    });
  });

  describe('cleanup', () => {
    test('should cleanup resources', async () => {
      await monitoringService.startMonitoring('exam-123', 'student-456', 'device-789', ['notepad']);
      
      await monitoringService.cleanup();

      expect(monitoringService.isMonitoring).toBe(false);
      expect(monitoringService.currentSession).toBeNull();
    });
  });
});