# LAB-Guard Setup Guide

Complete setup instructions for running LAB-Guard on any machine.

## 📋 System Requirements

### Operating System
- **Windows 10** or **Windows 11** (64-bit)
- Administrator privileges required

### Hardware
- **RAM**: Minimum 4GB (8GB recommended)
- **Storage**: 500MB free space
- **Webcam**: Required for face authentication
- **Internet**: Required for initial setup only

---

## 🔧 Step 1: Install Node.js

LAB-Guard requires **Node.js v16 or higher**.

### Option A: Download from Official Website
1. Go to https://nodejs.org/
2. Download **LTS version** (v18.x or v20.x recommended)
3. Run the installer
4. Check "Automatically install necessary tools" during installation
5. Restart your computer after installation

### Option B: Using NVM (Node Version Manager)
```bash
# Install NVM for Windows from: https://github.com/coreybutler/nvm-windows/releases
# Then install Node.js:
nvm install 18.17.0
nvm use 18.17.0
```

### Verify Installation
Open Command Prompt or PowerShell and run:
```bash
node --version
# Should show: v18.x.x or higher

npm --version
# Should show: 9.x.x or higher
```

---

## 📦 Step 2: Install Python (Required for native modules)

Some dependencies require Python for compilation.

1. Download Python 3.9+ from https://www.python.org/downloads/
2. **IMPORTANT**: Check "Add Python to PATH" during installation
3. Verify installation:
```bash
python --version
# Should show: Python 3.9.x or higher
```

---

## 🚀 Step 3: Setup LAB-Guard

### 1. Extract/Clone the Project
```bash
# If you received a ZIP file, extract it
# If using Git:
git clone <repository-url>
cd LAB-Guard
```

### 2. Install Dependencies
Open Command Prompt or PowerShell in the project folder:

```bash
# Install all dependencies (this may take 5-10 minutes)
npm install
```

**Note**: If you see warnings about optional dependencies, you can ignore them.

### 3. Download Face Recognition Models
```bash
# Download AI models (required for face authentication)
npm run download-models
```

This will download models to `frontend/public/models/` (~30MB).

---

## 🎯 Step 4: Run the Application

### Development Mode (Recommended for testing)
```bash
npm run dev
```

This will:
1. Start React development server on http://localhost:3001
2. Launch Electron desktop application
3. Enable hot-reload for code changes

### Production Mode
```bash
# Build the React app first
npm run build

# Then start the application
npm start
```

---

## 🔐 Step 5: Initial Login

### Default Admin Account
- **Username**: `admin`
- **Password**: `admin123`

### First Time Setup
1. Login with admin credentials
2. Go to Admin Dashboard → Users
3. Create teacher and student accounts
4. Register faces for users who need face authentication

---

## 🛠️ Troubleshooting

### Issue: "npm install" fails with Python errors

**Solution**:
```bash
# Install Windows Build Tools
npm install --global windows-build-tools

# Or install Visual Studio Build Tools manually:
# https://visualstudio.microsoft.com/downloads/
# Select "Desktop development with C++"
```

### Issue: "bcrypt" or "better-sqlite3" errors

**Solution**:
```bash
# Rebuild native modules
npm rebuild bcrypt better-sqlite3 canvas
```

### Issue: Face recognition models not loading

**Solution**:
```bash
# Manually download models
npm run download-models

# Or download from:
# https://github.com/vladmandic/face-api/tree/master/model
# Place in: frontend/public/models/
```

### Issue: Electron window doesn't open

**Solution**:
```bash
# Clear cache and reinstall
rm -rf node_modules
rm -rf frontend/node_modules
npm install
```

### Issue: Port 3001 already in use

**Solution**:
```bash
# Kill the process using port 3001
netstat -ano | findstr :3001
taskkill /PID <PID_NUMBER> /F

# Or change the port in package.json:
# "dev:react": "cd frontend && set PORT=3002 && react-scripts start"
```

### Issue: Camera not detected

**Solution**:
1. Check Windows Privacy Settings → Camera
2. Allow desktop apps to access camera
3. Restart the application

---

## 📁 Project Structure

```
LAB-Guard/
├── backend/              # Electron backend
│   ├── app/             # Main process
│   ├── services/        # Backend services
│   └── data/            # SQLite database
├── frontend/            # React frontend
│   ├── src/            # React components
│   └── public/         # Static files & AI models
├── config/             # Configuration files
├── package.json        # Dependencies
└── README.md           # Documentation
```

---

## 🔄 Updating the Application

```bash
# Pull latest changes (if using Git)
git pull

# Reinstall dependencies
npm install

# Rebuild the app
npm run build
```

---

## 📊 Database Location

The SQLite database is stored at:
```
backend/data/database.sqlite
```

**Backup**: Copy this file to backup all user data, exams, and logs.

---

## 🎓 For Developers

### Available Scripts

```bash
npm run dev              # Development mode with hot-reload
npm run build            # Build React app for production
npm start                # Run production build
npm run download-models  # Download face recognition models
npm run cleanup-db       # Clean test data from database
npm run clear-audit-logs # Clear audit logs
npm run dist             # Create installer package
```

### Environment Variables

Create a `.env` file in the root directory (optional):
```env
NODE_ENV=development
PORT=3001
```

### Building Installer

```bash
# Create Windows installer
npm run dist

# Output will be in: dist/LAB-Guard Setup.exe
```

---

## 🆘 Getting Help

### Check Logs
- Electron logs: Check console in DevTools (Ctrl+Shift+I)
- Backend logs: Check terminal/command prompt output
- Database: Use SQLite browser to inspect `backend/data/database.sqlite`

### Common Commands
```bash
# Check Node version
node --version

# Check npm version
npm --version

# List installed packages
npm list --depth=0

# Clear npm cache
npm cache clean --force
```

---

## ✅ Verification Checklist

Before running the application, ensure:

- [ ] Node.js v16+ installed
- [ ] Python 3.9+ installed
- [ ] All dependencies installed (`npm install` completed)
- [ ] Face recognition models downloaded
- [ ] Webcam connected and accessible
- [ ] Windows 10/11 operating system
- [ ] Administrator privileges available

---

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review logs in the terminal
3. Check `README.md` for additional documentation
4. Verify all system requirements are met

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**Platform**: Windows 10/11  
**Node.js**: v16+ required
