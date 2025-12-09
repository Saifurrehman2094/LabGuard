/**
 * Test Network Storage Access
 * 
 * This script tests if the network share is accessible
 * and can read/write files.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('='.repeat(60));
console.log('LabGuard Network Storage Test');
console.log('='.repeat(60));
console.log();

// Get local IP
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
console.log('Local IP:', localIP);
console.log();

// Load network config
const configPath = path.join(__dirname, 'config', 'network-config.json');
let config = {};

if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('Network Configuration:');
  console.log('  Mode:', config.deployment?.mode || 'local');
  console.log('  Server Host:', config.server?.host || 'AUTO');
  console.log('  Shared Storage:', config.storage?.sharedStoragePath || 'Not configured');
  console.log();
} else {
  console.log('⚠ Network config not found. Run setup-server-storage.js first.');
  process.exit(1);
}

// Test paths
const serverHost = config.server?.host || localIP;
const shareName = 'LabGuard';
const networkPath = `\\\\${serverHost}\\${shareName}`;
const localPath = path.join(__dirname, 'backend', 'data');

console.log('='.repeat(60));
console.log('Testing Storage Access...');
console.log('='.repeat(60));
console.log();

// Test 1: Local path access
console.log('Test 1: Local Path Access');
console.log('Path:', localPath);
try {
  if (fs.existsSync(localPath)) {
    console.log('✓ Local path accessible');
    
    // List contents
    const contents = fs.readdirSync(localPath);
    console.log('  Contents:', contents.join(', ') || '(empty)');
  } else {
    console.log('✗ Local path not found');
  }
} catch (error) {
  console.log('✗ Error accessing local path:', error.message);
}
console.log();

// Test 2: Network path access
console.log('Test 2: Network Path Access');
console.log('Path:', networkPath);
try {
  if (fs.existsSync(networkPath)) {
    console.log('✓ Network path accessible');
    
    // List contents
    const contents = fs.readdirSync(networkPath);
    console.log('  Contents:', contents.join(', ') || '(empty)');
  } else {
    console.log('✗ Network path not accessible');
    console.log('  Make sure the share is created. Run: node setup-server-storage.js');
  }
} catch (error) {
  console.log('✗ Error accessing network path:', error.message);
  console.log('  Possible causes:');
  console.log('  - Share not created (run setup-server-storage.js as Administrator)');
  console.log('  - Firewall blocking access');
  console.log('  - Network discovery disabled');
}
console.log();

// Test 3: Write test
console.log('Test 3: Write Test');
const testFileName = `test-${Date.now()}.txt`;
const testContent = 'LabGuard network storage test file';

try {
  // Try writing to network path
  const testFilePath = path.join(networkPath, testFileName);
  fs.writeFileSync(testFilePath, testContent, 'utf8');
  console.log('✓ Write successful');
  
  // Try reading back
  const readContent = fs.readFileSync(testFilePath, 'utf8');
  if (readContent === testContent) {
    console.log('✓ Read successful');
  } else {
    console.log('✗ Read content mismatch');
  }
  
  // Clean up
  fs.unlinkSync(testFilePath);
  console.log('✓ Delete successful');
  console.log();
  console.log('✓ All tests passed! Network storage is working correctly.');
  
} catch (error) {
  console.log('✗ Write test failed:', error.message);
  console.log();
  console.log('Troubleshooting:');
  console.log('1. Run setup-server-storage.js as Administrator');
  console.log('2. Check Windows Firewall settings');
  console.log('3. Enable "File and Printer Sharing" in Network settings');
  console.log('4. Make sure "Network Discovery" is turned on');
}

console.log();
console.log('='.repeat(60));
console.log('Test Complete');
console.log('='.repeat(60));
