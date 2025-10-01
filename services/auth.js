const jwt = require('jsonwebtoken');
const os = require('os');
const crypto = require('crypto');
const DatabaseService = require('./database');

// Generate UUID v4 using crypto module
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

class AuthService {
  constructor(dbService = null) {
    this.dbService = dbService || new DatabaseService();
    this.jwtSecret = this.generateJWTSecret();
    this.tokenExpiration = '8h'; // 8 hours for typical exam duration
    this.currentSession = null;
    this.deviceId = null;
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
   * Login user with username and password
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
        throw new Error('Invalid credentials');
      }

      // Generate device ID and register device
      const deviceId = await this.registerDevice();

      // Create JWT token payload
      const tokenPayload = {
        userId: user.user_id,
        username: user.username,
        role: user.role,
        deviceId: deviceId,
        fullName: user.full_name
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
        loginTime: new Date().toISOString()
      };

      return {
        success: true,
        token,
        user: this.currentSession.user,
        deviceId,
        expiresIn: this.tokenExpiration
      };

    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.message
      };
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
   * Initialize database connection if not already done
   */
  async initialize() {
    try {
      if (!this.dbService.db) {
        await this.dbService.initializeDatabase();
      }
      return true;
    } catch (error) {
      console.error('AuthService initialization error:', error);
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
  }
}

module.exports = AuthService;