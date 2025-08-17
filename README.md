# 🔍 AI-Powered Cheating Detection System

## App Detection Module

A comprehensive, cross-platform application detection and monitoring system built with Electron and Node.js. This module serves as the foundational skeleton for detecting running applications, active windows, and system processes in real-time.

## 🎯 **What We're Achieving**

The **App Detection Module** is the core foundation of your AI-Powered Cheating Detection System. It provides:

- **Real-time Process Monitoring**: Detect all currently running applications with their PIDs, names, and resource usage
- **Active Window Detection**: Identify which application window is currently focused
- **Cross-platform Support**: Works on Windows, macOS, and Linux
- **Event-driven Architecture**: Real-time updates and notifications
- **Modular Design**: Extensible foundation for future cheating detection features

## 🚀 **How We're Achieving It**

### **Technology Stack:**
- **Electron**: Cross-platform desktop application framework
- **Node.js**: Backend runtime environment
- **ps-list**: Cross-platform process listing library
- **active-win**: Cross-platform active window detection
- **Event-driven Architecture**: Real-time monitoring and updates

### **Architecture Overview:**
```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Application                     │
├─────────────────────────────────────────────────────────────┤
│  Main Process (main.js)    │  Renderer Process (renderer.js) │
│  ├─ App Detection Module   │  ├─ Modern UI Interface        │
│  ├─ IPC Communication      │  ├─ Real-time Updates          │
│  └─ System Integration     │  └─ User Controls              │
└─────────────────────────────────────────────────────────────┘
```

## ✨ **Features**

### **Core Capabilities:**
- 🔍 **Process Detection**: Monitor all running applications
- 🪟 **Window Monitoring**: Track active/focused windows
- ⚡ **Real-time Updates**: Live monitoring with configurable intervals
- 📊 **Data Logging**: Historical data collection and analysis
- 🎛️ **Configurable Monitoring**: Adjustable polling intervals and limits
- 📱 **Cross-platform**: Windows, macOS, and Linux support

### **Advanced Features:**
- 🚨 **Event Notifications**: Real-time alerts for process changes
- 📈 **Statistics Tracking**: Comprehensive monitoring metrics
- 🔄 **Change Detection**: Identify new and terminated processes
- 💾 **Data Persistence**: Historical data storage and retrieval
- 🎨 **Modern UI**: Beautiful, responsive user interface

## 🛠️ **Installation**

### **Prerequisites:**
- Node.js (v14 or higher)
- npm or yarn package manager

### **Setup Steps:**

1. **Clone or download the project:**
   ```bash
   # If you have the project files, navigate to the directory
   cd FYP
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Install additional required packages:**
   ```bash
   npm install ps-list active-win electron-store
   ```

4. **Start the application:**
   ```bash
   npm start
   ```

## 🎮 **Usage**

### **Basic Usage:**

1. **Launch the Application:**
   - Run `npm start` to launch the Electron app
   - The application will open with a modern, intuitive interface

2. **Start Monitoring:**
   - Click the "Start Monitoring" button
   - The system will begin detecting running processes and active windows
   - Real-time updates will appear in the interface

3. **Monitor Activity:**
   - View running processes in the process list
   - See the currently active window
   - Monitor system statistics and activity logs

4. **Stop Monitoring:**
   - Click "Stop Monitoring" to halt the detection system
   - All monitoring will cease and data collection will stop

### **Advanced Usage:**

#### **Programmatic Integration:**
```javascript
const AppDetectionModule = require('./src/modules/AppDetectionModule');

// Create an instance with custom configuration
const appDetection = new AppDetectionModule({
    pollingInterval: 2000,        // Check every 2 seconds
    maxProcesses: 1000,           // Monitor up to 1000 processes
    enableProcessMonitoring: true,
    enableWindowMonitoring: true,
    enableDataLogging: true
});

// Set up event listeners
appDetection.on('processListUpdated', (data) => {
    console.log(`Found ${data.totalProcesses} running processes`);
});

appDetection.on('activeWindowChanged', (data) => {
    console.log(`Active window changed to: ${data.currentWindow.app}`);
});

