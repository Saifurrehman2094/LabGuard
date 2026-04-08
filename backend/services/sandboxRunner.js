const { spawn } = require('child_process');
const os = require('os');

class SandboxRunner {
  constructor(options = {}) {
    this.maxOutputBytes = Number(options.maxOutputBytes) || 256 * 1024;
    this.defaultTimeoutMs = Number(options.defaultTimeoutMs) || 3000;
    this.defaultMemoryMb = Number(options.defaultMemoryMb) || 256;
    this.defaultCpuSeconds = Number(options.defaultCpuSeconds) || 5;
  }

  async runCommand(params) {
    const {
      command,
      args = [],
      cwd,
      stdin = '',
      timeoutMs = this.defaultTimeoutMs,
      memoryMb = this.defaultMemoryMb,
      cpuSeconds = this.defaultCpuSeconds,
      env = {},
      windowsHide = true
    } = params || {};

    if (!command || !cwd) {
      throw new Error('SandboxRunner requires command and cwd');
    }

    const execution = os.platform() === 'win32'
      ? this._spawnWindows({ command, args, cwd, env, windowsHide })
      : this._spawnPosix({ command, args, cwd, env, memoryMb, cpuSeconds });

    const child = execution.child;
    const killTree = () => {
      if (!child || child.killed) return;
      try {
        if (os.platform() === 'win32') {
          const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
          killer.on('error', () => {});
        } else {
          process.kill(-child.pid, 'SIGKILL');
        }
      } catch (_) {
        try {
          child.kill('SIGKILL');
        } catch (_) {}
      }
    };

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let completed = false;

      const timeout = setTimeout(() => {
        if (completed) return;
        completed = true;
        killTree();
        const err = new Error('Execution timed out');
        err.code = 'TIMEOUT';
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
        if (Buffer.byteLength(stdout, 'utf8') > this.maxOutputBytes) {
          stdout = stdout.slice(-this.maxOutputBytes);
        }
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        if (Buffer.byteLength(stderr, 'utf8') > this.maxOutputBytes) {
          stderr = stderr.slice(-this.maxOutputBytes);
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        if (completed) return;
        completed = true;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      });

      child.on('close', (exitCode) => {
        clearTimeout(timeout);
        if (completed) return;
        completed = true;
        resolve({
          exitCode,
          stdout,
          stderr
        });
      });

      if (stdin) {
        child.stdin.write(stdin);
      }
      child.stdin.end();
    });
  }

  _spawnWindows(params) {
    const { command, args, cwd, env, windowsHide } = params;
    const child = spawn(command, args, {
      cwd,
      windowsHide,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
      env: {
        SystemRoot: process.env.SystemRoot,
        COMSPEC: process.env.COMSPEC,
        PATH: process.env.PATH,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        ...env
      }
    });
    return { child };
  }

  _spawnPosix(params) {
    const { command, args, cwd, env, memoryMb, cpuSeconds } = params;
    const escapedCommand = [command, ...args].map((part) => shellEscape(part)).join(' ');
    const memoryKb = Math.max(32768, Math.floor(memoryMb * 1024));
    const cpu = Math.max(1, Math.floor(cpuSeconds));
    const script = `ulimit -v ${memoryKb}; ulimit -t ${cpu}; exec ${escapedCommand}`;
    const child = spawn('bash', ['-lc', script], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: process.env.LANG || 'C.UTF-8',
        ...env
      }
    });
    return { child };
  }
}

function shellEscape(value) {
  const text = String(value == null ? '' : value);
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

module.exports = SandboxRunner;
