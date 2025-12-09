/**
 * Windows API wrapper for application monitoring
 * Uses Koffi for Windows API integration
 */

const koffi = require('koffi');

class WindowsApiService {
    constructor() {
        this.user32 = null;
        this.kernel32 = null;
        this.initialized = false;
        this.initializeApis();
    }

    /**
     * Initialize Windows API libraries
     */
    initializeApis() {
        try {
            // Load Windows API libraries
            this.user32 = koffi.load('user32.dll');
            this.kernel32 = koffi.load('kernel32.dll');

            // Define API function signatures
            this.defineApiFunctions();

            this.initialized = true;
            console.log('Windows API initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Windows API:', error);
            this.initialized = false;
        }
    }

    /**
     * Define Windows API function signatures
     */
    defineApiFunctions() {
        // GetForegroundWindow - Returns handle to foreground window
        this.GetForegroundWindow = this.user32.func('GetForegroundWindow', 'void*', []);

        // GetWindowText - Gets window title text
        this.GetWindowTextW = this.user32.func('GetWindowTextW', 'int', ['void*', 'str16', 'int']);

        // GetWindowThreadProcessId - Gets process ID of window
        this.GetWindowThreadProcessId = this.user32.func('GetWindowThreadProcessId', 'ulong', ['void*', 'ulong*']);

        // GetClassName - Gets window class name
        this.GetClassNameW = this.user32.func('GetClassNameW', 'int', ['void*', 'str16', 'int']);

        // IsWindow - Validates window handle
        this.IsWindow = this.user32.func('IsWindow', 'bool', ['void*']);

        // OpenProcess - Opens process handle
        this.OpenProcess = this.kernel32.func('OpenProcess', 'void*', ['ulong', 'bool', 'ulong']);

        // CloseHandle - Closes handle
        this.CloseHandle = this.kernel32.func('CloseHandle', 'bool', ['void*']);

        // QueryFullProcessImageName - Gets process executable path
        this.QueryFullProcessImageNameW = this.kernel32.func('QueryFullProcessImageNameW', 'bool', ['void*', 'ulong', 'str16', 'ulong*']);
    }

    /**
     * Check if Windows API is properly initialized
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * Get the currently active (foreground) window handle
     * @returns {Object|null} Window handle or null if failed
     */
    getForegroundWindow() {
        if (!this.initialized) {
            throw new Error('Windows API not initialized');
        }

        try {
            const hwnd = this.GetForegroundWindow();
            return hwnd;
        } catch (error) {
            console.error('Failed to get foreground window:', error);
            return null;
        }
    }

    /**
     * Get window title text
     * @param {Object} hwnd - Window handle
     * @returns {string|null} Window title or null if failed
     */
    getWindowText(hwnd) {
        if (!this.initialized || !hwnd) {
            return null;
        }

        try {
            // Validate window handle
            if (!this.IsWindow(hwnd)) {
                return null;
            }

            const buffer = Buffer.alloc(512); // 256 wide characters
            const length = this.GetWindowTextW(hwnd, buffer, 256);

            if (length > 0) {
                // Convert from UTF-16 to UTF-8
                return buffer.subarray(0, length * 2).toString('utf16le');
            }

            return '';
        } catch (error) {
            console.error('Failed to get window text:', error);
            return null;
        }
    }

    /**
     * Get window class name
     * @param {Object} hwnd - Window handle
     * @returns {string|null} Window class name or null if failed
     */
    getWindowClassName(hwnd) {
        if (!this.initialized || !hwnd) {
            return null;
        }

        try {
            if (!this.IsWindow(hwnd)) {
                return null;
            }

            const buffer = Buffer.alloc(512); // 256 wide characters
            const length = this.GetClassNameW(hwnd, buffer, 256);

            if (length > 0) {
                return buffer.subarray(0, length * 2).toString('utf16le');
            }

            return '';
        } catch (error) {
            console.error('Failed to get window class name:', error);
            return null;
        }
    }

