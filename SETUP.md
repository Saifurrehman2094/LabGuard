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
Open Command Prompt or PowerShell in the project folder.

**If PowerShell blocks scripts**, run first:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Then install:
```bash
# Install all dependencies (root + frontend + AI models)
npm install --legacy-peer-deps
```

This installs root deps, frontend deps (pdfjs-dist, jszip, react-pdf), and downloads face models.

**Note**: Use `--legacy-peer-deps` if you see peer dependency conflicts. The postinstall script will also install frontend dependencies and download models.

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

### Issue: "npm install" fails with peer dependency errors

**Solution**:
```bash
npm install --legacy-peer-deps
```

### Issue: "npm install" fails with better-sqlite3 / Python / C++ errors

**Solution**: Install **Visual Studio Build Tools 2022** (not VS 2026):
1. Download: https://aka.ms/vs/17/release/vs_BuildTools.exe
2. Run installer → Check **"Desktop development with C++"** only
3. Install (takes ~10-15 mins)
4. Use **Node.js v18 LTS** (not v24): https://nodejs.org/dist/v18.20.4/node-v18.20.4-x64.msi

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

### Issue: "Web-only mode" or Electron window doesn't open

**Solution**: Always run from **project root** (not frontend folder):
```bash
cd C:\Users\umari\LabGuard
npm run dev
```
Wait 30-60 seconds — the Electron window should open. If not, open http://localhost:3001 in a browser.

### Issue: Module not found (pdfjs-dist, jszip, react-pdf)

**Solution**:
```bash
cd frontend
npm install pdfjs-dist jszip react-pdf --legacy-peer-deps
cd ..
npm run dev
```

### Issue: PowerShell blocks npm

**Solution**:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
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

Create a `.env` file in the root directory (copy from `.env.example`):
```env
NODE_ENV=development
PORT=3001

# Programming Questions & Test Case Generation (optional)
# Get free key at: https://console.groq.com/
GROQ_API_KEY=gsk_your_key_here
```

- **GROQ_API_KEY**: Enables AI-powered question extraction from PDFs and automatic test case generation. Without it, teachers can still add questions and test cases manually.

### Building Installer

```bash
# Create Windows installer
npm run dist

# Output will be in: dist/LAB-Guard Setup.exe
```

---

## 🖥️ Using Cursor AI

1. **Open in Cursor**: File → Open Folder → select `C:\Users\umari\LabGuard`
2. **Terminal**: Press `Ctrl + \`` to open terminal
3. **Run**: `npm run dev` (from project root)
4. **AI**: Use `Ctrl + K` for inline edits, `Ctrl + L` for chat

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
