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
 * Run code against all test cases
 * @param {string} sourceCode
 * @param {Array<{testCaseId: string, input: string, expectedOutput: string}>} testCases
 * @param {string} language
 * @param {number} timeLimit
 * @returns {Promise<Array<{testCaseId, passed, actualOutput, executionTimeMs, error}>>}
 */
async function runAgainstTestCases(sourceCode, testCases, language = 'python', timeLimit = 2) {
  const results = [];

  for (const tc of testCases) {
    try {
      const runResult = await runCode(sourceCode, tc.input, language, timeLimit);

      const passed = !runResult.error && outputsMatch(runResult.stdout, tc.expectedOutput);

      results.push({
        testCaseId: tc.testCaseId,
        passed,
        actualOutput: runResult.stdout,
        executionTimeMs: runResult.executionTime,
        error: runResult.error
      });
    } catch (err) {
      results.push({
        testCaseId: tc.testCaseId,
        passed: false,
        actualOutput: null,
        executionTimeMs: null,
        error: err.message || 'Execution failed'
      });
    }
  }

  return results;
}

module.exports = {
  runCode,
  runAgainstTestCases,
  getLanguageId,
  LANGUAGE_IDS,
  outputsMatch
};
