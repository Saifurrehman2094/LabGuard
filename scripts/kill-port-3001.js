#!/usr/bin/env node
/**
 * Kills any process using port 3001 (Windows).
 * Run before npm run dev to avoid "Something is already running on port 3001".
 */
const { execSync } = require('child_process');

const PORT = 3001;

try {
  const result = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = result.trim().split('\n').filter(Boolean);
  const pids = new Set();
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && pid !== '0') pids.add(pid);
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      console.log(`Freed port ${PORT} (killed PID ${pid})`);
    } catch (_) {}
  }
} catch (_) {
  // Port not in use - that's fine
}
