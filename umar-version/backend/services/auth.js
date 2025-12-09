const jwt = require('jsonwebtoken');
const os = require('os');
const crypto = require('crypto');
const DatabaseService = require('./database');
const FaceRecognitionService = require('./faceRecognition');

// Generate UUID v4 using crypto module
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

class AuthService {
  constructor(dbService = null, faceService = null) {
    this.dbService = dbService || new DatabaseService();
    this.faceService = faceService || new FaceRecognitionService(this.dbService);
    this.jwtSecret = this.generateJWTSecret();
    this.tokenExpiration = '8h'; // 8 hours for typical exam duration
    this.currentSession = null;
    this.deviceId = null;
    this.pendingAuth = new Map(); // Store pending 2FA sessions
  }

  /**
   * Generate a JWT secret key for token signing
   * In production, this should be stored securely
   */
  generateJWTSecret() {
    // For development, use a consistent secret based on machine info
    const machineInfo = os.hostname() + os.platform() + os.arch();
    return crypto.createHash('sha256').update(machineInfo).digest('hex');
  }

  /**
   * Generate unique device ID for the current machine
   */
  generateDeviceId() {
    if (this.deviceId) {
      return this.deviceId;
    }

    // Create device ID based on machine characteristics
    const machineInfo = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalmem: os.totalmem()
    };

    const deviceString = JSON.stringify(machineInfo);
    this.deviceId = crypto.createHash('md5').update(deviceString).digest('hex');

