const WindowsMonitorService = require('../../services/windowsMonitorService');
const ApplicationDetector = require('../../services/applicationDetector');

// Mock ApplicationDetector
jest.mock('../../services/applicationDetector');

describe('WindowsMonitorService', () => {
    let windowsMonitorService;
    let mockApplicationDetector;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock ApplicationDetector instance
        mockApplicationDetector = {
            initialize: jest.fn().mockReturnValue(true),
            startMonitoring: jest.fn().mockReturnValue(true),
            stopMonitoring: jest.fn(),
            setPollingInterval: jest.fn(),
            setApplicationChangeCallback: jest.fn(),
            setErrorCallback: jest.fn(),
            getCurrentActiveApplication: jest.fn(),
            isApplicationAllowed: jest.fn(),
            normalizeApplicationName: jest.fn(),
            getMonitoringStatus: jest.fn().mockReturnValue({
                isMonitoring: false,
                pollingInterval: 1000,
                apiInitialized: true,
                lastActiveApp: null,
                currentTime: new Date().toISOString()
            }),
            cleanup: jest.fn()
        };

        // Mock the ApplicationDetector constructor
        ApplicationDetector.mockImplementation(() => mockApplicationDetector);

        windowsMonitorService = new WindowsMonitorService();
    });

    afterEach(async () => {
        if (windowsMonitorService.isMonitoring) {
            windowsMonitorService.stopMonitoring();
        }
        windowsMonitorService.cleanup();
    });

    describe('Constructor', () => {
        test('should initialize with default values', () => {
            const service = new WindowsMonitorService();

            expect(service.pollingInterval).toBe(1000);
            expect(service.allowedApplications).toEqual([]);
            expect(service.isMonitoring).toBe(false);
            expect(service.currentViolation).toBeNull();
            expect(service.monitoringStartTime).toBeNull();
            expect(service.applicationDetector).toBeDefined();
        });

        test('should accept custom polling interval', () => {
            const service = new WindowsMonitorService({ pollingInterval: 2000 });
            expect(service.pollingInterval).toBe(2000);
        });

        test('should setup event handlers', () => {
            expect(mockApplicationDetector.setApplicationChangeCallback).toHaveBeenCalled();
            expect(mockApplicationDetector.setErrorCallback).toHaveBeenCalled();
        });
    });

    describe('initialize', () => {
        test('should initialize successfully', () => {
            const result = windowsMonitorService.initialize();

            expect(result).toBe(true);
            expect(mockApplicationDetector.initialize).toHaveBeenCalled();
            expect(mockApplicationDetector.setPollingInterval).toHaveBeenCalledWith(1000);
        });

        test('should emit initialized event on success', (done) => {
            windowsMonitorService.on('initialized', () => {
                done();
            });

            windowsMonitorService.initialize();
        });

        test('should handle initialization failure', () => {
            mockApplicationDetector.initialize.mockReturnValue(false);

            const result = windowsMonitorService.initialize();

            expect(result).toBe(false);
        });

        test('should emit error on initialization failure', (done) => {
            const error = new Error('Initialization failed');
            mockApplicationDetector.initialize.mockImplementation(() => {
                throw error;
            });

            windowsMonitorService.on('error', (emittedError) => {
                expect(emittedError).toBe(error);
                done();
            });

            windowsMonitorService.initialize();
        });
    });

    describe('startMonitoring', () => {
        const allowedApps = ['notepad', 'calculator', 'chrome'];

        beforeEach(() => {
            windowsMonitorService.initialize();
        });

        test('should start monitoring successfully', () => {
            const result = windowsMonitorService.startMonitoring(allowedApps);

            expect(result).toBe(true);
            expect(windowsMonitorService.isMonitoring).toBe(true);
            expect(windowsMonitorService.allowedApplications).toEqual(['notepad', 'calculator', 'chrome']);
            expect(windowsMonitorService.monitoringStartTime).toBeInstanceOf(Date);
            expect(mockApplicationDetector.startMonitoring).toHaveBeenCalled();
        });

        test('should emit monitoringStarted event', (done) => {
            windowsMonitorService.on('monitoringStarted', (data) => {
                expect(data.allowedApplications).toEqual(['notepad', 'calculator', 'chrome']);
                expect(data.startTime).toBeInstanceOf(Date);
                expect(data.pollingInterval).toBe(1000);
                done();
            });

            windowsMonitorService.startMonitoring(allowedApps);
        });

        test('should check initial application state', () => {
            const mockApp = {
                applicationName: 'Discord',
                windowTitle: 'Discord - General',
                processId: 1234
            };

            mockApplicationDetector.getCurrentActiveApplication.mockReturnValue(mockApp);

            windowsMonitorService.startMonitoring(allowedApps);

            expect(mockApplicationDetector.getCurrentActiveApplication).toHaveBeenCalled();
        });

        test('should warn if already monitoring', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            windowsMonitorService.startMonitoring(allowedApps);
            const result = windowsMonitorService.startMonitoring(['other-app']);

            expect(result).toBe(true);
            expect(consoleSpy).toHaveBeenCalledWith('Windows monitoring is already active');

            consoleSpy.mockRestore();
        });

        test('should throw error for invalid allowed apps parameter', () => {
            expect(() => {
                windowsMonitorService.startMonitoring('not-an-array');
            }).toThrow('Allowed applications must be an array');
        });

        test('should handle start monitoring failure', () => {
            mockApplicationDetector.startMonitoring.mockReturnValue(false);

            const result = windowsMonitorService.startMonitoring(allowedApps);

            expect(result).toBe(false);
            expect(windowsMonitorService.isMonitoring).toBe(false);
        });

        test('should emit error on start failure', (done) => {
            const error = new Error('Start failed');
            mockApplicationDetector.startMonitoring.mockImplementation(() => {
                throw error;
            });

            windowsMonitorService.on('error', (emittedError) => {
                expect(emittedError).toBe(error);
                done();
            });

            windowsMonitorService.startMonitoring(allowedApps);
        });
    });

    describe('stopMonitoring', () => {
        const allowedApps = ['notepad', 'calculator'];

        beforeEach(() => {
            windowsMonitorService.initialize();
            windowsMonitorService.startMonitoring(allowedApps);
        });

        test('should stop monitoring successfully', () => {
            windowsMonitorService.stopMonitoring();

            expect(windowsMonitorService.isMonitoring).toBe(false);
            expect(mockApplicationDetector.stopMonitoring).toHaveBeenCalled();
        });

        test('should emit monitoringStopped event', (done) => {
            windowsMonitorService.on('monitoringStopped', (data) => {
                expect(data.duration).toBeGreaterThanOrEqual(0);
                expect(data.stopTime).toBeInstanceOf(Date);
                done();
            });

            windowsMonitorService.stopMonitoring();
        });

        test('should end current violation when stopping', () => {
            // Simulate active violation
            windowsMonitorService.currentViolation = {
                violationId: 'test-violation',
                applicationName: 'Discord',
                startTime: new Date(),
                isActive: true
            };

            const endViolationSpy = jest.spyOn(windowsMonitorService, 'endCurrentViolation');

            windowsMonitorService.stopMonitoring();

            expect(endViolationSpy).toHaveBeenCalled();
        });

        test('should handle stop when not monitoring', () => {
            windowsMonitorService.stopMonitoring(); // Stop first time
            windowsMonitorService.stopMonitoring(); // Stop again

            // Should not throw error
            expect(windowsMonitorService.isMonitoring).toBe(false);
        });

        test('should emit error on stop failure', (done) => {
            const error = new Error('Stop failed');
            mockApplicationDetector.stopMonitoring.mockImplementation(() => {
                throw error;
            });

            windowsMonitorService.on('error', (emittedError) => {
                expect(emittedError).toBe(error);
                done();
            });

            windowsMonitorService.stopMonitoring();
        });
    });

    describe('handleApplicationChange', () => {
        const allowedApps = ['notepad', 'calculator'];
        const oldApp = {
            applicationName: 'Notepad',
            windowTitle: 'Untitled - Notepad',
            processId: 1234
        };
        const newApp = {
            applicationName: 'Discord',
            windowTitle: 'Discord - General',
            processId: 5678
        };

        beforeEach(() => {
            windowsMonitorService.initialize();
            windowsMonitorService.startMonitoring(allowedApps);
        });

        test('should emit applicationChanged event', (done) => {
            windowsMonitorService.on('applicationChanged', (data) => {
                expect(data.previousApp).toBe(oldApp);
                expect(data.currentApp).toBe(newApp);
                expect(data.timestamp).toBeInstanceOf(Date);
                done();
            });

            windowsMonitorService.handleApplicationChange(oldApp, newApp);
        });

        test('should end current violation when switching apps', () => {
            windowsMonitorService.currentViolation = {
                violationId: 'test-violation',
                applicationName: 'Discord',
                startTime: new Date(),
                isActive: true
            };

            const endViolationSpy = jest.spyOn(windowsMonitorService, 'endCurrentViolation');

            windowsMonitorService.handleApplicationChange(oldApp, newApp);

            expect(endViolationSpy).toHaveBeenCalled();
        });

        test('should check new application for violations', () => {
            const checkViolationSpy = jest.spyOn(windowsMonitorService, 'checkApplicationViolation');

            windowsMonitorService.handleApplicationChange(oldApp, newApp);

            expect(checkViolationSpy).toHaveBeenCalledWith(newApp);
        });

        test('should handle null applications', () => {
            expect(() => {
                windowsMonitorService.handleApplicationChange(null, null);
            }).not.toThrow();
        });

        test('should emit error on handling failure', (done) => {
            const error = new Error('Handle change failed');
            jest.spyOn(windowsMonitorService, 'checkApplicationViolation').mockImplementation(() => {
                throw error;
            });

            windowsMonitorService.on('error', (emittedError) => {
                expect(emittedError).toBe(error);
                done();
            });

            windowsMonitorService.handleApplicationChange(oldApp, newApp);
        });
    });

    describe('checkApplicationViolation', () => {
        const allowedApps = ['notepad', 'calculator'];
        const allowedApp = {
            applicationName: 'Notepad',
            windowTitle: 'Untitled - Notepad',
            processId: 1234
        };
        const violatingApp = {
            applicationName: 'Discord',
            windowTitle: 'Discord - General',
            processId: 5678
        };

        beforeEach(() => {
            windowsMonitorService.initialize();
            windowsMonitorService.startMonitoring(allowedApps);
        });

        test('should emit applicationChecked event', (done) => {
            mockApplicationDetector.isApplicationAllowed.mockReturnValue(true);

            windowsMonitorService.on('applicationChecked', (data) => {
                expect(data.applicationName).toBe('Notepad');
                expect(data.windowTitle).toBe('Untitled - Notepad');
                expect(data.isAllowed).toBe(true);
                expect(data.timestamp).toBeInstanceOf(Date);
                done();
            });

            windowsMonitorService.checkApplicationViolation(allowedApp);
        });

        test('should not start violation for allowed applications', () => {
            mockApplicationDetector.isApplicationAllowed.mockReturnValue(true);

            const startViolationSpy = jest.spyOn(windowsMonitorService, 'startViolation');

            windowsMonitorService.checkApplicationViolation(allowedApp);

            expect(startViolationSpy).not.toHaveBeenCalled();
        });

        test('should start violation for disallowed applications', () => {
            mockApplicationDetector.isApplicationAllowed.mockReturnValue(false);

            const startViolationSpy = jest.spyOn(windowsMonitorService, 'startViolation');

            windowsMonitorService.checkApplicationViolation(violatingApp);

            expect(startViolationSpy).toHaveBeenCalledWith(violatingApp);
        });

        test('should not start duplicate violation for same app', () => {
            mockApplicationDetector.isApplicationAllowed.mockReturnValue(false);

            // Set existing violation for same app
            windowsMonitorService.currentViolation = {
                violationId: 'existing-violation',
                applicationName: 'Discord',
                processId: 5678,
                startTime: new Date(),
                isActive: true
            };

            const startViolationSpy = jest.spyOn(windowsMonitorService, 'startViolation');

            windowsMonitorService.checkApplicationViolation(violatingApp);

            expect(startViolationSpy).not.toHaveBeenCalled();
        });

        test('should end existing violation and start new one for different app', () => {
            mockApplicationDetector.isApplicationAllowed.mockReturnValue(false);

            // Set existing violation for different app
            windowsMonitorService.currentViolation = {
                violationId: 'existing-violation',
                applicationName: 'Steam',
                processId: 9999,
                startTime: new Date(),
                isActive: true
            };

            const endViolationSpy = jest.spyOn(windowsMonitorService, 'endCurrentViolation');
            const startViolationSpy = jest.spyOn(windowsMonitorService, 'startViolation');

            windowsMonitorService.checkApplicationViolation(violatingApp);

            expect(endViolationSpy).toHaveBeenCalled();
            expect(startViolationSpy).toHaveBeenCalledWith(violatingApp);
        });

        test('should handle null application info', () => {
            expect(() => {
                windowsMonitorService.checkApplicationViolation(null);
            }).not.toThrow();
        });

        test('should not check violations when not monitoring', () => {
            windowsMonitorService.stopMonitoring();

            const startViolationSpy = jest.spyOn(windowsMonitorService, 'startViolation');

            windowsMonitorService.checkApplicationViolation(violatingApp);

            expect(startViolationSpy).not.toHaveBeenCalled();
        });
    });

    describe('isApplicationAllowed', () => {
        const allowedApps = ['notepad', 'calculator', 'chrome'];

        beforeEach(() => {
            windowsMonitorService.initialize();
            windowsMonitorService.startMonitoring(allowedApps);
        });

        test('should delegate to ApplicationDetector', () => {
            mockApplicationDetector.isApplicationAllowed.mockReturnValue(true);

            const result = windowsMonitorService.isApplicationAllowed('Notepad');

            expect(mockApplicationDetector.isApplicationAllowed).toHaveBeenCalledWith('Notepad', allowedApps);
            expect(result).toBe(true);
        });

        test('should return false for null application name', () => {
            const result = windowsMonitorService.isApplicationAllowed(null);

            expect(result).toBe(false);
        });

        test('should return false for empty application name', () => {
            const result = windowsMonitorService.isApplicationAllowed('');

            expect(result).toBe(false);
        });
    });

    describe('normalizeApplicationName', () => {
        test('should delegate to ApplicationDetector', () => {
            mockApplicationDetector.normalizeApplicationName.mockReturnValue('notepad');

            const result = windowsMonitorService.normalizeApplicationName('Notepad.exe');

            expect(mockApplicationDetector.normalizeApplicationName).toHaveBeenCalledWith('Notepad.exe');
            expect(result).toBe('notepad');
        });
    });

    describe('allowed applications management', () => {
        beforeEach(() => {
            windowsMonitorService.initialize();
        });

        describe('addAllowedApplication', () => {
            test('should add new allowed application', (done) => {
                windowsMonitorService.on('allowedApplicationAdded', (data) => {
                    expect(data.applicationName).toBe('discord');
                    expect(data.timestamp).toBeInstanceOf(Date);
                    done();
                });

                windowsMonitorService.addAllowedApplication('Discord');

                expect(windowsMonitorService.allowedApplications).toContain('discord');
            });

            test('should not add duplicate applications', () => {
                windowsMonitorService.allowedApplications = ['notepad'];

                windowsMonitorService.addAllowedApplication('Notepad');

                expect(windowsMonitorService.allowedApplications).toEqual(['notepad']);
            });

            test('should handle null application name', () => {
                const initialLength = windowsMonitorService.allowedApplications.length;

                windowsMonitorService.addAllowedApplication(null);

                expect(windowsMonitorService.allowedApplications).toHaveLength(initialLength);
            });
        });

        describe('removeAllowedApplication', () => {
            beforeEach(() => {
                windowsMonitorService.allowedApplications = ['notepad', 'calculator', 'chrome'];
            });

            test('should remove existing allowed application', (done) => {
                windowsMonitorService.on('allowedApplicationRemoved', (data) => {
                    expect(data.applicationName).toBe('notepad');
                    expect(data.timestamp).toBeInstanceOf(Date);
                    done();
                });

                windowsMonitorService.removeAllowedApplication('Notepad');

                expect(windowsMonitorService.allowedApplications).not.toContain('notepad');
            });

            test('should handle non-existent application', () => {
                const initialApps = [...windowsMonitorService.allowedApplications];

                windowsMonitorService.removeAllowedApplication('non-existent');

                expect(windowsMonitorService.allowedApplications).toEqual(initialApps);
            });

            test('should handle null application name', () => {
                const initialApps = [...windowsMonitorService.allowedApplications];

                windowsMonitorService.removeAllowedApplication(null);

                expect(windowsMonitorService.allowedApplications).toEqual(initialApps);
            });
        });

        describe('updateAllowedApplications', () => {
            test('should update entire allowed applications list', (done) => {
                const newApps = ['discord', 'steam', 'spotify'];

                windowsMonitorService.on('allowedApplicationsUpdated', (data) => {
                    expect(data.previousApps).toEqual([]);
                    expect(data.currentApps).toEqual(newApps);
                    expect(data.timestamp).toBeInstanceOf(Date);
                    done();
                });

                windowsMonitorService.updateAllowedApplications(newApps);

                expect(windowsMonitorService.allowedApplications).toEqual(newApps);
            });

            test('should throw error for non-array parameter', () => {
                expect(() => {
                    windowsMonitorService.updateAllowedApplications('not-an-array');
                }).toThrow('Allowed applications must be an array');
            });

            test('should recheck current application when monitoring', () => {
                const mockApp = {
                    applicationName: 'Discord',
                    windowTitle: 'Discord - General',
                    processId: 1234
                };

                windowsMonitorService.startMonitoring(['notepad']);
                mockApplicationDetector.getCurrentActiveApplication.mockReturnValue(mockApp);

                const checkViolationSpy = jest.spyOn(windowsMonitorService, 'checkApplicationViolation');

                windowsMonitorService.updateAllowedApplications(['discord']);

                expect(checkViolationSpy).toHaveBeenCalledWith(mockApp);
            });
        });

        describe('getAllowedApplications', () => {
            test('should return copy of allowed applications', () => {
                windowsMonitorService.allowedApplications = ['notepad', 'calculator'];

                const result = windowsMonitorService.getAllowedApplications();

                expect(result).toEqual(['notepad', 'calculator']);
                expect(result).not.toBe(windowsMonitorService.allowedApplications); // Should be a copy
            });
        });
    });

    describe('violation management', () => {
        const violatingApp = {
            applicationName: 'Discord',
            windowTitle: 'Discord - General',
            processId: 5678,
            executablePath: 'C:\\Discord\\Discord.exe'
        };

        beforeEach(() => {
            windowsMonitorService.initialize();
            windowsMonitorService.startMonitoring(['notepad']);
        });

        describe('startViolation', () => {
            test('should create and emit violation', (done) => {
                windowsMonitorService.on('violationStarted', (data) => {
                    expect(data.violationId).toMatch(/^violation_\d+_[a-z0-9]+$/);
                    expect(data.applicationName).toBe('Discord');
                    expect(data.windowTitle).toBe('Discord - General');
                    expect(data.processId).toBe(5678);
                    expect(data.executablePath).toBe('C:\\Discord\\Discord.exe');
                    expect(data.startTime).toBeInstanceOf(Date);
                    expect(data.endTime).toBeNull();
                    expect(data.duration).toBeNull();
                    expect(data.isActive).toBe(true);
                    done();
                });

                windowsMonitorService.startViolation(violatingApp);

                expect(windowsMonitorService.currentViolation).toBeTruthy();
                expect(windowsMonitorService.currentViolation.isActive).toBe(true);
            });
        });

        describe('endCurrentViolation', () => {
            beforeEach(() => {
                windowsMonitorService.startViolation(violatingApp);
            });

            test('should end violation and emit event', (done) => {
                windowsMonitorService.on('violationEnded', (data) => {
                    expect(data.violationId).toBeTruthy();
                    expect(data.endTime).toBeInstanceOf(Date);
                    expect(data.duration).toBeGreaterThanOrEqual(0);
                    expect(data.isActive).toBe(false);
                    done();
                });

                windowsMonitorService.endCurrentViolation();

                expect(windowsMonitorService.currentViolation).toBeNull();
            });

            test('should handle no current violation', () => {
                windowsMonitorService.currentViolation = null;

                expect(() => {
                    windowsMonitorService.endCurrentViolation();
                }).not.toThrow();
            });
        });

        describe('generateViolationId', () => {
            test('should generate unique violation IDs', () => {
                const id1 = windowsMonitorService.generateViolationId();
                const id2 = windowsMonitorService.generateViolationId();

                expect(id1).toMatch(/^violation_\d+_[a-z0-9]+$/);
                expect(id2).toMatch(/^violation_\d+_[a-z0-9]+$/);
                expect(id1).not.toBe(id2);
            });
        });
    });

    describe('utility methods', () => {
        beforeEach(() => {
            windowsMonitorService.initialize();
        });

        describe('getCurrentActiveApplication', () => {
            test('should delegate to ApplicationDetector', () => {
                const mockApp = {
                    applicationName: 'Notepad',
                    windowTitle: 'Untitled - Notepad',
                    processId: 1234
                };

                mockApplicationDetector.getCurrentActiveApplication.mockReturnValue(mockApp);

                const result = windowsMonitorService.getCurrentActiveApplication();

                expect(mockApplicationDetector.getCurrentActiveApplication).toHaveBeenCalled();
                expect(result).toBe(mockApp);
            });
        });

        describe('setPollingInterval', () => {
            test('should update polling interval', () => {
                windowsMonitorService.setPollingInterval(2000);

                expect(windowsMonitorService.pollingInterval).toBe(2000);
                expect(mockApplicationDetector.setPollingInterval).toHaveBeenCalledWith(2000);
            });
        });

        describe('getMonitoringStatus', () => {
            test('should return comprehensive status', () => {
                windowsMonitorService.startMonitoring(['notepad', 'calculator']);

                const status = windowsMonitorService.getMonitoringStatus();

                expect(status.isMonitoring).toBe(true);
                expect(status.pollingInterval).toBe(1000);
                expect(status.allowedApplications).toEqual(['notepad', 'calculator']);
                expect(status.currentViolation).toBeNull();
                expect(status.monitoringStartTime).toBeInstanceOf(Date);
                expect(status.detectorStatus).toBeDefined();
                expect(status.currentTime).toBeInstanceOf(Date);
            });
        });
    });

    describe('advanced application matching', () => {
        beforeEach(() => {
            windowsMonitorService.initialize();
            windowsMonitorService.startMonitoring(['notepad', 'chrome']);
        });

        describe('checkApplicationMatch', () => {
            test('should return exact match result', () => {
                mockApplicationDetector.normalizeApplicationName
                    .mockReturnValueOnce('notepad')
                    .mockReturnValueOnce('notepad');

                const result = windowsMonitorService.checkApplicationMatch('Notepad');

                expect(result.isAllowed).toBe(true);
                expect(result.matchType).toBe('exact');
                expect(result.matchedAgainst).toBe('notepad');
            });

            test('should return substring match result', () => {
                // Mock to return consistent values for the test
                mockApplicationDetector.normalizeApplicationName.mockImplementation((name) => {
                    if (name === 'Google Chrome') return 'googlechrome';
                    if (name === 'notepad') return 'notepad';
                    if (name === 'chrome') return 'chrome';
                    return name.toLowerCase();
                });

                const result = windowsMonitorService.checkApplicationMatch('Google Chrome');

                expect(result.isAllowed).toBe(true);
                expect(result.matchType).toBe('substring');
                expect(result.matchedAgainst).toBe('chrome');
            });

            test('should return executable match result', () => {
                mockApplicationDetector.normalizeApplicationName
                    .mockReturnValueOnce('unknownapp')
                    .mockReturnValueOnce('notepad')
                    .mockReturnValueOnce('chrome')
                    .mockReturnValueOnce('notepad')
                    .mockReturnValueOnce('notepad');

                jest.spyOn(windowsMonitorService, 'extractExecutableName').mockReturnValue('notepad');

                const result = windowsMonitorService.checkApplicationMatch('Unknown App', 'C:\\Windows\\notepad.exe');

                expect(result.isAllowed).toBe(true);
                expect(result.matchType).toBe('executable');
                expect(result.matchedAgainst).toBe('notepad');
            });

            test('should return no match result', () => {
                // Mock to return consistent values for the test
                mockApplicationDetector.normalizeApplicationName.mockImplementation((name) => {
                    if (name === 'Discord') return 'discord';
                    if (name === 'notepad') return 'notepad';
                    if (name === 'chrome') return 'chrome';
                    return name.toLowerCase();
                });

                const result = windowsMonitorService.checkApplicationMatch('Discord');

                expect(result.isAllowed).toBe(false);
                expect(result.matchType).toBe('no-match');
                expect(result.matchedAgainst).toBeNull();
            });

            test('should handle null application name', () => {
                const result = windowsMonitorService.checkApplicationMatch(null);

                expect(result.isAllowed).toBe(false);
                expect(result.matchType).toBe('no-app-name');
                expect(result.matchedAgainst).toBeNull();
            });
        });

        describe('extractExecutableName', () => {
            test('should extract executable name from Windows path', () => {
                const result = windowsMonitorService.extractExecutableName('C:\\Program Files\\Notepad++\\notepad++.exe');

                expect(result).toBe('notepad++');
            });

            test('should handle path without extension', () => {
                const result = windowsMonitorService.extractExecutableName('C:\\Windows\\System32\\notepad');

                expect(result).toBe('notepad');
            });

            test('should handle null path', () => {
                const result = windowsMonitorService.extractExecutableName(null);

                expect(result).toBe('');
            });

            test('should handle extraction error', () => {
                const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

                // Mock split to throw error
                const mockPath = {
                    split: jest.fn().mockImplementation(() => {
                        throw new Error('Split error');
                    })
                };

                const result = windowsMonitorService.extractExecutableName(mockPath);

                expect(result).toBe('');
                expect(consoleSpy).toHaveBeenCalled();

                consoleSpy.mockRestore();
            });
        });
    });

    describe('testService', () => {
        test('should run comprehensive service test', async () => {
            mockApplicationDetector.getCurrentActiveApplication.mockReturnValue({
                applicationName: 'Notepad',
                windowTitle: 'Untitled - Notepad',
                processId: 1234
            });

            mockApplicationDetector.isApplicationAllowed.mockReturnValue(false);

            const results = await windowsMonitorService.testService();

            expect(results.initialization).toBe(true);
            expect(results.applicationDetection).toBe(true);
            expect(results.violationDetection).toBe(true);
            expect(results.eventEmission).toBe(true);
            expect(results.error).toBeNull();
        });

        test('should handle test failures', async () => {
            mockApplicationDetector.initialize.mockReturnValue(false);

            const results = await windowsMonitorService.testService();

            expect(results.initialization).toBe(false);
            expect(results.applicationDetection).toBe(false);
            expect(results.violationDetection).toBe(false);
        });

        test('should handle test errors', async () => {
            const error = new Error('Test error');
            mockApplicationDetector.initialize.mockImplementation(() => {
                throw error;
            });

            const results = await windowsMonitorService.testService();

            expect(results.error).toContain('Test error');
        });
    });

    describe('cleanup', () => {
        test('should cleanup all resources', () => {
            windowsMonitorService.initialize();
            windowsMonitorService.startMonitoring(['notepad']);

            const stopSpy = jest.spyOn(windowsMonitorService, 'stopMonitoring');
            const removeListenersSpy = jest.spyOn(windowsMonitorService, 'removeAllListeners');

            windowsMonitorService.cleanup();

            expect(stopSpy).toHaveBeenCalled();
            expect(mockApplicationDetector.cleanup).toHaveBeenCalled();
            expect(removeListenersSpy).toHaveBeenCalled();
        });
    });
});