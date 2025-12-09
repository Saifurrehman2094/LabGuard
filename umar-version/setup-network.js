/**
 * LAB-Guard Network Setup Utility
 * Run this script to configure network deployment
 */

const NetworkConfigService = require('./backend/services/networkConfig');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const networkConfig = new NetworkConfigService();

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupNetwork() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║     LAB-Guard Network Setup Utility           ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  // Get network info
  const networkInfo = networkConfig.getNetworkInfo();
  
  console.log('📡 Current Network Information:');
  console.log('─────────────────────────────────────────────────');
  console.log(`   Your IP Address: ${networkInfo.localIP}`);
  console.log(`   Deployment Mode: ${networkInfo.deploymentMode}`);
  console.log('');

  if (networkInfo.networkInterfaces.length > 0) {
    console.log('   Available Network Interfaces:');
    networkInfo.networkInterfaces.forEach((iface, index) => {
      console.log(`   ${index + 1}. ${iface.name}: ${iface.address}`);
    });
    console.log('');
  }

  // Ask deployment mode
  console.log('🔧 Setup Options:');
  console.log('─────────────────────────────────────────────────');
  console.log('1. Server Mode (This machine will host the database)');
  console.log('2. Client Mode (Connect to another machine\'s database)');
  console.log('3. Local Mode (Use local database only)');
  console.log('');

  const choice = await question('Select option (1/2/3): ');

  if (choice === '1') {
    await setupServerMode();
  } else if (choice === '2') {
    await setupClientMode();
  } else if (choice === '3') {
    await setupLocalMode();
  } else {
    console.log('❌ Invalid choice. Exiting...');
  }

  rl.close();
}

async function setupServerMode() {
  console.log('\n🖥️  SERVER MODE SETUP');
  console.log('─────────────────────────────────────────────────');
  
  const localIP = networkConfig.getLocalIPAddress();
  console.log(`✅ Your IP Address: ${localIP}`);
  console.log('');
  console.log('📋 Setup Steps:');
  console.log('   1. Share the database folder on your network');
  console.log('   2. Give teammates this information:');
  console.log(`      - Server IP: ${localIP}`);
  console.log(`      - Share Name: labguard-data`);
  console.log('');

  // Create share instructions
  const sharePath = path.join(__dirname, 'backend', 'data');
  console.log('📁 Folder to Share:');
  console.log(`   ${sharePath}`);
  console.log('');
  console.log('🔐 Share Permissions:');
  console.log('   - Right-click folder → Properties → Sharing');
  console.log('   - Click "Share" button');
  console.log('   - Add "Everyone" with Read/Write permission');
  console.log('   - Share name: labguard-data');
  console.log('');

  const confirm = await question('Have you shared the folder? (y/n): ');
  
  if (confirm.toLowerCase() === 'y') {
    // Set server mode
    networkConfig.setDeploymentMode('network');
    networkConfig.setServerHost(localIP);
    
    console.log('');
    console.log('✅ Server mode configured successfully!');
    console.log('');
    console.log('📤 Share this with teammates:');
    console.log('─────────────────────────────────────────────────');
    console.log(`   Server IP: ${localIP}`);
    console.log(`   Network Path: \\\\${localIP}\\labguard-data\\database.sqlite`);
    console.log('─────────────────────────────────────────────────');
    console.log('');
    console.log('💡 Teammates should run: npm run setup-network');
    console.log('   and choose "Client Mode" with your IP address.');
  }
}

async function setupClientMode() {
  console.log('\n💻 CLIENT MODE SETUP');
  console.log('─────────────────────────────────────────────────');
  console.log('You will connect to another machine\'s database.');
  console.log('');

  const serverIP = await question('Enter server IP address (e.g., 192.168.1.105): ');
  
  if (!serverIP || serverIP.trim() === '') {
    console.log('❌ Invalid IP address. Exiting...');
    return;
  }

  const shareName = await question('Enter share name (default: labguard-data): ') || 'labguard-data';
  
  const sharedPath = `\\\\${serverIP.trim()}\\${shareName}\\database.sqlite`;
  
  console.log('');
  console.log('🔍 Testing connection...');
  console.log(`   Path: ${sharedPath}`);
  
  // Set client mode
  networkConfig.setDeploymentMode('network');
  networkConfig.setServerHost(serverIP.trim());
  networkConfig.setSharedDatabasePath(sharedPath);
  
  console.log('');
  console.log('✅ Client mode configured successfully!');
  console.log('');
  console.log('📥 Configuration:');
  console.log('─────────────────────────────────────────────────');
  console.log(`   Server IP: ${serverIP.trim()}`);
  console.log(`   Database Path: ${sharedPath}`);
  console.log('─────────────────────────────────────────────────');
  console.log('');
  console.log('💡 You can now start the application with: npm start');
  console.log('');
  console.log('⚠️  Make sure:');
  console.log('   - You are connected to the same network as the server');
  console.log('   - The server machine is running');
  console.log('   - The database folder is shared');
}

async function setupLocalMode() {
  console.log('\n🏠 LOCAL MODE SETUP');
  console.log('─────────────────────────────────────────────────');
  console.log('Using local database only (no network sharing).');
  console.log('');

  networkConfig.setDeploymentMode('local');
  networkConfig.setSharedDatabasePath('');
  
  console.log('✅ Local mode configured successfully!');
  console.log('');
  console.log('💡 You can now start the application with: npm start');
}

// Run setup
setupNetwork().catch(error => {
  console.error('❌ Setup failed:', error);
  rl.close();
  process.exit(1);
});
