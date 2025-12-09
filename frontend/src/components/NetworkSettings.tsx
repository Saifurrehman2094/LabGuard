import React, { useState, useEffect } from 'react';
import './NetworkSettings.css';

interface NetworkInfo {
  localIP: string;
  serverHost: string;
  deploymentMode: string;
  isServer: boolean;
  networkInterfaces: Array<{
    name: string;
    address: string;
    netmask: string;
    mac: string;
  }>;
}

interface NetworkSettingsProps {
  currentUser: any;
}

const NetworkSettings: React.FC<NetworkSettingsProps> = ({ currentUser }) => {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [deploymentMode, setDeploymentMode] = useState<string>('local');
  const [serverHost, setServerHost] = useState<string>('');
  const [databasePath, setDatabasePath] = useState<string>('');
  const [currentDatabasePath, setCurrentDatabasePath] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Check if running in Electron
  const isElectron = () => {
    return !!(window as any).electronAPI;
  };

  useEffect(() => {
    loadNetworkInfo();
  }, []);

  const loadNetworkInfo = async () => {
    if (!isElectron()) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Get network info
      const infoResult = await (window as any).electronAPI.getNetworkInfo();
      if (infoResult.success) {
        setNetworkInfo(infoResult.data);
        setServerHost(infoResult.data.serverHost);
      }

      // Get deployment mode
      const modeResult = await (window as any).electronAPI.getNetworkMode();
      if (modeResult.success) {
        setDeploymentMode(modeResult.mode);
      }

      // Get current database path
      const pathResult = await (window as any).electronAPI.getNetworkDatabasePath();
      if (pathResult.success) {
        setCurrentDatabasePath(pathResult.path);
      }

    } catch (error) {
      console.error('Error loading network info:', error);
      showMessage('error', 'Failed to load network information');
    } finally {
      setIsLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleSetDeploymentMode = async (mode: string) => {
    if (!isElectron()) return;

    try {
      const result = await (window as any).electronAPI.setNetworkMode(mode);
      if (result.success) {
        setDeploymentMode(result.mode);
        showMessage('success', `Deployment mode set to: ${result.mode}`);
        await loadNetworkInfo();
      } else {
        showMessage('error', result.error || 'Failed to set deployment mode');
      }
    } catch (error: any) {
      console.error('Error setting deployment mode:', error);
      showMessage('error', error.message || 'Failed to set deployment mode');
    }
  };

  const handleSetServerHost = async () => {
    if (!isElectron() || !serverHost.trim()) return;

    try {
      const result = await (window as any).electronAPI.setNetworkServer(serverHost.trim());
      if (result.success) {
        showMessage('success', `Server host set to: ${result.serverHost}`);
        await loadNetworkInfo();
      } else {
        showMessage('error', result.error || 'Failed to set server host');
      }
    } catch (error: any) {
      console.error('Error setting server host:', error);
      showMessage('error', error.message || 'Failed to set server host');
    }
  };

  const handleSetDatabasePath = async () => {
    if (!isElectron() || !databasePath.trim()) return;

    try {
      const result = await (window as any).electronAPI.setNetworkDatabasePath(databasePath.trim());
      if (result.success) {
        showMessage('info', result.message || 'Database path updated. Please restart the application.');
        setDatabasePath('');
        await loadNetworkInfo();
      } else {
        showMessage('error', result.error || 'Failed to set database path');
      }
    } catch (error: any) {
      console.error('Error setting database path:', error);
      showMessage('error', error.message || 'Failed to set database path');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showMessage('success', 'Copied to clipboard!');
  };

  if (!isElectron()) {
    return (
      <div className="network-settings">
        <div className="info-message">
          Network settings are only available in Electron mode.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="network-settings">
        <div className="loading-spinner"></div>
        <p>Loading network information...</p>
      </div>
    );
  }

  return (
    <div className="network-settings">
      <h2>Network Configuration</h2>

      {message && (
        <div className={`message message-${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Current Network Info */}
      <div className="network-info-section">
        <h3>📡 Current Network Information</h3>
        <div className="info-grid">
          <div className="info-item">
            <label>Your IP Address:</label>
            <div className="info-value">
              <code>{networkInfo?.localIP || 'Unknown'}</code>
              <button
                className="btn-copy"
                onClick={() => copyToClipboard(networkInfo?.localIP || '')}
                title="Copy to clipboard"
              >
                📋
              </button>
            </div>
          </div>

          <div className="info-item">
            <label>Deployment Mode:</label>
            <div className="info-value">
              <span className={`badge badge-${deploymentMode}`}>
                {deploymentMode === 'local' ? '🏠 Local' : '🌐 Network'}
              </span>
            </div>
          </div>

          <div className="info-item">
            <label>Role:</label>
            <div className="info-value">
              <span className={`badge ${networkInfo?.isServer ? 'badge-server' : 'badge-client'}`}>
                {networkInfo?.isServer ? '🖥️ Server' : '💻 Client'}
              </span>
            </div>
          </div>

          <div className="info-item full-width">
            <label>Current Database Path:</label>
            <div className="info-value">
              <code className="path-display">{currentDatabasePath}</code>
            </div>
          </div>
        </div>
      </div>

      {/* Network Interfaces */}
      {networkInfo && networkInfo.networkInterfaces.length > 0 && (
        <div className="network-interfaces-section">
          <h3>🔌 Network Interfaces</h3>
          <div className="interfaces-list">
            {networkInfo.networkInterfaces.map((iface, index) => (
              <div key={index} className="interface-item">
                <div className="interface-name">{iface.name}</div>
                <div className="interface-details">
                  <span>IP: <code>{iface.address}</code></span>
                  <span>Mask: <code>{iface.netmask}</code></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deployment Mode Configuration */}
      <div className="config-section">
        <h3>⚙️ Deployment Configuration</h3>
        
        <div className="mode-selector">
          <label>Select Deployment Mode:</label>
          <div className="mode-buttons">
            <button
              className={`mode-btn ${deploymentMode === 'local' ? 'active' : ''}`}
              onClick={() => handleSetDeploymentMode('local')}
            >
              <span className="mode-icon">🏠</span>
              <span className="mode-label">Local Mode</span>
              <span className="mode-desc">Use local database only</span>
            </button>
            <button
              className={`mode-btn ${deploymentMode === 'network' ? 'active' : ''}`}
              onClick={() => handleSetDeploymentMode('network')}
            >
              <span className="mode-icon">🌐</span>
              <span className="mode-label">Network Mode</span>
              <span className="mode-desc">Share database on network</span>
            </button>
          </div>
        </div>
      </div>

      {/* Server Configuration (Network Mode) */}
      {deploymentMode === 'network' && (
        <div className="config-section">
          <h3>🖥️ Server Configuration</h3>
          
          <div className="form-group">
            <label>Server IP Address:</label>
            <div className="input-with-button">
              <input
                type="text"
                value={serverHost}
                onChange={(e) => setServerHost(e.target.value)}
                placeholder="e.g., 192.168.1.105 or AUTO"
                className="input-field"
              />
              <button
                onClick={handleSetServerHost}
                className="btn-primary"
                disabled={!serverHost.trim()}
              >
                Set Server
              </button>
            </div>
            <small className="help-text">
              Use 'AUTO' to auto-detect, or enter a specific IP address
            </small>
          </div>

          <div className="form-group">
            <label>Shared Database Path:</label>
            <div className="input-with-button">
              <input
                type="text"
                value={databasePath}
                onChange={(e) => setDatabasePath(e.target.value)}
                placeholder="e.g., \\192.168.1.105\labguard-data\database.sqlite"
                className="input-field"
              />
              <button
                onClick={handleSetDatabasePath}
                className="btn-primary"
                disabled={!databasePath.trim()}
              >
                Set Path
              </button>
            </div>
            <small className="help-text">
              Network path to shared database (requires restart)
            </small>
          </div>
        </div>
      )}

      {/* Setup Instructions */}
      <div className="instructions-section">
        <h3>📋 Setup Instructions</h3>
        
        {deploymentMode === 'local' ? (
          <div className="instruction-box">
            <p><strong>Local Mode:</strong> Using local database only.</p>
            <p>No network configuration needed. All data is stored locally on this machine.</p>
          </div>
        ) : networkInfo?.isServer ? (
          <div className="instruction-box">
            <p><strong>Server Mode Setup:</strong></p>
            <ol>
              <li>Share the <code>backend/data</code> folder on your network</li>
              <li>Set share name to: <code>labguard-data</code></li>
              <li>Give "Everyone" Read/Write permissions</li>
              <li>Share this information with clients:</li>
            </ol>
            <div className="share-info">
              <div className="share-item">
                <strong>Server IP:</strong>
                <code>{networkInfo.localIP}</code>
                <button
                  className="btn-copy-small"
                  onClick={() => copyToClipboard(networkInfo.localIP)}
                >
                  📋
                </button>
              </div>
              <div className="share-item">
                <strong>Network Path:</strong>
                <code>\\{networkInfo.localIP}\labguard-data\database.sqlite</code>
                <button
                  className="btn-copy-small"
                  onClick={() => copyToClipboard(`\\\\${networkInfo.localIP}\\labguard-data\\database.sqlite`)}
                >
                  📋
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="instruction-box">
            <p><strong>Client Mode Setup:</strong></p>
            <ol>
              <li>Get server IP address from the server administrator</li>
              <li>Enter server IP in the "Server IP Address" field above</li>
              <li>Enter shared database path (e.g., \\SERVER-IP\labguard-data\database.sqlite)</li>
              <li>Restart the application</li>
            </ol>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <button onClick={loadNetworkInfo} className="btn-secondary">
          🔄 Refresh Network Info
        </button>
      </div>
    </div>
  );
};

export default NetworkSettings;
