# LAB-Guard System Requirements & Compatibility Matrix

## ✅ Current System Status

### Your System (As of Dec 8, 2025)
- **Node.js**: v22.13.0 ✅
- **npm**: 11.0.0 ✅
- **Python**: 3.15.0a2 ✅
- **Visual Studio**: 2026 Community + Build Tools 2026 ✅
- **Windows SDK**: 10.0.26100.0 ✅
- **Operating System**: Windows 11 (Build 26100) ✅

---

## 📋 Required Software Versions

### Core Runtime (REQUIRED)
| Software | Required Version | Your Version | Status |
|----------|-----------------|--------------|--------|
| Node.js | 18.x - 22.x | v22.13.0 | ✅ GOOD |
| npm | 9.x - 11.x | 11.0.0 | ✅ GOOD |
| Python | 3.8 - 3.15 | 3.15.0a2 | ✅ GOOD |

### Build Tools (REQUIRED for native modules)
| Software | Required | Your Version | Status |
|----------|----------|--------------|--------|
| Visual Studio Build Tools | 2019+ | 2026 | ✅ GOOD |
| MSVC C++ Build Tools | v143+ | v143 | ✅ GOOD |
| Windows 10/11 SDK | 10.0.x | 10.0.26100.0 | ✅ GOOD |
| Desktop development with C++ | Yes | Yes | ✅ GOOD |

---

## 📦 Project Dependencies

### Main Application (Root package.json)

#### Electron & Desktop
- **electron**: ^25.9.8 (Downgraded from 39.2.6 for VS compatibility)
- **electron-builder**: ^26.0.12
- **electron-is-dev**: ^3.0.1
- **@electron/rebuild**: ^3.2.13

#### Native Modules (Need Compilation)
- **better-sqlite3**: ^9.6.0 ⚠️ MISSING - Needs installation
- **bcrypt**: ^5.1.1 ⚠️ MISSING - Needs installation
- **canvas**: ^3.2.0 ✅ Installed
- **koffi**: ^2.14.1 ✅ Installed (Windows API access)

#### React & Frontend
- **react**: ^19.1.1
- **react-dom**: ^19.1.1
- **react-scripts**: ^5.0.1
- **typescript**: ^5.9.3

#### Face Recognition & AI
- **@vladmandic/face-api**: ^1.7.15

#### Security & Auth
- **jsonwebtoken**: ^9.0.2

#### Utilities
- **uuid**: ^13.0.0
- **concurrently**: ^8.2.2
- **wait-on**: ^7.2.0

### Frontend (frontend/package.json)
- **pdfjs-dist**: ^3.11.174 (PDF viewing)
- **react-pdf**: ^7.7.0
- **jszip**: ^3.10.1 (File compression)
- **tesseract.js**: ^6.0.1 (OCR)

### Server (server/package.json) - Optional for network mode
- **express**: ^4.18.2
- **pg**: ^8.11.3 (PostgreSQL)
- **cors**: ^2.8.5
- **bcrypt**: ^5.1.1
- **jsonwebtoken**: ^9.0.2
- **dotenv**: ^16.3.1

---

## 🔧 Known Compatibility Issues

### Issue 1: Visual Studio 2026 Not Recognized ⚠️
**Problem**: node-gyp doesn't recognize VS 2026 (too new)
**Impact**: Cannot compile native modules (better-sqlite3, bcrypt)
**Status**: BLOCKING

**Solutions**:
1. ✅ **Downgraded Electron** from 39.2.6 to 25.9.8 (compatible with older VS)
2. ⚠️ **Need to install native modules** using Developer Command Prompt

### Issue 2: Missing Native Modules ⚠️
**Problem**: better-sqlite3 and bcrypt not installed
**Impact**: Database won't work, app won't start
**Status**: BLOCKING

**Solution**: Install using VS Developer Command Prompt

---

## 🚀 Installation Steps (CORRECT ORDER)

