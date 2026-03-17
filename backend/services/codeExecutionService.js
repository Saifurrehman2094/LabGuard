/**
 * Code Execution Service - Judge0 CE (free sandbox)
 * https://ce.judge0.com/ - No API key required
 */

const JUDGE0_BASE = 'https://ce.judge0.com';

// Language IDs from Judge0
const LANGUAGE_IDS = {
  python: 71,
  python3: 71,
  c: 50,
  cpp: 54,
  'c++': 54,
  java: 62,
  javascript: 63,
  js: 63
};

function getLanguageId(lang) {
  const key = (lang || 'python').toLowerCase().trim();
  return LANGUAGE_IDS[key] || 71; // Default Python
}

/**
 * Run code with given stdin
 * @param {string} sourceCode - Student's code
 * @param {string} stdin - Input for the program
 * @param {string} language - python, cpp, java, etc.
 * @param {number} timeLimit - seconds (default 2)
 * @returns {Promise<{stdout: string, stderr: string, statusId: number, executionTime: number, error: string|null}>}
 */
async function runCode(sourceCode, stdin, language = 'python', timeLimit = 2) {
  const languageId = getLanguageId(language);

  const response = await fetch(
    `${JUDGE0_BASE}/submissions?base64_encoded=false&wait=true`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_code: sourceCode,
        language_id: languageId,
        stdin: stdin || '',
        cpu_time_limit: timeLimit,
        memory_limit: 256000 // 256 MB
      })
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Judge0 error ${response.status}: ${errText}`);
  }

  const result = await response.json();

  // Status IDs: 1=In Queue, 2=Processing, 3=Accepted, 4=Wrong Answer, 5=Time Limit, 6=Compilation Error, etc.
  const statusId = result.status?.id ?? 0;
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const compileOutput = result.compile_output || '';
  const executionTime = result.time ? parseFloat(result.time) * 1000 : 0;

  let error = null;
  if (statusId === 6) {
    error = compileOutput || stderr || 'Compilation error';
  } else if (statusId === 5) {
    error = 'Time limit exceeded';
  } else if (statusId === 9) {
    error = 'Runtime error: ' + (stderr || result.message);
  } else if (statusId !== 3 && statusId !== 4 && statusId !== 1 && statusId !== 2) {
    error = result.message || stderr || `Status ${statusId}`;
  }

  return {
    stdout,
    stderr,
    statusId,
    executionTime: Math.round(executionTime),
    error
  };
}

/**
 * Normalize output for comparison (trim, normalize newlines)
 */
function normalizeOutput(str) {
  if (str == null) return '';
  return String(str).replace(/\r\n/g, '\n').trim();
}

/**
 * Compare actual output with expected (flexible matching)
 */
function outputsMatch(actual, expected) {
  return normalizeOutput(actual) === normalizeOutput(expected);
}

/**
 * Compute partial score (0-100) for output correctness.
 * - Exact match: 100
 * - Partial match: line-by-line or token similarity
 * - Execution error: 0 (syntax/compile/runtime - cannot verify output)
 */
function computeOutputScore(actual, expected, error) {
  if (error) return 0;
  const a = normalizeOutput(actual);
  const e = normalizeOutput(expected);
  if (a === e) return 100;

  // Partial credit: line-by-line match
  const aLines = a.split(/\n/).filter(Boolean);
  const eLines = e.split(/\n/).filter(Boolean);
  if (aLines.length === 0 && eLines.length === 0) return 100;
  if (aLines.length === 0 || eLines.length === 0) return 0;

  let matchCount = 0;
  const maxLen = Math.max(aLines.length, eLines.length);
  for (let i = 0; i < Math.min(aLines.length, eLines.length); i++) {
    if (aLines[i].trim() === eLines[i].trim()) matchCount++;
  }
  const lineScore = (matchCount / maxLen) * 100;

  // Also consider token overlap for single-line outputs
  const aTokens = a.split(/\s+/).filter(Boolean);
  const eTokens = e.split(/\s+/).filter(Boolean);
  if (aTokens.length > 0 && eTokens.length > 0) {
    const common = new Set([...aTokens].filter(t => eTokens.includes(t)));
    const tokenScore = (common.size / Math.max(aTokens.length, eTokens.length)) * 100;
    return Math.round(Math.max(lineScore, tokenScore));
  }
  return Math.round(lineScore);
}

/**
 * Run code against all test cases with scoring (0-100 per case, not just pass/fail)
 * @param {string} sourceCode
 * @param {Array<{testCaseId: string, input: string, expectedOutput: string}>} testCases
 * @param {string} language
 * @param {number} timeLimit
 * @param {object} opts - { problemText, analyzeLogic } - for compile errors, analyzeLogic(problemText, sourceCode, error) returns 0-100
 * @returns {Promise<Array<{testCaseId, passed, score, actualOutput, executionTimeMs, error}>>}
 */
async function runAgainstTestCases(sourceCode, testCases, language = 'python', timeLimit = 2, opts = {}) {
  const results = [];
  const { problemText, analyzeLogic } = opts;

  for (const tc of testCases) {
    try {
      const runResult = await runCode(sourceCode, tc.input, language, timeLimit);

      // Compile/syntax error: use AI to grade logic if available (don't run remaining test cases)
      const isCompileError = runResult.statusId === 6 || (runResult.error && /compil|syntax/i.test(runResult.error));
      if (isCompileError && problemText && typeof analyzeLogic === 'function') {
        const logicScore = await analyzeLogic(problemText, sourceCode, runResult.error);
        for (const t of testCases) {
          results.push({
            testCaseId: t.testCaseId,
            passed: false,
            score: logicScore,
            actualOutput: null,
            executionTimeMs: null,
            error: runResult.error
          });
        }
        return results;
      }

      const score = computeOutputScore(runResult.stdout, tc.expectedOutput, runResult.error);
      const passed = score >= 100;

      results.push({
        testCaseId: tc.testCaseId,
        passed,
        score,
        actualOutput: runResult.stdout,
        executionTimeMs: runResult.executionTime,
        error: runResult.error
      });
    } catch (err) {
      results.push({
        testCaseId: tc.testCaseId,
        passed: false,
        score: 0,
        actualOutput: null,
        executionTimeMs: null,
        error: err.message || 'Execution failed'
      });
    }
  }

  return results;
}

/**
 * Compute overall submission score (0-100) from test case results
 */
function computeSubmissionScore(results) {
  if (!results || results.length === 0) return 0;
  const total = results.reduce((sum, r) => sum + (r.score ?? (r.passed ? 100 : 0)), 0);
  return Math.round(total / results.length);
}

module.exports = {
  runCode,
  runAgainstTestCases,
  computeOutputScore,
  computeSubmissionScore,
  getLanguageId,
  LANGUAGE_IDS,
  outputsMatch
};
