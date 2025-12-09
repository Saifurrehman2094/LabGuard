/**
 * Setup Server Storage - Configure Windows Network Share
 * 
 * This script sets up the LabGuard folder as a network share
 * so that all clients on the network can access files.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

console.log('='.repeat(60));
console.log('LabGuard Server Storage Setup');
console.log('='.repeat(60));
console.log();

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIP = getLocalIP();
console.log('Server IP Address:', localIP);
console.log();

// Define paths
const projectRoot = __dirname;
const dataDir = path.join(projectRoot, 'backend', 'data');
const shareName = 'LabGuard';
const shareDescription = 'LabGuard Exam System Storage';

console.log('Project Root:', projectRoot);
console.log('Data Directory:', dataDir);
console.log('Share Name:', shareName);
console.log();

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  console.log('Creating data directory...');
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✓ Data directory created');
} else {
  console.log('✓ Data directory exists');
}

// Create subdirectories
const uploadsDir = path.join(dataDir, 'uploads');
const submissionsDir = path.join(dataDir, 'submissions');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✓ Uploads directory created');
}

if (!fs.existsSync(submissionsDir)) {
  fs.mkdirSync(submissionsDir, { recursive: true });
  console.log('✓ Submissions directory created');
}

console.log();
console.log('='.repeat(60));
console.log('Setting up Windows Network Share...');
console.log('='.repeat(60));
console.log();

try {
  // Check if share already exists
  console.log('Checking for existing share...');
  try {
    const checkCmd = `net share ${shareName}`;
    execSync(checkCmd, { stdio: 'pipe' });
    console.log(`Share "${shareName}" already exists. Removing it first...`);
    
    // Remove existing share
    const removeCmd = `net share ${shareName} /delete /y`;
    execSync(removeCmd, { stdio: 'pipe' });
    console.log('✓ Existing share removed');
  } catch (err) {
    console.log('No existing share found');
  }

  console.log();
  console.log('Creating new network share...');
  
  // Create the share with full permissions
  // Note: This requires administrator privileges
  const createShareCmd = `net share ${shareName}="${dataDir}" /grant:Everyone,FULL /remark:"${shareDescription}"`;
  
  try {
    execSync(createShareCmd, { stdio: 'pipe' });
    console.log('✓ Network share created successfully!');
  } catch (err) {
    console.error('✗ Failed to create share. You may need to run this as Administrator.');
    console.error('Error:', err.message);
    console.log();
    console.log('MANUAL SETUP INSTRUCTIONS:');
    console.log('1. Right-click on the folder:', dataDir);
    console.log('2. Select "Properties" > "Sharing" tab');
    console.log('3. Click "Advanced Sharing"');
    console.log('4. Check "Share this folder"');
    console.log('5. Set Share name:', shareName);
    console.log('6. Click "Permissions" and grant "Everyone" Full Control');
    console.log('7. Click OK');
    process.exit(1);
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Share Information:');
  console.log('='.repeat(60));
  console.log('Share Name:', shareName);
  console.log('Local Path:', dataDir);
  console.log('Network Path:', `\\\\${localIP}\\${shareName}`);
  console.log('UNC Path for Uploads:', `\\\\${localIP}\\${shareName}\\uploads`);
  console.log('UNC Path for Submissions:', `\\\\${localIP}\\${shareName}\\submissions`);
  console.log();

  // Update network config
  const configPath = path.join(projectRoot, 'config', 'network-config.json');
  let config = {};
  
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  config.deployment = config.deployment || {};
  config.deployment.mode = 'network';
  
  config.server = config.server || {};
  config.server.host = localIP;
  
  config.storage = config.storage || {};
  config.storage.useSharedStorage = true;
  config.storage.sharedStoragePath = `\\\\${localIP}\\${shareName}`;

  // Ensure config directory exists
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  console.log('✓ Network configuration updated');
  console.log('Config saved to:', configPath);
  console.log();

  console.log('='.repeat(60));
  console.log('SETUP COMPLETE!');
  console.log('='.repeat(60));
  console.log();
  console.log('Next Steps:');
  console.log('1. This machine is now the SERVER');
  console.log('2. Other machines can access files at:', `\\\\${localIP}\\${shareName}`);
  console.log('3. Make sure Windows Firewall allows File and Printer Sharing');
  console.log('4. Test access from another machine by opening:', `\\\\${localIP}\\${shareName}`);
  console.log();
  console.log('To configure client machines:');
  console.log('1. Run the app on client machine');
  console.log('2. Go to Network Settings');
  console.log('3. Set Server IP to:', localIP);
  console.log('4. Enable Network Mode');
  console.log();

} catch (error) {
  console.error('Error during setup:', error.message);
  console.log();
  console.log('If you see "Access Denied", please:');
  console.log('1. Run this script as Administrator');
  console.log('2. Right-click Command Prompt > "Run as Administrator"');
  console.log('3. Navigate to project folder and run: node setup-server-storage.js');
  process.exit(1);
}