### Step 1: Verify System Requirements ✅ DONE
```powershell
node --version    # Should be v22.13.0
npm --version     # Should be 11.0.0
python --version  # Should be 3.15.0a2
```

### Step 2: Install Dependencies (CURRENT STEP)

#### Option A: Using Developer Command Prompt (RECOMMENDED)
1. Open **Visual Studio Installer**
2. Click **Launch** next to "Visual Studio Build Tools 2026"
3. This opens **Developer Command Prompt**
4. Navigate to project:
   ```cmd
   cd D:\LabGuard
   ```
5. Install native modules:
   ```cmd
   npm install better-sqlite3@9.6.0 bcrypt@5.1.1 --legacy-peer-deps
   ```
6. Rebuild for Electron:
   ```cmd
   npx electron-rebuild
   ```

#### Option B: Set Environment Variable (ALTERNATIVE)
```powershell
$env:VCINSTALLDIR="C:\Program Files\Microsoft Visual Studio\2026\Community\VC\"
npm install better-sqlite3@9.6.0 bcrypt@5.1.1 --legacy-peer-deps
npx electron-rebuild
```

### Step 3: Verify Installation
```powershell
npm list better-sqlite3
npm list bcrypt
```

### Step 4: Start Application
```powershell
npm start
```

---

## 📊 Electron Version Compatibility

| Electron Version | Node.js ABI | VS Required | Status |
|-----------------|-------------|-------------|--------|
| 39.2.6 (original) | 140 | VS 2019+ | ❌ Too new for VS detection |
| 25.9.8 (current) | 115 | VS 2017+ | ✅ Compatible with VS 2026 |

**Why we downgraded**: Electron 39 requires NODE_MODULE_VERSION 140, but your compiled modules were version 127. Electron 25 is more stable and compatible with your VS setup.

---

## 🎯 What's Working vs What's Not

### ✅ Working
- Node.js installation
- npm package manager
- Python for node-gyp
- Visual Studio Build Tools with C++ workload
- Windows SDK
- Project structure
- Most npm packages installed
- Face recognition models downloaded
- Database file exists

### ⚠️ Not Working (Blocking)
- **better-sqlite3** - Not installed/compiled
- **bcrypt** - Not installed/compiled
- **Application startup** - Fails due to missing modules

### 🔄 Next Steps
1. Install native modules using Developer Command Prompt
2. Rebuild modules for Electron 25
3. Test application startup
4. Proceed with network feature testing

---

## 💡 Why Native Modules Need Special Handling

Native modules (better-sqlite3, bcrypt, canvas, koffi) contain C++ code that must be compiled for:
1. **Your Node.js version** (v22.13.0)
2. **Your Electron version** (25.9.8)
3. **Your operating system** (Windows)
4. **Your architecture** (x64)

This requires:
- C++ compiler (MSVC from Visual Studio)
- Windows SDK
- Python (for node-gyp build scripts)
- Proper environment variables

---

## 📝 Notes

- **Electron 25.9.8** uses Node.js 18.15.0 internally
- Native modules must be rebuilt specifically for Electron's Node.js version
- `--legacy-peer-deps` flag needed due to React 19 + TypeScript 5.9 peer dependency conflicts
- Database path: `D:\LabGuard\backend\data\database.sqlite`
- Network config: `D:\LabGuard\config\network-config.json`

---

## 🆘 Troubleshooting

### If npm install still fails:
1. Close ALL terminals
2. Restart Visual Studio Installer
3. Use "Launch" button for Developer Command Prompt
4. Try installation again

### If electron-rebuild fails:
```powershell
# Clean rebuild
npm uninstall better-sqlite3 bcrypt
rm -r node_modules/@electron
npm install --legacy-peer-deps
npm install better-sqlite3@9.6.0 bcrypt@5.1.1 --legacy-peer-deps
npx electron-rebuild
```

### If app still won't start:
```powershell
# Check what's installed
npm list better-sqlite3
npm list bcrypt
npm list electron

# Verify database exists
dir backend\data\database.sqlite
```
