/**
 * Code Analysis Service — Hardcoding Detection
 * Detects when students hardcode expected outputs instead of computing them.
 *
 * Three independent checks:
 *  1. String-literal match   — expected output appears verbatim in quotes (pattern problems)
 *  2. Print-count match      — number of print statements == output line count AND no loop found
 *  3. Magic-number match     — single-number expected output appears as bare literal with no computation
 */

/** Strip single-line and multi-line comments */
function stripComments(code) {
  return (code || '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/#.*$/gm, '');
}

/** Count print/output statements across languages */
function countPrintStatements(code) {
  if (!code) return 0;
  const c = stripComments(code);
  const patterns = [
    /\bprint\s*\(/g,          // Python print(...)
    /\bprintln\s*\(/g,        // Java System.out.println
    /\bcout\s*<</g,           // C++
    /\bprintf\s*\(/g,         // C printf
    /\bconsole\.log\s*\(/g,   // JavaScript
    /\bputs\s*\(/g,           // Ruby-style / some C
    /\bwrite\s*\(/g           // generic write
  ];
  let count = 0;
  for (const p of patterns) {
    const matches = c.match(p);
    if (matches) count += matches.length;
  }
  return count;
}

/** Check if any loop construct exists in the code */
function hasAnyLoop(code) {
  if (!code) return false;
  const c = stripComments(code);
  return (
    /\bfor\s*[\(\w]/.test(c) ||
    /\bwhile\s*[\(\w]/.test(c) ||
    /\bdo\s*\{/.test(c) ||
    /\bfor\s+\w+\s+in\b/.test(c)
  );
}

/** Count the total number of output lines across all test cases */
function countTotalOutputLines(testCases) {
  let total = 0;
  for (const tc of (testCases || [])) {
    const out = (tc.expected_output || tc.expectedOutput || '').trim();
    if (out) total += out.split('\n').length;
  }
  return total;
}

/**
 * Check 1 — String literal match (primarily for pattern problems but runs on all types).
 * Returns evidence string if any expected output line longer than 3 chars appears
 * as a string literal inside the student code.
 */
function checkStringLiteralHardcoding(studentCode, testCases) {
  if (!studentCode || !testCases || testCases.length === 0) return null;

  for (const tc of testCases) {
    const expected = (tc.expected_output || tc.expectedOutput || '').trim();
    if (!expected) continue;

    // Check whole output as a single escaped literal
    const asEscaped = expected.replace(/\r/g, '').replace(/\n/g, '\\n');
    if (
      (asEscaped.length > 3 && studentCode.includes('"' + asEscaped + '"')) ||
      (asEscaped.length > 3 && studentCode.includes("'" + asEscaped + "'"))
    ) {
      const preview = asEscaped.slice(0, 60) + (asEscaped.length > 60 ? '...' : '');
      return `"${preview}"`;
    }

    // Check each individual line of the expected output
    const lines = expected.split('\n');
    for (const line of lines) {
      const trimLine = line.trim();
      if (trimLine.length <= 3) continue;
      if (
        studentCode.includes('"' + trimLine + '"') ||
        studentCode.includes("'" + trimLine + "'")
      ) {
        const preview = trimLine.slice(0, 60) + (trimLine.length > 60 ? '...' : '');
        return `"${preview}"`;
      }
    }

    // Multi-line pattern: first line + \n hints at hardcoded block
    if (lines.length >= 3) {
      const firstLine = lines[0].trim();
      if (
        firstLine.length >= 2 &&
        (studentCode.includes(firstLine + '\\n') || studentCode.includes(firstLine + '\\r\\n'))
      ) {
        return `"${firstLine}\\n..." (multi-line literal)`;
      }
    }
  }
  return null;
}

/**
 * Check 2 — Print count matches total output line count AND no loop found.
 * Catches students who write one print per expected output line instead of looping.
 */
function checkPrintCountHardcoding(studentCode, testCases) {
  if (!studentCode || !testCases || testCases.length === 0) return null;
  if (hasAnyLoop(studentCode)) return null; // loops present → not this pattern

  const printCount = countPrintStatements(studentCode);
  if (printCount === 0) return null;

  const totalLines = countTotalOutputLines(testCases);
  if (totalLines === 0) return null;

  // Exact match: one print per output line, no loop
  if (printCount === totalLines) {
    return `${printCount} print statement(s) match ${totalLines} expected output line(s) with no loop in code`;
  }

  // Also flag if printCount matches the single test case line count
  for (const tc of testCases) {
    const out = (tc.expected_output || tc.expectedOutput || '').trim();
    if (!out) continue;
    const lines = out.split('\n').length;
    if (lines > 1 && printCount === lines) {
      return `${printCount} print statement(s) match ${lines} output lines for one test case, no loop found`;
    }
  }

  return null;
}

/**
 * Check 3 — Magic number: expected output is a single number and that exact number
 * appears as a bare literal in the code with no arithmetic operator adjacent to it.
 */
function checkMagicNumberHardcoding(studentCode, testCases) {
  if (!studentCode || !testCases || testCases.length === 0) return null;

  // Only trigger when ALL test cases have single-number outputs
  const singleNumOutputs = testCases
    .map(tc => (tc.expected_output || tc.expectedOutput || '').trim())
    .filter(o => o.length > 0 && /^-?\d+(\.\d+)?$/.test(o));

  if (singleNumOutputs.length === 0) return null;
  if (singleNumOutputs.length !== testCases.filter(tc => (tc.expected_output || tc.expectedOutput || '').trim()).length) return null;

  const stripped = stripComments(studentCode);

  for (const num of singleNumOutputs) {
    // Look for the number as a bare literal not surrounded by operators or identifiers
    const re = new RegExp(`(?<![\\w.])${num.replace('.', '\\.')}(?![\\w.])`, 'g');
    const matches = [...stripped.matchAll(re)];
    if (matches.length === 0) continue;

    // Check if it appears WITHOUT any surrounding computation (no +-*/ adjacent)
    for (const match of matches) {
      const start = Math.max(0, match.index - 4);
      const end = Math.min(stripped.length, match.index + num.length + 4);
      const ctx = stripped.slice(start, end);
      const hasComputation = /[+\-*/%<>]/.test(ctx.replace(num, ''));
      if (!hasComputation) {
        return `Expected output value ${num} appears as a bare literal (no computation around it)`;
      }
    }
  }

  return null;
}

/**
 * Main entry point.
 * @param {string} studentCode  - source code submitted by student
 * @param {Array}  testCases    - [{input_data, expected_output}] or [{input, expectedOutput}]
 * @param {string} problemType  - e.g. 'patterns', 'loops', 'arrays_1d', ...
 * @returns {{ hardcoded: boolean, penalty: number, reason: string } | { hardcoded: false }}
 */
function detectHardcoding(studentCode, testCases, problemType) {
  if (!studentCode || !testCases) return { hardcoded: false };

  const isPattern = problemType === 'patterns' ||
    /pattern|triangle|pyramid|star|diamond|hollow/i.test(problemType || '');

  // ── Check 1: String literal match (always run, penalty = 100) ──────────────
  const literalEvidence = checkStringLiteralHardcoding(studentCode, testCases);
  if (literalEvidence) {
    return {
      hardcoded: true,
      penalty: 100,
      reason: `Output hardcoded as string literal: ${literalEvidence}`
    };
  }

  // ── Check 2: Print count == output line count with no loop (penalty = 100) ─
  const printEvidence = checkPrintCountHardcoding(studentCode, testCases);
  if (printEvidence) {
    return {
      hardcoded: true,
      penalty: 100,
      reason: `Output appears hardcoded — no loop found but output matches line count: ${printEvidence}`
    };
  }

  // ── Check 3: Magic number (only for non-pattern types, lower confidence) ───
  if (!isPattern) {
    const magicEvidence = checkMagicNumberHardcoding(studentCode, testCases);
    if (magicEvidence) {
      return {
        hardcoded: true,
        penalty: 100,
        reason: `Suspicious magic number — ${magicEvidence}`
      };
    }
  }

  return { hardcoded: false };
}

module.exports = { detectHardcoding };
