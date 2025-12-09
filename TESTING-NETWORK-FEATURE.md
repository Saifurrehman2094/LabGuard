# Network Feature Testing Guide

## ✅ Feature Implementation Complete

### What Was Added:

1. **Backend Services:**
   - `NetworkConfigService` - Manages network configuration
   - Auto IP detection
   - Database path management
   - Deployment mode switching

2. **IPC Handlers:**
   - `network:get-info` - Get network information
   - `network:get-mode` - Get deployment mode
   - `network:set-mode` - Set deployment mode (admin only)
   - `network:set-server` - Set server host (admin only)
   - `network:set-database-path` - Set shared database path (admin only)
   - `network:get-database-path` - Get current database path

3. **Frontend Components:**
   - `NetworkSettings` component with full UI
   - Integrated into Admin Panel as "Network" tab
   - Real-time network info display
   - Easy mode switching (Local/Network)
   - Server configuration interface

4. **Configuration:**
   - `config/network-config.json` - Stores network settings
   - Persistent across restarts
   - Auto-detection of IP addresses

5. **Setup Utility:**
   - `setup-network.js` - Interactive CLI setup
   - `npm run setup-network` command
   - Guided configuration for server/client modes

---

## 🧪 Testing Checklist

### Test 1: Single PC - Local Mode (Baseline)

**Purpose:** Ensure existing functionality still works

**Steps:**
```bash
1. npm start
2. Login as admin
3. Create a user
4. Create an exam
5. Verify everything works as before
```

**Expected Result:** ✅ All existing features work normally

---

### Test 2: Network Settings UI

**Purpose:** Test the new Network Settings interface

**Steps:**
```bash
1. npm start
2. Login as: admin / admin123
3. Click "Network" tab in Admin Panel
4. Verify you see:
   - Your IP address
   - Deployment mode (Local)
   - Network interfaces list
   - Mode selector buttons
   - Configuration forms
```

**Expected Result:** ✅ Network Settings UI displays correctly

---

### Test 3: Switch to Network Mode (UI)

**Purpose:** Test mode switching via UI

**Steps:**
```bash
1. In Network Settings tab
2. Click "Network Mode" button
3. Verify mode changes to "Network"
4. Check that server configuration section appears
5. Verify your IP is shown in instructions
```

**Expected Result:** ✅ Mode switches successfully, UI updates

---

### Test 4: CLI Setup Utility

**Purpose:** Test the setup-network script

**Steps:**
```bash
1. npm run setup-network
2. Choose option 1 (Server Mode)
3. Follow prompts
4. Verify configuration saved
5. Check config/network-config.json file
```

**Expected Result:** ✅ Configuration saved correctly

---

### Test 5: Multiple Windows on Same PC

**Purpose:** Test database sharing on single machine

**Steps:**
```bash
# Terminal 1
npm start
# Login as teacher, create exam

# Terminal 2  
npm start
# Login as student, verify exam appears

# Terminal 3
npm start
# Login as another student
```

**Expected Result:** ✅ All windows see same data in real-time

---

### Test 6: Network Deployment (2 PCs)

**Purpose:** Test actual network sharing

**Prerequisites:**
- 2 PCs on same WiFi (e.g., "Kashmiri-5G")
- App installed on both

**PC 1 (Server):**
```bash
1. npm run setup-network
2. Choose option 1 (Server Mode)
3. Note your IP (e.g., 192.168.43.123)
4. Share backend/data folder:
   - Right-click → Properties → Sharing
   - Share as "labguard-data"
   - Give Everyone Read/Write
5. npm start
6. Login as teacher
7. Create an exam
```

**PC 2 (Client):**
```bash
1. npm run setup-network
2. Choose option 2 (Client Mode)
3. Enter server IP: 192.168.43.123
4. Enter share name: labguard-data
5. npm start
6. Login as student
7. Verify exam appears
8. Take exam, trigger violation
```

**PC 1 (Server) - Verify:**
```bash
9. Check violations tab
10. Verify student's violation appears
11. View screenshot
```

**Expected Result:** ✅ Real-time data sync between PCs

---

### Test 7: Network Path Configuration

**Purpose:** Test manual database path setting

**Steps:**
```bash
1. In Network Settings (Admin Panel)
2. Enter database path: \\192.168.43.123\labguard-data\database.sqlite
3. Click "Set Path"
4. Verify success message
5. Restart application
6. Verify using shared database
```