// Start monitoring
await appDetection.startMonitoring();
```

#### **Event Types:**
- `monitoringStarted`: Monitoring system started
- `monitoringStopped`: Monitoring system stopped
- `processListUpdated`: Process list has been updated
- `newProcessesDetected`: New processes detected
- `processesTerminated`: Processes have been terminated
- `activeWindowChanged`: Active window has changed
- `activeWindowUpdated`: Active window information updated
- `monitoringCycleComplete`: Monitoring cycle completed
- `error`: Error occurred during monitoring

## 📁 **Project Structure**

```
FYP/
├── src/
│   ├── modules/
│   │   └── AppDetectionModule.js    # Core detection module
│   ├── demo/
│   │   └── AppDetectionDemo.js      # Demo application
│   └── examples/
│       └── simple-usage.js          # Simple usage example
├── main.js                          # Main Electron process
├── index.html                       # Application interface
├── renderer.js                      # Frontend logic
├── package.json                     # Project dependencies
└── README.md                        # This file
```

## 🔧 **Configuration Options**

The App Detection Module supports various configuration options:

```javascript
const config = {
    pollingInterval: 2000,           // Monitoring interval in milliseconds
    maxProcesses: 1000,              // Maximum processes to monitor
    enableProcessMonitoring: true,   // Enable process detection
    enableWindowMonitoring: true,    // Enable window detection
    enableDataLogging: true          // Enable historical data logging
};
```

## 🌟 **Demo Applications**

### **1. Full Demo (AppDetectionDemo.js):**
```bash
node src/demo/AppDetectionDemo.js
```
- Runs a comprehensive 30-second demonstration
- Shows all monitoring capabilities
- Provides detailed statistics and logging

### **2. Simple Usage Example:**
```bash
node src/examples/simple-usage.js
```
- Basic 20-second monitoring demonstration
- Simple event handling
- Minimal configuration

## 🚨 **Problems & Limitations**

### **Known Issues:**
1. **Permission Requirements**: Some systems may require elevated permissions for process monitoring
2. **Performance Impact**: High polling frequencies may impact system performance
3. **Platform Differences**: Some features may behave differently across operating systems

### **Solutions & Workarounds:**
1. **Permission Issues**: Run the application with appropriate privileges
2. **Performance**: Adjust polling intervals based on system capabilities
3. **Cross-platform**: The module automatically adapts to different platforms

## 🔮 **Future Extensions**

This App Detection Module is designed to be the foundation for:

- **Anomaly Detection**: AI-powered cheating pattern recognition
- **Behavioral Analysis**: User activity pattern monitoring
- **Screenshot Capture**: Visual monitoring capabilities
- **Network Monitoring**: Internet activity tracking
- **File System Monitoring**: Document and file access tracking
- **Reporting System**: Comprehensive activity reports
- **Alert System**: Real-time cheating detection alerts

## 🧪 **Testing**

### **Manual Testing:**
1. Launch the application
2. Start monitoring
3. Switch between different applications
4. Open and close various programs
5. Verify real-time updates in the interface

### **Automated Testing:**
```bash
# Run the demo applications to verify functionality
node src/demo/AppDetectionDemo.js
node src/examples/simple-usage.js
```

## 📊 **Performance Considerations**

- **Polling Intervals**: Lower intervals provide more real-time data but increase CPU usage
- **Process Limits**: Higher limits provide more comprehensive monitoring but increase memory usage
- **Data Logging**: Enabling logging provides historical data but increases memory consumption

## 🔒 **Security & Privacy**

- **Local Monitoring Only**: All monitoring is performed locally on the user's machine
- **No Data Transmission**: No monitoring data is sent to external servers
- **User Control**: Users have full control over when monitoring starts and stops
- **Transparent Operation**: All monitoring activities are visible in the activity log

## 🤝 **Contributing**

This module is designed to be easily extensible. To add new features:

1. **Extend the AppDetectionModule class** with new monitoring capabilities
2. **Add new event types** for additional monitoring activities
3. **Integrate with the existing event system** for seamless operation
4. **Update the UI components** to display new data types

## 📝 **License**

This project is part of an academic Final Year Project (FYP) and is intended for educational and research purposes.

## 🎓 **Academic Context**

This App Detection Module is the foundational component of your **AI-Powered Cheating Detection & Monitoring System for Lab Exams**. It provides the essential system monitoring capabilities needed to:

- Detect unauthorized applications during exams
- Monitor student activity patterns
- Provide real-time alerts for suspicious behavior
- Collect data for AI-powered analysis

## 🚀 **Getting Started Quickly**

1. **Install dependencies**: `npm install`
2. **Launch application**: `npm start`
3. **Click "Start Monitoring"** to begin detection
4. **Observe real-time updates** in the interface
5. **Explore the demo applications** for advanced usage examples

---

## 💡 **Next Steps**

With this App Detection Module as your foundation, you can now:

1. **Integrate AI/ML components** for pattern recognition
2. **Add camera monitoring** capabilities
3. **Implement network monitoring** features
4. **Create comprehensive reporting** systems
5. **Build advanced alert mechanisms** for cheating detection

The module is designed to be easily extensible, so you can add new monitoring capabilities as your project evolves!

---

**🎯 Ready to build the future of academic integrity monitoring! 🚀**