    return this.deviceId;
  }

  /**
   * Register device in database
   */
  async registerDevice() {
    try {
      const deviceId = this.generateDeviceId();
      const deviceName = os.hostname();

      await this.dbService.registerDevice(deviceId, deviceName);
      return deviceId;
    } catch (error) {
      console.error('Error registering device:', error);
      throw error;
    }
  }

  /**
   * Login user with username and password (First factor authentication)
   */
  async login(username, password) {
    try {
      // Validate input
      if (!username || !password) {
        throw new Error('Username and password are required');
      }

      // Verify credentials against database
      const user = await this.dbService.getUserByCredentials(username, password);

      if (!user) {
        // Log failed login attempt
        this.dbService.logAuditEvent(null, 'LOGIN_FAILED', {
          username,
          reason: 'Invalid credentials'
        });
        throw new Error('Invalid credentials');
      }

      // Update last login time
      this.dbService.db.prepare("UPDATE users SET last_login = datetime('now') WHERE user_id = ?").run(user.user_id);

      // Generate device ID and register device
      const deviceId = await this.registerDevice();

      // Check if user is a student and has registered face data
      const isStudent = user.role === 'student';
      const hasRegisteredFace = isStudent ? this.faceService.hasRegisteredFace(user.user_id) : false;

      console.log('Login check - User:', username, 'Role:', user.role, 'IsStudent:', isStudent, 'HasRegisteredFace:', hasRegisteredFace);

      // Log successful credential verification
      this.dbService.logAuditEvent(user.user_id, 'CREDENTIALS_VERIFIED', {
        username,
        role: user.role,
        hasRegisteredFace,
        deviceId
      });

      // Only require face authentication for students with registered faces
      if (isStudent && hasRegisteredFace) {
        console.log('Requiring face authentication for student:', username);
        // For students with face registration, require 2FA
        const sessionId = this.generateSessionId();

        // Store pending authentication session
        this.pendingAuth.set(sessionId, {
          user,
          deviceId,
          timestamp: Date.now(),
          credentialsVerified: true
        });

        // Clean up old pending sessions (older than 5 minutes)
        this.cleanupPendingSessions();

        return {
          success: true,
          requiresFaceAuth: true,
          sessionId,
          user: {
            userId: user.user_id,
            username: user.username,
            role: user.role,
            fullName: user.full_name
          },
          message: 'Credentials verified. Please complete face authentication.'
        };
      }

      // For non-students or students without face registration, complete login immediately
      return await this.completeLogin(user, deviceId, false);

    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Complete face authentication (Second factor)
   */
  async completeFaceAuth(sessionId, faceEmbedding) {
    try {
      // Get pending session
      const pendingSession = this.pendingAuth.get(sessionId);

      if (!pendingSession) {
        throw new Error('Invalid or expired session');
      }

      if (!pendingSession.credentialsVerified) {
        throw new Error('Credentials not verified');
      }

      const { user, deviceId } = pendingSession;

      // Verify face against stored embedding
      const faceVerification = await this.faceService.verifyFace(user.user_id, faceEmbedding);

      if (!faceVerification.verified) {
        // Log failed face authentication
        this.dbService.logAuditEvent(user.user_id, 'FACE_AUTH_FAILED', {
          distance: faceVerification.distance,
          threshold: faceVerification.threshold,
          reason: faceVerification.reason
        });

        return {
          success: false,
          error: 'Face authentication failed',
          details: faceVerification
        };
      }

      // Remove pending session
      this.pendingAuth.delete(sessionId);

      // Complete login with face verification
      const loginResult = await this.completeLogin(user, deviceId, true);

      // Log successful 2FA completion
      this.dbService.logAuditEvent(user.user_id, 'TWO_FACTOR_AUTH_SUCCESS', {
        faceDistance: faceVerification.distance,
        faceThreshold: faceVerification.threshold
      });

      return loginResult;

    } catch (error) {
      console.error('Face authentication error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Complete login process and generate session token
   */
  async completeLogin(user, deviceId, faceVerified = false) {
    try {
      // Create JWT token payload
      const tokenPayload = {
        userId: user.user_id,
        username: user.username,
        role: user.role,
        deviceId: deviceId,
        fullName: user.full_name,
        faceVerified
      };

      // Generate JWT token
      const token = jwt.sign(tokenPayload, this.jwtSecret, {
        expiresIn: this.tokenExpiration,
        issuer: 'lab-guard',
        audience: 'lab-guard-client'
      });

      // Store current session
      this.currentSession = {
        token,
        user: {
          userId: user.user_id,
          username: user.username,
          role: user.role,
          fullName: user.full_name
        },
        deviceId,
        faceVerified,
        loginTime: new Date().toISOString()
      };

      // Log successful login
      this.dbService.logAuditEvent(user.user_id, 'LOGIN_SUCCESS', {
        faceVerified,
        deviceId
      });

      return {
        success: true,
        token,
        user: this.currentSession.user,
        deviceId,
        faceVerified,
        expiresIn: this.tokenExpiration
      };

    } catch (error) {
      console.error('Complete login error:', error);
      throw error;
    }
  }

  /**
   * Logout user and cleanup session
   */
  async logout() {
    try {
      if (this.currentSession) {
        // Clear current session
        this.currentSession = null;
      }

      return {
        success: true,
        message: 'Logged out successfully'
      };
    } catch (error) {
      console.error('Logout error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate JWT token
   */
  async validateToken(token) {
    try {
      if (!token) {
        throw new Error('Token is required');
      }

      // Verify and decode token
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: 'lab-guard',
        audience: 'lab-guard-client'
      });

      // Check if user still exists in database
      const user = this.dbService.getUserById(decoded.userId);

      if (!user) {
        throw new Error('User no longer exists');
      }

      return {
        valid: true,
        user: {
          userId: decoded.userId,
          username: decoded.username,
          role: decoded.role,
          fullName: decoded.fullName
        },
        deviceId: decoded.deviceId,
        exp: decoded.exp,
        iat: decoded.iat
      };

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return {
          valid: false,
          error: 'Token has expired',
          expired: true
        };
      } else if (error.name === 'JsonWebTokenError') {
        return {
          valid: false,
          error: 'Invalid token',
          expired: false
        };
      } else {
        return {
          valid: false,
          error: error.message,
          expired: false
        };
      }
    }
  }

  /**
   * Get current session information
   */
  getCurrentSession() {
    return this.currentSession;
  }

  /**
   * Check if user is currently logged in
   */
  isLoggedIn() {
    return this.currentSession !== null;
  }

  /**
   * Get current user information
   */
  getCurrentUser() {
    return this.currentSession ? this.currentSession.user : null;
  }

  /**
   * Get current device ID
   */
  getCurrentDeviceId() {
    return this.deviceId || this.generateDeviceId();
  }

  /**
   * Refresh token if it's close to expiration
   */
  async refreshToken() {
    try {
      if (!this.currentSession) {
        throw new Error('No active session to refresh');
      }

      const validation = await this.validateToken(this.currentSession.token);

      if (!validation.valid) {
        throw new Error('Current token is invalid');
      }

      // Check if token expires within next hour
      const currentTime = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = validation.exp - currentTime;

      if (timeUntilExpiry > 3600) { // More than 1 hour remaining
        return {
          success: true,
          token: this.currentSession.token,
          message: 'Token still valid, no refresh needed'
        };
      }

      // Generate new token with same payload
      const tokenPayload = {
        userId: validation.user.userId,
        username: validation.user.username,
        role: validation.user.role,
        deviceId: validation.deviceId,
        fullName: validation.user.fullName
      };

      const newToken = jwt.sign(tokenPayload, this.jwtSecret, {
        expiresIn: this.tokenExpiration,
        issuer: 'lab-guard',
        audience: 'lab-guard-client'
      });

      // Update current session
      this.currentSession.token = newToken;

      return {
        success: true,
        token: newToken,
        message: 'Token refreshed successfully'
      };

    } catch (error) {
      console.error('Token refresh error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Initialize database connection and face service if not already done
   */
  async initialize() {
    try {
      if (!this.dbService.db) {
        await this.dbService.initializeDatabase();
      }

      // Initialize face recognition service
      await this.initializeFaceService();

      return true;
    } catch (error) {
      console.error('AuthService initialization error:', error);
      throw error;
    }
  }

  /**
   * Generate session ID for pending 2FA sessions
   */
  generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Clean up expired pending sessions
   */
  cleanupPendingSessions() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [sessionId, session] of this.pendingAuth.entries()) {
      if (now - session.timestamp > maxAge) {
        this.pendingAuth.delete(sessionId);
      }
    }
  }

  /**
   * Get pending authentication session
   */
  getPendingSession(sessionId) {
    return this.pendingAuth.get(sessionId);
  }

  /**
   * Check if user requires face authentication (only for students)
   */
  requiresFaceAuth(userId) {
    const user = this.dbService.getUserById(userId);
    if (!user || user.role !== 'student') {
      return false;
    }
    return this.faceService.hasRegisteredFace(userId);
  }

  /**
   * Get authentication status for a user
   */
  getAuthStatus(userId) {
    try {
      const hasRegisteredFace = this.faceService.hasRegisteredFace(userId);
      const user = this.dbService.getUserById(userId);

      return {
        userId,
        username: user ? user.username : null,
        hasRegisteredFace,
        requiresFaceAuth: hasRegisteredFace,
        isLoggedIn: this.isLoggedIn() && this.currentSession.user.userId === userId
      };
    } catch (error) {
      console.error('Error getting auth status:', error);
      return null;
    }
  }

  /**
   * Initialize face recognition service
   */
  async initializeFaceService() {
    try {
      await this.faceService.initialize();
      console.log('Face recognition service initialized in AuthService');
      return true;
    } catch (error) {
      console.error('Error initializing face service:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.dbService) {
      this.dbService.close();
    }
    if (this.faceService) {
      this.faceService.close();
    }
  }
}

module.exports = AuthService;