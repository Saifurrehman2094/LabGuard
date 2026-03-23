const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const crypto = require('crypto');

class CodeEvalService {
  /**
   * @param {object} options
   * @param {import('./database')} options.dbService
   * @param {string} [options.rootDir]
   * @param {number} [options.defaultTimeoutMs]
   * @param {number} [options.maxOutputBytes]
   * @param {string} [options.compiler]
   */
  constructor(options) {
    this.db = options.dbService;
    this.rootDir =
      options.rootDir ||
      path.join(__dirname, '..', 'data', 'code-eval');
    this.defaultTimeoutMs = options.defaultTimeoutMs || 3000;
    this.maxOutputBytes = options.maxOutputBytes || 256 * 1024;
    this.compiler = options.compiler || 'g++';
  }

  /**
   * Run evaluation for a submission/question.
   * Creates code_evaluations and test_case_results rows.
   *
   * @param {object} params
   * @param {string} params.examId
   * @param {string} params.submissionId
   * @param {string} params.questionId
   * @param {boolean} [params.reRun]
   */
  async runEvaluation(params) {
    const { examId, submissionId, questionId } = params;

    const baseDir = path.join(
      this.rootDir,
      safeSegment(examId),
      safeSegment(submissionId),
      safeSegment(questionId),
      crypto.randomBytes(4).toString('hex')
    );
    fs.mkdirSync(baseDir, { recursive: true });

    const submission = this.db.getExamSubmissionById
      ? this.db.getExamSubmissionById(submissionId)
      : this._getExamSubmissionFallback(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    const filesData = safeParseJson(submission.files_data) || [];

    // Students submit via frontend: sometimes we only get { name, size, type }
    // and we (later) need { content } for compilation. Support both shapes.
    const cppFile = filesData.find((f) => {
      const name = (f && typeof f.name === 'string') ? f.name : null;
      const p = (f && typeof f.path === 'string') ? f.path : null;
      const fileName = (f && typeof f.fileName === 'string') ? f.fileName : null;
      const target = name || p || fileName || '';
      const lower = typeof target === 'string' ? target.toLowerCase() : '';
      return lower.endsWith('.cpp') || lower.endsWith('.ccp');
    });

    const cppSource = cppFile && (cppFile.content ?? cppFile.source ?? cppFile.data ?? null);

    // Create evaluation row early, so UI can display failure even if submission is invalid.
    const evaluation = this.db.insertCodeEvaluation({
      submission_id: submissionId,
      question_id: questionId,
      score: 0,
      max_score: 0,
      status: 'pending'
    });

    if (!cppFile || !cppSource) {
      const fileHints = filesData
        .map((f) => {
          if (!f) return null;
          const name = typeof f.name === 'string' ? f.name : null;
          const p = typeof f.path === 'string' ? f.path : null;
          const fileName = typeof f.fileName === 'string' ? f.fileName : null;
          return name || p || fileName || null;
        })
        .filter(Boolean)
        .join(', ');

      const hasContent = filesData.some(
        (f) => f && typeof f.content === 'string' && f.content.trim().length > 0
      );

      const msg = `No C++ source file (.cpp/.ccp) found in submission (missing name/content). Files: [${fileHints || 'none'}], hasContent: ${hasContent}`;

      console.error('[CodeEvalService] ' + msg);
      this.db.updateCodeEvaluation(evaluation.evaluation_id, {
        status: 'failed_compile',
        compile_exit_code: null,
        compile_stdout: '',
        compile_stderr: msg,
        error_summary: msg
      });

      return {
        evaluation: this.db.getCodeEvaluationById(evaluation.evaluation_id),
        results: []
      };
    }

    const mainCppPath = path.join(baseDir, 'main.cpp');
    fs.writeFileSync(mainCppPath, String(cppSource), 'utf8');

    let compileResult;
    try {
      compileResult = await this._compile(mainCppPath, baseDir);
    } catch (err) {
      this.db.updateCodeEvaluation(evaluation.evaluation_id, {
        status: 'failed_compile',
        compile_exit_code: err.exitCode ?? null,
        compile_stdout: err.stdout || '',
        compile_stderr: err.stderr || String(err.message || err)
      });
      const failedEval = this.db.getCodeEvaluationById(evaluation.evaluation_id);
      return {
        evaluation: failedEval,
        results: []
      };
    }

    this.db.updateCodeEvaluation(evaluation.evaluation_id, {
      status: 'compiled',
      compile_exit_code: compileResult.exitCode,
      compile_stdout: compileResult.stdout,
      compile_stderr: compileResult.stderr
    });

    const testCases = this.db.getQuestionTestCasesByQuestionId(questionId);
    if (!testCases.length) {
      const evalNoTests = this.db.updateCodeEvaluation(evaluation.evaluation_id, {
        status: 'completed',
        score: 0,
        max_score: 0
      });
      const evalRow = this.db.getCodeEvaluationById(evaluation.evaluation_id);
      return {
        evaluation: evalRow,
        results: []
      };
    }

    const exePath = compileResult.exePath;
    let totalScore = 0;
    let maxScore = 0;
    const results = [];
    let aborted = false;

    for (const tc of testCases) {
      if (aborted) break;
      const weight = typeof tc.weight === 'number' ? tc.weight : 1.0;
      maxScore += weight;

      const runTimeoutMs = tc.time_limit_ms || this.defaultTimeoutMs;
      const input = tc.input || '';
      const expected = (tc.expected_output || '').replace(/\r\n/g, '\n').trimEnd();

      try {
        const runRes = await this._runProgram(exePath, input, runTimeoutMs);
        const normalizedStdout = (runRes.stdout || '').replace(/\r\n/g, '\n').trimEnd();
        const passed =
          runRes.exitCode === 0 &&
          normalizedStdout === expected;

        if (passed) {
          totalScore += weight;
        }

        const resultRow = this.db.insertTestCaseResult({
          evaluation_id: evaluation.evaluation_id,
          test_case_id: tc.test_case_id,
          passed,
          execution_time_ms: runRes.durationMs,
          memory_kb: null,
          exit_code: runRes.exitCode,
          stdout: runRes.stdout,
          stderr: runRes.stderr
        });
        results.push(resultRow);
      } catch (err) {
        const isTimeout = err && err.code === 'TIMEOUT';
        const resultRow = this.db.insertTestCaseResult({
          evaluation_id: evaluation.evaluation_id,
          test_case_id: tc.test_case_id,
          passed: false,
          execution_time_ms: err.durationMs || runTimeoutMs,
          memory_kb: null,
          exit_code: null,
          stdout: err.stdout || '',
          stderr: err.stderr || (isTimeout ? 'TIMEOUT' : String(err.message || err))
        });
        results.push(resultRow);

        if (isTimeout) {
          aborted = true;
        }
      }
    }

    const status =
      aborted && totalScore > 0
        ? 'partial'
        : aborted
        ? 'partial'
        : 'completed';

    this.db.updateCodeEvaluation(evaluation.evaluation_id, {
      status,
      score: totalScore,
      max_score: maxScore
    });

    const finalEval = this.db.getCodeEvaluationById(evaluation.evaluation_id);
    return {
      evaluation: finalEval,
      results
    };
  }

  _getExamSubmissionFallback(submissionId) {
    const row = this.db.db.prepare(
      'SELECT * FROM exam_submissions WHERE submission_id = ?'
    ).get(submissionId);
    return row || null;
  }

  _compile(sourcePath, baseDir) {
    return new Promise((resolve, reject) => {
      const exeName = os.platform() === 'win32' ? 'main.exe' : 'main';
      const exePath = path.join(baseDir, exeName);

      const args = ['-std=c++17', sourcePath, '-o', exePath];
      const child = spawn(this.compiler, args, {
        cwd: baseDir,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

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

      child.on('error', (err) => {
        reject(err);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          const error = new Error('Compile failed');
          error.exitCode = code;
          error.stdout = stdout;
          error.stderr = stderr;
          return reject(error);
        }
        resolve({
          exitCode: code,
          stdout,
          stderr,
          exePath
        });
      });
    });
  }

  _runProgram(exePath, input, timeoutMs) {
    return new Promise((resolve, reject) => {
      const start = Date.now();

      const child = spawn(exePath, [], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let finished = false;

      const killChild = () => {
        if (!finished) {
          finished = true;
          try {
            child.kill('SIGKILL');
          } catch (e) {
            // ignore
          }
        }
      };

      const timeout = setTimeout(() => {
        killChild();
        const durationMs = Date.now() - start;
        const err = new Error('Execution timed out');
        err.code = 'TIMEOUT';
        err.durationMs = durationMs;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }, timeoutMs);

      if (input) {
        child.stdin.write(input);
      }
      child.stdin.end();

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

      child.on('error', (err) => {
        clearTimeout(timeout);
        if (!finished) {
          finished = true;
          reject(err);
        }
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (finished) return;
        finished = true;
        const durationMs = Date.now() - start;
        resolve({
          exitCode: code,
          stdout,
          stderr,
          durationMs
        });
      });
    });
  }
}

function safeSegment(str) {
  return String(str || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64);
}

function safeParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

module.exports = CodeEvalService;

