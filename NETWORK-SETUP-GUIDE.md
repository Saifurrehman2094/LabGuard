# LAB-Guard Network Setup Guide

## Quick Setup for Demo (3 Laptops on Same Network)

### Prerequisites
- All 3 laptops connected to same WiFi (e.g., "Kashmiri-5G")
- LAB-Guard installed on all laptops
- One laptop designated as "Server"

---

## Setup Steps

### 🖥️ On Server Laptop (Your Laptop)

#### Step 1: Run Network Setup
```bash
npm run setup-network
```
- Choose option **1** (Server Mode)
- Note your IP address (e.g., `192.168.1.105`)

#### Step 2: Share Database Folder
1. Navigate to: `backend/data` folder
2. Right-click → **Properties** → **Sharing** tab
3. Click **"Share"** button
4. Add **"Everyone"** with **Read/Write** permission
5. Set share name: **labguard-data**
6. Click **"Share"** and note the network path

**Network Path Example:**
```
\\192.168.1.105\labguard-data
```

#### Step 3: Start Application
```bash
npm start
```

#### Step 4: Share Info with Teammates
Give them:
- Your IP address: `192.168.1.105`
- Share name: `labguard-data`

---

### 💻 On Client Laptops (Teammates)

#### Step 1: Run Network Setup
```bash
npm run setup-network
```
- Choose option **2** (Client Mode)
- Enter server IP: `192.168.1.105` (from server laptop)
- Enter share name: `labguard-data`

#### Step 2: Start Application
```bash
npm start
```

**That's it!** All laptops now share the same database.

---

## Verification

### Check if Setup Works:

1. **On Server Laptop:**
   - Login as teacher
   - Create a test exam

2. **On Client Laptop:**
   - Login as student
   - You should see the exam created by teacher

3. **Test Real-time Sync:**
   - Student takes exam
   - Teacher should see violations in real-time

---

## Troubleshooting

### Problem: "Cannot access database"

**Solution:**
1. Check all laptops on same WiFi
2. Verify server laptop IP hasn't changed:
   ```bash
   ipconfig
   ```
3. Re-run `npm run setup-network` on client laptops with new IP

### Problem: "Access denied to shared folder"

**Solution:**
1. On server laptop, check folder sharing permissions
2. Make sure "Everyone" has Read/Write access
3. Try accessing from client: Open File Explorer → Type `\\192.168.1.105\labguard-data`

### Problem: "Database is locked"

**Solution:**
- SQLite doesn't handle many concurrent writes well
- Only one person should create/modify data at a time
- Students can read simultaneously (taking exams is fine)

---

## Network Switching (University WiFi)

When you move to university WiFi:

### On Server Laptop:
```bash
npm run setup-network
```
- Choose option **1** again
- Note NEW IP address (it will be different)
- Share with teammates

### On Client Laptops:
```bash
npm run setup-network
```
- Choose option **2** again
- Enter NEW server IP

**That's it!** Works on any network.

---

## Demo Day Checklist

### Before Demo (30 min):
- [ ] All laptops connected to same WiFi
- [ ] Server laptop: Run `npm run setup-network` (Server Mode)
- [ ] Share database folder
- [ ] Note server IP address
- [ ] Client laptops: Run `npm run setup-network` (Client Mode)
- [ ] Test: Create exam on server, view on client

### Demo Accounts:
- Admin: `admin` / `admin123`
- Teacher: `teacher1` / `teacher123`
- Student 1: `student1` / `student123`
- Student 2: `student2` / `student123`

### Demo Flow:
1. **Server (You):** Login as teacher → Create exam
2. **Client 1:** Login as student → See exam → Start monitoring
3. **Client 2:** Login as student → See same exam
4. **Client 1:** Switch to unauthorized app → Violation!
5. **Server (You):** Show violation in real-time with screenshot

---

## Manual Configuration (Advanced)

If setup script doesn't work, manually edit:

**File:** `config/network-config.json`

**Server Mode:**
```json
{
  "deployment": {
    "mode": "network"
  },
  "server": {
    "host": "AUTO"
  },
  "database": {
    "useSharedDatabase": false,
    "sharedPath": ""
  }
}
```

**Client Mode:**
```json
{
  "deployment": {
    "mode": "network"
  },
  "server": {
    "host": "192.168.1.105"
  },
  "database": {
    "useSharedDatabase": true,
    "sharedPath": "\\\\192.168.1.105\\labguard-data\\database.sqlite"
  }
}
```

---

## Tips

✅ **Server laptop should have good battery** (or be plugged in)  
✅ **Keep server laptop awake** during demo  
✅ **Test setup 1 day before** demo  
✅ **Have backup:** If network fails, run all 3 instances on one laptop  
✅ **Screenshot the setup** for documentation  

---

## Support

If something doesn't work:
1. Check `config/network-config.json` file
2. Verify IP addresses with `ipconfig`
3. Test network path in File Explorer
4. Restart all applications
5. Worst case: Switch to local mode on each laptop (no sharing)
