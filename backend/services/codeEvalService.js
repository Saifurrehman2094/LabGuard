const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const CodeAnalysisService = require('./codeAnalysisService');
const SandboxRunner = require('./sandboxRunner');

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
    this.analysisService = options.analysisService || new CodeAnalysisService();
    this.sandboxRunner = options.sandboxRunner || new SandboxRunner({
      maxOutputBytes: this.maxOutputBytes,
      defaultTimeoutMs: this.defaultTimeoutMs,
      defaultMemoryMb: Number(options.sandboxMemoryMb) || 256,
      defaultCpuSeconds: Number(options.sandboxCpuSeconds) || 5
    });
    this.maxTestcaseTimeoutMs = Number(options.maxTestcaseTimeoutMs) || 15000;
    this.minTestcaseTimeoutMs = Number(options.minTestcaseTimeoutMs) || 200;
    this.maxTestcaseMemoryKb = Number(options.maxTestcaseMemoryKb) || (512 * 1024);
    this.minTestcaseMemoryKb = Number(options.minTestcaseMemoryKb) || (32 * 1024);
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
    try {
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
        return lower.endsWith('.cpp') || lower.endsWith('.cc');
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

      const msg = `No C++ source file (.cpp/.cc) found in submission (missing name/content). Files: [${fileHints || 'none'}], hasContent: ${hasContent}`;

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
        this.db.updateCodeEvaluation(evaluation.evaluation_id, {
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
      const categoryStats = {};
      const failedExamples = [];
      const runtimeSamples = [];
      let timeoutCount = 0;
      const compareOptions = this._buildCompareOptions(questionId, testCases);

      for (const tc of testCases) {
      if (aborted) break;
      const weight = typeof tc.weight === 'number' ? tc.weight : 1.0;
      maxScore += weight;

        const runTimeoutMs = this._normalizeTimeoutMs(tc.time_limit_ms);
        const runMemoryMb = this._memoryLimitToMb(tc.memory_limit_kb);
        const input = this._normalizeMultiline(tc.input || '');
        const expected = this._normalizeMultiline(tc.expected_output || '').trimEnd();
      const category = this._getTestCaseCategory(tc);
      if (!categoryStats[category]) {
        categoryStats[category] = { passed: 0, total: 0 };
      }
      categoryStats[category].total += 1;

      try {
          const runRes = await this._runProgram(exePath, input, runTimeoutMs, runMemoryMb);
        const normalizedStdout = this._normalizeMultiline(runRes.stdout || '').trimEnd();
        const compareResult = this._compareOutput(normalizedStdout, expected, compareOptions);
        const passed = runRes.exitCode === 0 && compareResult.passed;

        if (passed) {
          totalScore += weight;
          categoryStats[category].passed += 1;
        } else if (failedExamples.length < 5) {
          failedExamples.push({
            test_case_id: tc.test_case_id,
            category,
            expected: expected.slice(0, 300),
            actual: normalizedStdout.slice(0, 300),
            reason: compareResult.reason || 'output_mismatch'
          });
        }
        runtimeSamples.push(runRes.durationMs);

        const resultRow = this.db.insertTestCaseResult({
          evaluation_id: evaluation.evaluation_id,
          test_case_id: tc.test_case_id,
          passed,
          execution_time_ms: runRes.durationMs,
          memory_kb: tc.memory_limit_kb ?? null,
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
          memory_kb: tc.memory_limit_kb ?? null,
          exit_code: null,
          stdout: err.stdout || '',
          stderr: err.stderr || (isTimeout ? 'TIMEOUT' : String(err.message || err))
        });
        results.push(resultRow);

        if (isTimeout) {
          aborted = true;
          timeoutCount += 1;
        }
      }
    }

      const status =
      aborted && totalScore > 0
        ? 'partial'
        : aborted
        ? 'partial'
        : 'completed';

      const requirementOptions = this._extractRequirementOptions(questionId, testCases);
      const staticAnalysis = this.analysisService.analyzeCppSource(cppSource, requirementOptions);
      const variantAnalysis = this._runVariantChecks(testCases, exePath);
      const hardcodingFlags = this._buildHardcodingFlags(staticAnalysis, categoryStats, variantAnalysis);
      const analysisBreakdown = this._buildAnalysisBreakdown({
        score: totalScore,
        maxScore,
        categoryStats,
        timeoutCount,
        runtimeSamples,
        failedExamples,
        staticAnalysis,
        variantAnalysis,
        status
      });

      this.db.updateCodeEvaluation(evaluation.evaluation_id, {
        status,
        score: totalScore,
        max_score: maxScore,
        analysis_breakdown_json: analysisBreakdown,
        requirement_checks_json: staticAnalysis,
        hardcoding_flags_json: hardcodingFlags,
        ai_summary_text: null,
        ai_summary_confidence: null,
        ai_summary_updated_at: null
      });

      const finalEval = this.db.getCodeEvaluationById(evaluation.evaluation_id);
      return {
        evaluation: finalEval,
        results
      };
    } finally {
      this._cleanupWorkdir(baseDir);
    }
  }

  _getExamSubmissionFallback(submissionId) {
    const row = this.db.db.prepare(
      'SELECT * FROM exam_submissions WHERE submission_id = ?'
    ).get(submissionId);
    return row || null;
  }

  async _compile(sourcePath, baseDir) {
    const exeName = os.platform() === 'win32' ? 'main.exe' : 'main';
    const exePath = path.join(baseDir, exeName);
    const args = ['-std=c++17', sourcePath, '-o', exePath];
    const result = await this.sandboxRunner.runCommand({
      command: this.compiler,
      args,
      cwd: baseDir,
      timeoutMs: Math.max(this.defaultTimeoutMs * 3, 8000),
      memoryMb: 512,
      cpuSeconds: 15
    });
    if (result.exitCode !== 0) {
      const error = new Error('Compile failed');
      error.exitCode = result.exitCode;
      error.stdout = result.stdout || '';
      error.stderr = result.stderr || '';
      throw error;
    }
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      exePath
    };
  }

  _runProgram(exePath, input, timeoutMs, memoryMb) {
    const start = Date.now();
    return this.sandboxRunner
      .runCommand({
        command: exePath,
        args: [],
        cwd: path.dirname(exePath),
        stdin: input || '',
        timeoutMs,
        memoryMb,
        cpuSeconds: Math.max(1, Math.ceil(timeoutMs / 1000))
      })
      .then((res) => ({
        exitCode: res.exitCode,
        stdout: res.stdout,
        stderr: res.stderr,
        durationMs: Date.now() - start
      }))
      .catch((err) => {
        err.durationMs = err.durationMs || Date.now() - start;
        throw err;
      });
  }

  _getTestCaseCategory(testCase) {
    const metadata = (testCase && testCase.metadata) || {};
    if (metadata && typeof metadata.category === 'string') {
      return metadata.category;
    }
    if (testCase.is_hidden) return 'hidden';
    if (testCase.is_edge_case) return 'edge';
    return 'basic';
  }

  _buildCompareOptions(questionId, testCases) {
    const question = this.db.getExamQuestionById ? this.db.getExamQuestionById(questionId) : null;
    const mergedMeta = {};
    for (const tc of testCases) {
      if (tc && tc.metadata && typeof tc.metadata === 'object') {
        Object.assign(mergedMeta, tc.metadata.compare || {});
      }
    }
    const questionMeta = (question && question.description && this._extractJsonBlock(question.description)) || {};
    return {
      ignoreCase: Boolean(mergedMeta.ignoreCase || questionMeta.ignoreCase),
      floatEpsilon:
        typeof mergedMeta.floatEpsilon === 'number'
          ? mergedMeta.floatEpsilon
          : typeof questionMeta.floatEpsilon === 'number'
          ? questionMeta.floatEpsilon
          : null
    };
  }

  _compareOutput(actual, expected, options) {
    const normalize = (v) => this._normalizeMultiline(v).trimEnd();
    const a = normalize(actual);
    const e = normalize(expected);
    if (a === e) return { passed: true, reason: 'exact_match' };

    const linesA = a.split('\n').map((line) => line.trim());
    const linesE = e.split('\n').map((line) => line.trim());
    const wsA = linesA.join('\n');
    const wsE = linesE.join('\n');
    if (wsA === wsE) return { passed: true, reason: 'whitespace_only' };

    if (options && options.ignoreCase) {
      if (wsA.toLowerCase() === wsE.toLowerCase()) {
        return { passed: true, reason: 'case_only_difference' };
      }
    }

    const epsilon = options && typeof options.floatEpsilon === 'number' ? options.floatEpsilon : null;
    if (epsilon != null && this._compareNumericTokens(wsA, wsE, epsilon)) {
      return { passed: true, reason: 'float_tolerance' };
    }

    return { passed: false, reason: 'output_mismatch' };
  }

  _compareNumericTokens(actual, expected, epsilon) {
    const tokenize = (text) => text.trim().split(/\s+/).filter(Boolean);
    const a = tokenize(actual);
    const e = tokenize(expected);
    if (a.length !== e.length) return false;
    for (let i = 0; i < a.length; i++) {
      const ai = Number(a[i]);
      const ei = Number(e[i]);
      if (Number.isNaN(ai) || Number.isNaN(ei)) {
        if (a[i] !== e[i]) return false;
      } else if (Math.abs(ai - ei) > epsilon) {
        return false;
      }
    }
    return true;
  }

  _extractRequirementOptions(questionId, testCases) {
    const question = this.db.getExamQuestionById ? this.db.getExamQuestionById(questionId) : null;
    const fromQuestionConstraints =
      question && question.constraints_json && typeof question.constraints_json === 'object'
        ? question.constraints_json
        : {};
    const fromQuestionLegacy = question && question.description ? this._extractJsonBlock(question.description) : {};
    const fromMeta = {};
    for (const tc of testCases) {
      if (tc && tc.metadata && typeof tc.metadata === 'object' && tc.metadata.requirements) {
        Object.assign(fromMeta, tc.metadata.requirements);
      }
    }
    return {
      required_concepts: Array.isArray(fromMeta.required_concepts)
        ? fromMeta.required_concepts
        : Array.isArray(fromQuestionConstraints.required_concepts)
        ? fromQuestionConstraints.required_concepts
        : Array.isArray(fromQuestionLegacy.required_concepts)
        ? fromQuestionLegacy.required_concepts
        : [],
      required_loop: Boolean(fromMeta.required_loop || fromQuestionConstraints.required_loop || fromQuestionLegacy.required_loop),
      required_recursion: Boolean(
        fromMeta.required_recursion ||
          fromQuestionConstraints.required_recursion ||
          fromQuestionLegacy.required_recursion
      ),
      max_loop_nesting:
        typeof fromMeta.max_loop_nesting === 'number'
          ? fromMeta.max_loop_nesting
          : typeof fromQuestionConstraints.max_loop_nesting === 'number'
          ? fromQuestionConstraints.max_loop_nesting
          : typeof fromQuestionLegacy.max_loop_nesting === 'number'
          ? fromQuestionLegacy.max_loop_nesting
          : null,
      expected_complexity:
        typeof fromMeta.expected_complexity === 'string'
          ? fromMeta.expected_complexity
          : typeof fromQuestionConstraints.expected_complexity === 'string'
          ? fromQuestionConstraints.expected_complexity
          : typeof fromQuestionLegacy.expected_complexity === 'string'
          ? fromQuestionLegacy.expected_complexity
          : null,
      requirements_mode:
        fromMeta.requirements_mode === 'manual' || fromMeta.requirements_mode === 'auto'
          ? fromMeta.requirements_mode
          : fromQuestionConstraints.requirements_mode === 'manual' || fromQuestionConstraints.requirements_mode === 'auto'
          ? fromQuestionConstraints.requirements_mode
          : fromQuestionLegacy.requirements_mode === 'manual' || fromQuestionLegacy.requirements_mode === 'auto'
          ? fromQuestionLegacy.requirements_mode
          : 'auto'
    };
  }

  _extractJsonBlock(text) {
    if (!text || typeof text !== 'string') return {};
    const match = text.match(/\{[\s\S]*\}$/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch (error) {
      return {};
    }
  }

  _runVariantChecks(testCases, exePath) {
    const variantCases = testCases.filter((tc) => {
      const category = this._getTestCaseCategory(tc);
      return category === 'variant' || category === 'adversarial';
    });
    if (!variantCases.length) {
      return {
        considered: 0,
        passed: 0,
        failed: 0
      };
    }
    // We already executed all provided test cases in the same run.
    // This block exposes variant/adversarial counts to downstream scoring and summary.
    return {
      considered: variantCases.length,
      passed: null,
      failed: null
    };
  }

  _buildHardcodingFlags(staticAnalysis, categoryStats, variantAnalysis) {
    const flags = [];
    const suspicious = staticAnalysis && staticAnalysis.checks && staticAnalysis.checks.suspicious_patterns;
    if (Array.isArray(suspicious) && suspicious.length > 0) {
      flags.push(...suspicious);
    }
    const hidden = categoryStats.hidden;
    const edge = categoryStats.edge;
    if (hidden && hidden.total > 0 && hidden.passed < hidden.total && (categoryStats.basic?.passed || 0) === (categoryStats.basic?.total || 0)) {
      flags.push('fails_hidden_after_basic_pass');
    }
    if (edge && edge.total > 0 && edge.passed === 0 && (categoryStats.basic?.passed || 0) > 0) {
      flags.push('fails_all_edge_cases');
    }
    const level = flags.length >= 3 ? 'high' : flags.length >= 1 ? 'medium' : 'low';
    return {
      suspicion_level: level,
      reasons: Array.from(new Set(flags)),
      variant_summary: variantAnalysis
    };
  }

  _buildAnalysisBreakdown(params) {
    const {
      score,
      maxScore,
      categoryStats,
      timeoutCount,
      runtimeSamples,
      failedExamples,
      staticAnalysis,
      variantAnalysis,
      status
    } = params;
    const avgRuntimeMs = runtimeSamples.length
      ? Math.round(runtimeSamples.reduce((sum, v) => sum + v, 0) / runtimeSamples.length)
      : null;
    const passRate = maxScore > 0 ? Number((score / maxScore).toFixed(4)) : 0;
    const nearCorrect = passRate >= 0.8 && failedExamples.length <= 2;
    return {
      status,
      score,
      max_score: maxScore,
      pass_rate: passRate,
      category_stats: categoryStats,
      timeout_count: timeoutCount,
      runtime_summary: {
        avg_runtime_ms: avgRuntimeMs,
        max_runtime_ms: runtimeSamples.length ? Math.max(...runtimeSamples) : null
      },
      failed_examples: failedExamples,
      near_correct: nearCorrect,
      requirement_summary: staticAnalysis ? staticAnalysis.unmet_requirements : [],
      variant_summary: variantAnalysis
    };
  }

  _normalizeTimeoutMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this.defaultTimeoutMs;
    return Math.min(this.maxTestcaseTimeoutMs, Math.max(this.minTestcaseTimeoutMs, Math.floor(numeric)));
  }

  _memoryLimitToMb(memoryLimitKb) {
    const numericKb = Number(memoryLimitKb);
    const boundedKb = Number.isFinite(numericKb)
      ? Math.min(this.maxTestcaseMemoryKb, Math.max(this.minTestcaseMemoryKb, Math.floor(numericKb)))
      : 256 * 1024;
    return Math.max(32, Math.floor(boundedKb / 1024));
  }

  _cleanupWorkdir(baseDir) {
    try {
      if (baseDir && fs.existsSync(baseDir)) {
        fs.rmSync(baseDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn('[CodeEvalService] cleanup failed:', err && err.message ? err.message : err);
    }
  }

  _normalizeMultiline(value) {
    let text = String(value == null ? '' : value);
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    if (text.includes('/n') && !text.includes('\\n')) {
      text = text.replace(/\/n/g, '\n');
    }
    return text;
  }

  getAnalysisCapabilities() {
    if (!this.analysisService || typeof this.analysisService.getCapabilities !== 'function') {
      return {
        recursion_ast_available: false,
        clang_binary: null,
        clang_error: 'analysis_service_missing'
      };
    }
    return this.analysisService.getCapabilities();
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