**Expected Result:** ✅ Database path updated, restart required message shown

---

### Test 8: Auto IP Detection

**Purpose:** Test automatic IP address detection

**Steps:**
```bash
1. Connect to WiFi
2. npm run setup-network
3. Verify correct IP shown
4. Switch to different WiFi
5. Run setup again
6. Verify new IP detected
```

**Expected Result:** ✅ IP auto-detects correctly

---

### Test 9: Permission Check

**Purpose:** Ensure only admins can change network settings

**Steps:**
```bash
1. Login as student or teacher
2. Try to access Network tab
3. Verify access denied or settings read-only
```

**Expected Result:** ✅ Only admins can modify network settings

---

### Test 10: Configuration Persistence

**Purpose:** Test that settings persist across restarts

**Steps:**
```bash
1. Set deployment mode to Network
2. Set server IP
3. Close application
4. Restart application
5. Check Network Settings tab
6. Verify settings preserved
```

**Expected Result:** ✅ Settings persist in config/network-config.json

---

## 🐛 Known Limitations

1. **SQLite Concurrent Writes:**
   - SQLite doesn't handle many simultaneous writes well
   - Recommendation: Only one person creates/modifies data at a time
   - Students can read simultaneously (taking exams is fine)

2. **Screenshot Sharing:**
   - Screenshots currently saved locally on student PCs
   - Violation metadata saved to shared database
   - For full centralization, also share screenshots folder

3. **Network Dependency:**
   - All PCs must stay on same network
   - If server PC goes offline, clients can't access data
   - IP address changes require reconfiguration

---

## 📝 Test Results Template

```
Test Date: ___________
Tester: ___________

| Test # | Test Name | Status | Notes |
|--------|-----------|--------|-------|
| 1 | Local Mode Baseline | ⬜ Pass ⬜ Fail | |
| 2 | Network Settings UI | ⬜ Pass ⬜ Fail | |
| 3 | Mode Switching | ⬜ Pass ⬜ Fail | |
| 4 | CLI Setup | ⬜ Pass ⬜ Fail | |
| 5 | Multiple Windows | ⬜ Pass ⬜ Fail | |
| 6 | Network Deployment | ⬜ Pass ⬜ Fail | |
| 7 | Path Configuration | ⬜ Pass ⬜ Fail | |
| 8 | Auto IP Detection | ⬜ Pass ⬜ Fail | |
| 9 | Permission Check | ⬜ Pass ⬜ Fail | |
| 10 | Config Persistence | ⬜ Pass ⬜ Fail | |
```

---

## 🚀 Quick Demo Script

**For FYP Presentation (10 minutes):**

**Minute 0-2: Setup**
- Show 3 laptops connected to same WiFi
- PC 1: Run `npm run setup-network` → Server Mode
- PC 2 & 3: Run `npm run setup-network` → Client Mode

**Minute 2-4: Admin Configuration**
- PC 1: Login as admin
- Show Network Settings tab
- Explain deployment modes
- Show network information

**Minute 4-6: Teacher Creates Exam**
- PC 1: Switch to teacher account
- Create exam with PDF
- Set allowed apps

**Minute 6-8: Students Take Exam**
- PC 2: Login as student1
- Show exam appears instantly
- Start exam, trigger violation
- PC 3: Login as student2
- Show same exam

**Minute 8-10: Real-time Monitoring**
- PC 1: Show violations appearing in real-time
- View screenshots
- Export report
- Explain data synchronization

---

## ✅ Feature Completion Checklist

- [x] Network configuration service
- [x] IPC handlers for network operations
- [x] Network Settings UI component
- [x] Integration with Admin Panel
- [x] CLI setup utility
- [x] Auto IP detection
- [x] Configuration persistence
- [x] TypeScript definitions
- [x] Documentation (this file)
- [x] Setup guide (NETWORK-SETUP-GUIDE.md)
- [x] Backward compatibility (local mode still works)
- [x] Admin-only access control
- [x] Audit logging for network changes

---

## 🎉 Ready for Testing!

The network deployment feature is fully implemented and ready for testing. Start with Test 1 to ensure nothing broke, then proceed through the tests in order.

**Need help?** Check NETWORK-SETUP-GUIDE.md for detailed setup instructions.