    /**
     * Get process ID for a window
     * @param {Object} hwnd - Window handle
     * @returns {number|null} Process ID or null if failed
     */
    getWindowProcessId(hwnd) {
        if (!this.initialized || !hwnd) {
            return null;
        }

        try {
            if (!this.IsWindow(hwnd)) {
                return null;
            }

            const processIdBuffer = Buffer.alloc(4);
            this.GetWindowThreadProcessId(hwnd, processIdBuffer);

            return processIdBuffer.readUInt32LE(0);
        } catch (error) {
            console.error('Failed to get window process ID:', error);
            return null;
        }
    }

    /**
     * Get process executable path
     * @param {number} processId - Process ID
     * @returns {string|null} Process executable path or null if failed
     */
    getProcessExecutablePath(processId) {
        if (!this.initialized || !processId) {
            return null;
        }

        try {
            // Open process with PROCESS_QUERY_LIMITED_INFORMATION (0x1000)
            const processHandle = this.OpenProcess(0x1000, false, processId);

            if (!processHandle) {
                return null;
            }

            const buffer = Buffer.alloc(1024); // 512 wide characters
            const sizeBuffer = Buffer.alloc(4);
            sizeBuffer.writeUInt32LE(512, 0);

            const success = this.QueryFullProcessImageNameW(processHandle, 0, buffer, sizeBuffer);

            // Close process handle
            this.CloseHandle(processHandle);

            if (success) {
                const pathLength = sizeBuffer.readUInt32LE(0);
                if (pathLength > 0) {
                    return buffer.subarray(0, pathLength * 2).toString('utf16le');
                }
            }

            return null;
        } catch (error) {
            console.error('Failed to get process executable path:', error);
            return null;
        }
    }

    /**
     * Extract application name from executable path
     * @param {string} executablePath - Full path to executable
     * @returns {string} Application name
     */
    extractApplicationName(executablePath) {
        if (!executablePath) {
            return 'Unknown';
        }

        try {
            // Extract filename from path
            const filename = executablePath.split('\\').pop() || executablePath;

            // Remove .exe extension
            return filename.replace(/\.exe$/i, '');
        } catch (error) {
            console.error('Failed to extract application name:', error);
            return 'Unknown';
        }
    }

    /**
     * Get comprehensive information about the active window
     * @returns {Object|null} Window information object or null if failed
     */
    getActiveWindowInfo() {
        if (!this.initialized) {
            throw new Error('Windows API not initialized');
        }

        try {
            const hwnd = this.getForegroundWindow();
            if (!hwnd) {
                return null;
            }

            const windowTitle = this.getWindowText(hwnd);
            const className = this.getWindowClassName(hwnd);
            const processId = this.getWindowProcessId(hwnd);
            const executablePath = processId ? this.getProcessExecutablePath(processId) : null;
            const applicationName = this.extractApplicationName(executablePath);

            return {
                windowHandle: hwnd,
                windowTitle: windowTitle || '',
                className: className || '',
                processId: processId || 0,
                executablePath: executablePath || '',
                applicationName: applicationName,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Failed to get active window info:', error);
            return null;
        }
    }

    /**
     * Test Windows API functionality
     * @returns {Object} Test results
     */
    testApi() {
        const results = {
            initialized: this.initialized,
            canGetForegroundWindow: false,
            canGetWindowText: false,
            canGetProcessInfo: false,
            activeWindow: null,
            error: null
        };

        try {
            if (!this.initialized) {
                results.error = 'Windows API not initialized';
                return results;
            }

            // Test getting foreground window
            const hwnd = this.getForegroundWindow();
            results.canGetForegroundWindow = hwnd !== null;

            if (hwnd) {
                // Test getting window text
                const windowText = this.getWindowText(hwnd);
                results.canGetWindowText = windowText !== null;

                // Test getting process info
                const processId = this.getWindowProcessId(hwnd);
                results.canGetProcessInfo = processId !== null;

                // Get full window info
                results.activeWindow = this.getActiveWindowInfo();
            }

        } catch (error) {
            results.error = error.message;
        }

        return results;
    }
}

module.exports = WindowsApiService;