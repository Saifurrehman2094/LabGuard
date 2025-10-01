// Mock dependencies before importing
jest.mock('../../services/database', () => {
  return jest.fn().mockImplementation(() => ({
    getUserByCredentials: jest.fn(),
    getUserById: jest.fn(),
    registerDevice: jest.fn(),
    initializeDatabase: jest.fn(),
    close: jest.fn(),
    db: {}
  }));
});

jest.mock('jsonwebtoken');
jest.mock('os');

const AuthService = require('../../services/auth');
const DatabaseService = require('../../services/database');
const jwt = require('jsonwebtoken');
const os = require('os');

describe('AuthService', () => {
  let authService;
  let mockDbService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock OS methods
    os.hostname.mockReturnValue('test-machine');
    os.platform.mockReturnValue('win32');
    os.arch.mockReturnValue('x64');
    os.cpus.mockReturnValue([{}, {}]); // 2 CPUs
    os.totalmem.mockReturnValue(8589934592); // 8GB

    // Create mock database service
    mockDbService = {
      getUserByCredentials: jest.fn(),
      getUserById: jest.fn(),
      registerDevice: jest.fn(),
      initializeDatabase: jest.fn(),
      close: jest.fn(),
      db: {}
    };

    DatabaseService.mockImplementation(() => mockDbService);

    // Create auth service instance
    authService = new AuthService();
  });

  afterEach(() => {
    authService.close();
  });

  describe('Device ID Generation', () => {
    test('should generate consistent device ID based on machine info', () => {
      const deviceId1 = authService.generateDeviceId();
      const deviceId2 = authService.generateDeviceId();
      
      expect(deviceId1).toBe(deviceId2);
      expect(deviceId1).toHaveLength(32); // MD5 hash length
    });

    test('should register device in database', async () => {
      mockDbService.registerDevice.mockResolvedValue(true);
      
      const deviceId = await authService.registerDevice();
      
      expect(mockDbService.registerDevice).toHaveBeenCalledWith(
        expect.any(String),
        'test-machine'
      );
      expect(deviceId).toHaveLength(32);
    });
  });

  describe('Login', () => {
    const mockUser = {
      user_id: 'user123',
      username: 'testuser',
      role: 'student',
      full_name: 'Test User'
    };

    test('should successfully login with valid credentials', async () => {
      mockDbService.getUserByCredentials.mockResolvedValue(mockUser);
      mockDbService.registerDevice.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-jwt-token');

      const result = await authService.login('testuser', 'password123');

      expect(result.success).toBe(true);
      expect(result.token).toBe('mock-jwt-token');
      expect(result.user.userId).toBe('user123');
      expect(result.user.username).toBe('testuser');
      expect(result.user.role).toBe('student');
      expect(result.deviceId).toBeDefined();
      expect(mockDbService.getUserByCredentials).toHaveBeenCalledWith('testuser', 'password123');
    });

    test('should fail login with invalid credentials', async () => {
      mockDbService.getUserByCredentials.mockResolvedValue(null);

      const result = await authService.login('testuser', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      expect(result.token).toBeUndefined();
    });

    test('should fail login with missing username', async () => {
      const result = await authService.login('', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Username and password are required');
    });

    test('should fail login with missing password', async () => {
      const result = await authService.login('testuser', '');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Username and password are required');
    });

    test('should handle database errors during login', async () => {
      mockDbService.getUserByCredentials.mockRejectedValue(new Error('Database error'));

      const result = await authService.login('testuser', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });

    test('should create JWT token with correct payload', async () => {
      mockDbService.getUserByCredentials.mockResolvedValue(mockUser);
      mockDbService.registerDevice.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-jwt-token');

      await authService.login('testuser', 'password123');

      expect(jwt.sign).toHaveBeenCalledWith(
        {
          userId: 'user123',
          username: 'testuser',
          role: 'student',
          deviceId: expect.any(String),
          fullName: 'Test User'
        },
        expect.any(String),
        {
          expiresIn: '8h',
          issuer: 'lab-guard',
          audience: 'lab-guard-client'
        }
      );
    });
  });

  describe('Logout', () => {
    test('should successfully logout and clear session', async () => {
      // First login to create a session
      const mockUser = {
        user_id: 'user123',
        username: 'testuser',
        role: 'student',
        full_name: 'Test User'
      };
      
      mockDbService.getUserByCredentials.mockResolvedValue(mockUser);
      mockDbService.registerDevice.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-jwt-token');

      await authService.login('testuser', 'password123');
      expect(authService.isLoggedIn()).toBe(true);

      // Now logout
      const result = await authService.logout();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Logged out successfully');
      expect(authService.isLoggedIn()).toBe(false);
      expect(authService.getCurrentSession()).toBeNull();
    });

    test('should handle logout when no session exists', async () => {
      const result = await authService.logout();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Logged out successfully');
    });
  });

  describe('Token Validation', () => {
    const mockDecodedToken = {
      userId: 'user123',
      username: 'testuser',
      role: 'student',
      fullName: 'Test User',
      deviceId: 'device456',
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      iat: Math.floor(Date.now() / 1000)
    };

    test('should validate valid token successfully', async () => {
      jwt.verify.mockReturnValue(mockDecodedToken);
      mockDbService.getUserById.mockReturnValue({ user_id: 'user123' });

      const result = await authService.validateToken('valid-token');

      expect(result.valid).toBe(true);
      expect(result.user.userId).toBe('user123');
      expect(result.user.username).toBe('testuser');
      expect(result.deviceId).toBe('device456');
    });

    test('should reject token when user no longer exists', async () => {
      jwt.verify.mockReturnValue(mockDecodedToken);
      mockDbService.getUserById.mockReturnValue(null);

      const result = await authService.validateToken('valid-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('User no longer exists');
    });

    test('should handle expired token', async () => {
      const expiredError = new Error('Token expired');
      expiredError.name = 'TokenExpiredError';
      jwt.verify.mockImplementation(() => {
        throw expiredError;
      });

      const result = await authService.validateToken('expired-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token has expired');
      expect(result.expired).toBe(true);
    });

    test('should handle invalid token', async () => {
      const invalidError = new Error('Invalid token');
      invalidError.name = 'JsonWebTokenError';
      jwt.verify.mockImplementation(() => {
        throw invalidError;
      });

      const result = await authService.validateToken('invalid-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
      expect(result.expired).toBe(false);
    });

    test('should handle missing token', async () => {
      const result = await authService.validateToken('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token is required');
    });
  });

  describe('Session Management', () => {
    test('should track current session after login', async () => {
      const mockUser = {
        user_id: 'user123',
        username: 'testuser',
        role: 'student',
        full_name: 'Test User'
      };
      
      mockDbService.getUserByCredentials.mockResolvedValue(mockUser);
      mockDbService.registerDevice.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-jwt-token');

      await authService.login('testuser', 'password123');

      const session = authService.getCurrentSession();
      expect(session).toBeDefined();
      expect(session.token).toBe('mock-jwt-token');
      expect(session.user.userId).toBe('user123');
      expect(session.deviceId).toBeDefined();
      expect(session.loginTime).toBeDefined();
    });

    test('should return current user information', async () => {
      const mockUser = {
        user_id: 'user123',
        username: 'testuser',
        role: 'student',
        full_name: 'Test User'
      };
      
      mockDbService.getUserByCredentials.mockResolvedValue(mockUser);
      mockDbService.registerDevice.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-jwt-token');

      await authService.login('testuser', 'password123');

      const currentUser = authService.getCurrentUser();
      expect(currentUser.userId).toBe('user123');
      expect(currentUser.username).toBe('testuser');
      expect(currentUser.role).toBe('student');
    });

    test('should return null for current user when not logged in', () => {
      const currentUser = authService.getCurrentUser();
      expect(currentUser).toBeNull();
    });

    test('should track login status correctly', async () => {
      expect(authService.isLoggedIn()).toBe(false);

      const mockUser = {
        user_id: 'user123',
        username: 'testuser',
        role: 'student',
        full_name: 'Test User'
      };
      
      mockDbService.getUserByCredentials.mockResolvedValue(mockUser);
      mockDbService.registerDevice.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-jwt-token');

      await authService.login('testuser', 'password123');
      expect(authService.isLoggedIn()).toBe(true);

      await authService.logout();
      expect(authService.isLoggedIn()).toBe(false);
    });
  });

  describe('Token Refresh', () => {
    test('should refresh token when close to expiration', async () => {
      // Setup existing session
      const mockUser = {
        user_id: 'user123',
        username: 'testuser',
        role: 'student',
        full_name: 'Test User'
      };
      
      mockDbService.getUserByCredentials.mockResolvedValue(mockUser);
      mockDbService.registerDevice.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-jwt-token');

      await authService.login('testuser', 'password123');

      // Mock token validation for refresh
      const soonToExpireToken = {
        userId: 'user123',
        username: 'testuser',
        role: 'student',
        fullName: 'Test User',
        deviceId: 'device456',
        exp: Math.floor(Date.now() / 1000) + 1800, // 30 minutes from now
        iat: Math.floor(Date.now() / 1000)
      };

      jwt.verify.mockReturnValue(soonToExpireToken);
      mockDbService.getUserById.mockReturnValue({ user_id: 'user123' });
      jwt.sign.mockReturnValue('new-jwt-token');

      const result = await authService.refreshToken();

      expect(result.success).toBe(true);
      expect(result.token).toBe('new-jwt-token');
      expect(result.message).toBe('Token refreshed successfully');
    });

    test('should not refresh token when still valid for long time', async () => {
      // Setup existing session
      const mockUser = {
        user_id: 'user123',
        username: 'testuser',
        role: 'student',
        full_name: 'Test User'
      };
      
      mockDbService.getUserByCredentials.mockResolvedValue(mockUser);
      mockDbService.registerDevice.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-jwt-token');

      await authService.login('testuser', 'password123');

      // Mock token validation for refresh
      const validToken = {
        userId: 'user123',
        username: 'testuser',
        role: 'student',
        fullName: 'Test User',
        deviceId: 'device456',
        exp: Math.floor(Date.now() / 1000) + 7200, // 2 hours from now
        iat: Math.floor(Date.now() / 1000)
      };

      jwt.verify.mockReturnValue(validToken);
      mockDbService.getUserById.mockReturnValue({ user_id: 'user123' });

      const result = await authService.refreshToken();

      expect(result.success).toBe(true);
      expect(result.token).toBe('mock-jwt-token'); // Original token
      expect(result.message).toBe('Token still valid, no refresh needed');
    });

    test('should fail to refresh when no active session', async () => {
      const result = await authService.refreshToken();

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active session to refresh');
    });
  });

  describe('Initialization', () => {
    test('should initialize database service', async () => {
      mockDbService.initializeDatabase.mockResolvedValue(true);
      mockDbService.db = null;

      const result = await authService.initialize();

      expect(result).toBe(true);
      expect(mockDbService.initializeDatabase).toHaveBeenCalled();
    });

    test('should not reinitialize if database already connected', async () => {
      mockDbService.db = {}; // Already connected

      const result = await authService.initialize();

      expect(result).toBe(true);
      expect(mockDbService.initializeDatabase).not.toHaveBeenCalled();
    });

    test('should handle initialization errors', async () => {
      mockDbService.initializeDatabase.mockRejectedValue(new Error('Init failed'));
      mockDbService.db = null;

      await expect(authService.initialize()).rejects.toThrow('Init failed');
    });
  });
});