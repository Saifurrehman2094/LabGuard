const os = require('os');
const path = require('path');
const fs = require('fs');

class NetworkConfigService {
  constructor() {
    this.configPath = path.join(__dirname, '../../config/network-config.json');
    this.config = this.loadConfig();
  }

  /**
   * Load network configuration from file
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        return JSON.parse(configData);
      }
      return this.getDefaultConfig();
    } catch (error) {
      console.error('Error loading network config:', error);
      return this.getDefaultConfig();
    }
  }

  /**
   * Get default configuration
   */
  getDefaultConfig() {
    return {
      deployment: {
        mode: 'local'
      },
      server: {
        host: 'AUTO'
      },
      database: {
        useSharedDatabase: false,
        sharedPath: ''
      },
      storage: {
        useSharedStorage: false,
        sharedStoragePath: ''
      }
    };
  }

  /**
   * Save configuration to file
   */
  saveConfig(config) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
      this.config = config;
      return true;
    } catch (error) {
      console.error('Error saving network config:', error);
      return false;
    }
  }

  /**
   * Get local machine's IP address on current network
   */
  getLocalIPAddress() {
    try {
      const interfaces = os.networkInterfaces();
      
      // Priority order: WiFi, Ethernet, others
      const priorityOrder = ['Wi-Fi', 'WiFi', 'WLAN', 'Ethernet', 'eth0', 'en0'];
      
      // Try priority interfaces first
      for (const interfaceName of priorityOrder) {
        if (interfaces[interfaceName]) {
          for (const iface of interfaces[interfaceName]) {
            // Skip internal and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
              return iface.address;
            }
          }
        }
      }
      
      // Fallback: find any non-internal IPv4 address
      for (const interfaceName in interfaces) {
        for (const iface of interfaces[interfaceName]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            return iface.address;
          }
        }
      }
      
      return '127.0.0.1'; // Fallback to localhost
    } catch (error) {
      console.error('Error getting local IP:', error);
      return '127.0.0.1';
    }
  }

  /**
   * Get database path based on configuration
   */
  getDatabasePath(defaultLocalPath) {
    const mode = this.config.deployment?.mode || 'local';
    
    if (mode === 'local') {
      // Use local database
      return defaultLocalPath;
    }
    
    // Network mode
    const useShared = this.config.database?.useSharedDatabase;
    const sharedPath = this.config.database?.sharedPath;
    
    if (useShared && sharedPath && sharedPath.trim() !== '') {
      console.log('Using shared database:', sharedPath);
      return sharedPath;
    }
    
    // Auto-detect: try to use server host
    const serverHost = this.getServerHost();
    if (serverHost && serverHost !== '127.0.0.1') {
      const autoPath = `\\\\${serverHost}\\labguard-data\\database.sqlite`;
      console.log('Auto-detected shared database path:', autoPath);
      return autoPath;
    }
    
    // Fallback to local
    console.log('Falling back to local database');
    return defaultLocalPath;
  }

  /**
   * Get server host (IP address)
   */
  getServerHost() {
    const configHost = this.config.server?.host;
    
    if (configHost === 'AUTO' || !configHost) {
      return this.getLocalIPAddress();
    }
    
    return configHost;
  }

  /**
   * Get current deployment mode
   */
  getDeploymentMode() {
    return this.config.deployment?.mode || 'local';
  }

  /**
   * Set deployment mode
   */
  setDeploymentMode(mode) {
    this.config.deployment = this.config.deployment || {};
    this.config.deployment.mode = mode;
    return this.saveConfig(this.config);
  }

  /**
   * Set shared database path
   */
  setSharedDatabasePath(sharedPath) {
    this.config.database = this.config.database || {};
    this.config.database.useSharedDatabase = true;
    this.config.database.sharedPath = sharedPath;
    return this.saveConfig(this.config);
  }

  /**
   * Set server host manually
   */
  setServerHost(host) {
    this.config.server = this.config.server || {};
    this.config.server.host = host;
    return this.saveConfig(this.config);
  }

  /**
   * Set shared storage path
   */
  setSharedStoragePath(storagePath) {
    this.config.storage = this.config.storage || {};
    this.config.storage.useSharedStorage = true;
    this.config.storage.sharedStoragePath = storagePath;
    return this.saveConfig(this.config);
  }

  /**
   * Get storage path based on configuration
   */
  getStoragePath(defaultLocalPath) {
    const mode = this.config.deployment?.mode || 'local';
    
    if (mode === 'local') {
      // Use local storage
      return defaultLocalPath;
    }
    
    // Network mode
    const useShared = this.config.storage?.useSharedStorage;
    const sharedPath = this.config.storage?.sharedStoragePath;
    
    if (useShared && sharedPath && sharedPath.trim() !== '') {
      console.log('Using shared storage:', sharedPath);
      return sharedPath;
    }
    
    // Auto-detect: use server host
    const serverHost = this.getServerHost();
    if (serverHost && serverHost !== '127.0.0.1') {
      const autoPath = `\\\\${serverHost}\\LabGuard`;
      console.log('Auto-detected shared storage path:', autoPath);
      return autoPath;
    }
    
    // Fallback to local
    console.log('Falling back to local storage');
    return defaultLocalPath;
  }

  /**
   * Get network information for display
   */
  getNetworkInfo() {
    const localIP = this.getLocalIPAddress();
    const serverHost = this.getServerHost();
    const mode = this.getDeploymentMode();
    
    return {
      localIP,
      serverHost,
      deploymentMode: mode,
      isServer: localIP === serverHost,
      networkInterfaces: this.getNetworkInterfaces(),
      sharedStoragePath: this.config.storage?.sharedStoragePath || `\\\\${serverHost}\\LabGuard`
    };
  }

  /**
   * Get all network interfaces
   */
  getNetworkInterfaces() {
    try {
      const interfaces = os.networkInterfaces();
      const result = [];
      
      for (const name in interfaces) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            result.push({
              name,
              address: iface.address,
              netmask: iface.netmask,
              mac: iface.mac
            });
          }
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error getting network interfaces:', error);
      return [];
    }
  }

  /**
   * Test network connectivity to server
   */
  async testServerConnection(serverHost) {
    // This is a placeholder - in real implementation, you'd ping or try to access the shared folder
    return new Promise((resolve) => {
      try {
        // Simple check: can we resolve the host?
        const testPath = `\\\\${serverHost}\\labguard-data`;
        const exists = fs.existsSync(testPath);
        resolve({
          success: exists,
          host: serverHost,
          message: exists ? 'Server accessible' : 'Cannot access server'
        });
      } catch (error) {
        resolve({
          success: false,
          host: serverHost,
          message: error.message
        });
      }
    });
  }
}

module.exports = NetworkConfigService;
