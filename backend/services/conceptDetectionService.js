/**
 * Concept Detection Service - Programming Fundamentals
 * Detects: loops, do-while, switch, nested loops, 1D/2D/3D arrays,
 *          pointers, conditionals, recursion, and pattern hardcoding.
 */

const CONCEPTS = {
  LOOPS: 'loops',
  DO_WHILE: 'do_while',
  SWITCH: 'switch',
  NESTED_LOOPS: 'nested_loops',
  ARRAYS: 'arrays',
  ARRAYS_2D: 'arrays_2d',
  ARRAYS_3D: 'arrays_3d',
  POINTERS: 'pointers',
  CONDITIONALS: 'conditionals',
  RECURSION: 'recursion'
};

/** Strip comments from code */
function stripComments(code) {
  return (code || '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/#.*$/gm, '');  // Python/shell comments
}

/** Detect any loop (for / while / do-while / Python for-in) */
function hasLoops(code) {
  if (!code) return false;
  const c = stripComments(code);
  return (
    /\bfor\s*\(/.test(c) ||            // C/C++/Java: for(int i ...
    /\bfor\s+\w+\s+in\b/.test(c) ||   // Python: for x in ...
    /\bfor\s*\(\s*int\s+/.test(c) ||  // explicit C++ for(int i
    /\bwhile\s*\(/.test(c) ||          // C/C++/Java while(
    /\bwhile\s+/.test(c) ||            // Python while
    /\bdo\s*\{/.test(c) ||             // do { ... } while
    /\bdo\s*$/.test(c)
  );
}

/** Detect do-while specifically (C/C++/Java) */
function hasDoWhile(code) {
  if (!code) return false;
  const c = stripComments(code);
  // do { ... } while(...);
  return /\bdo\s*\{[\s\S]*?\}\s*while\s*\(/.test(c);
}

/** Detect switch/case statement */
function hasSwitchStatement(code) {
  if (!code) return false;
  const c = stripComments(code);
  return /\bswitch\s*\(/.test(c) && /\bcase\s+/.test(c);
}

/** Detect nested loops (loop inside a loop) */
function hasNestedLoops(code) {
  if (!code) return false;
  const c = stripComments(code);
  // Count distinct loop starts (for / while)
  const forMatches   = (c.match(/\bfor\s*[\(\w]/g) || []).length;
  const whileMatches = (c.match(/\bwhile\s*[\(\w]/g) || []).length;
  const total = forMatches + whileMatches;
  if (total >= 2) return true;
  // Python: two for-in on same indentation chain
  if (/\bfor\s+\w+\s+in\b[\s\S]+\bfor\s+\w+\s+in\b/.test(c)) return true;
  // C++: explicit for(int i...){ for(int j... pattern
  if (/\bfor\s*\(\s*int\s+\w+[\s\S]+\bfor\s*\(\s*int\s+\w+/.test(c)) return true;
  return false;
}

/** Detect 1D array / list usage */
function hasArrays(code, language) {
  if (!code) return false;
  const c = code.toLowerCase();
  const lang = (language || '').toLowerCase();

  if (lang === 'python') {
    return (
      /\blist\s*\(/.test(c) || /\[\s*\]/.test(c) ||
      /\.split\s*\(/.test(c) || /\.append\s*\(/.test(c) ||
      /\brange\s*\(/.test(c) && /\[\s*\w/.test(c) ||
      /=\s*\[/.test(c)
    );
  }
  if (lang === 'cpp' || lang === 'c++') {
    return (
      /\bvector\s*</.test(c) ||
      /\bstd::vector\b/.test(c) ||
      /\bint\s+\w+\s*\[/.test(c) ||      // int arr[100]
      /\bchar\s+\w+\s*\[/.test(c) ||     // char arr[100]
      /\bfloat\s+\w+\s*\[/.test(c) ||    // float arr[100]
      /\bdouble\s+\w+\s*\[/.test(c) ||   // double arr[100]
      /\blong\s+\w+\s*\[/.test(c) ||     // long arr[100]
      /\barray\s*</.test(c)
    );
  }
  if (lang === 'c') {
    return (
      /\bint\s+\w+\s*\[/.test(c) || /\bchar\s+\w+\s*\[/.test(c) ||
      /\bfloat\s+\w+\s*\[/.test(c) || /\bdouble\s+\w+\s*\[/.test(c)
    );
  }
  if (lang === 'java') {
    return /\bint\s*\[\s*\]/.test(c) || /\barraylist\b/.test(c) || /\bnew\s+int\s*\[/.test(c);
  }
  // Generic fallback
  return /\[\s*\]/.test(c) || /\.split\s*\(/.test(c) || /\bvector\b/.test(c) || /\barray\b/.test(c);
}

/** Detect 2D array / matrix usage */
function has2DArrays(code, language) {
  if (!code) return false;
  const c = code.toLowerCase();
  const lang = (language || '').toLowerCase();

  if (lang === 'python') {
    // list of lists, [[...]], or [[] for _ in range]
    return (
      /\[\s*\[/.test(c) ||
      /\[\s*\[\s*\]\s*for\b/.test(c) ||
      /\w+\s*\[\s*\w+\s*\]\s*\[\s*\w+\s*\]/.test(c)
    );
  }
  if (lang === 'cpp' || lang === 'c++' || lang === 'c') {
    return (
      /\bint\s+\w+\s*\[\s*\d*\s*\]\s*\[\s*\d*\s*\]/.test(c) ||
      /\bvector\s*<\s*vector\s*</.test(c) ||
      /\w+\s*\[\s*\w+\s*\]\s*\[\s*\w+\s*\]/.test(c)
    );
  }
  if (lang === 'java') {
    return (
      /\bint\s*\[\s*\]\s*\[\s*\]/.test(c) ||
      /\bnew\s+int\s*\[\s*\d*\s*\]\s*\[\s*\d*\s*\]/.test(c) ||
      /\w+\s*\[\s*\w+\s*\]\s*\[\s*\w+\s*\]/.test(c)
    );
  }
  // Generic: any double-index access or nested brackets
  return /\w+\s*\[\s*\w+\s*\]\s*\[\s*\w+\s*\]/.test(c) || /\[\s*\[/.test(c);
}

/** Detect 3D array usage */
function has3DArrays(code, language) {
  if (!code) return false;
  const c = code.toLowerCase();
  // Triple index access or triple nested vector/list
  return (
    /\w+\s*\[\s*\w+\s*\]\s*\[\s*\w+\s*\]\s*\[\s*\w+\s*\]/.test(c) ||
    /\bvector\s*<\s*vector\s*<\s*vector\s*</.test(c) ||
    /\[\s*\[\s*\[/.test(c)
  );
}

/** Detect pointer usage (C/C++ only) */
function hasPointers(code, language) {
  if (!code) return false;
  const lang = (language || '').toLowerCase();
  if (lang !== 'c' && lang !== 'cpp' && lang !== 'c++') return false;
  const c = stripComments(code);
  return (
    // Pointer type declarations: int*, char*, void*, float*, double*
    /\bint\s*\*/.test(c)    ||
    /\bchar\s*\*/.test(c)   ||
    /\bvoid\s*\*/.test(c)   ||
    /\bfloat\s*\*/.test(c)  ||
    /\bdouble\s*\*/.test(c) ||
    /\blong\s*\*/.test(c)   ||
    // Arrow operator for struct/class member access
    /\w+\s*->\s*\w+/.test(c) ||
    // Pointer arithmetic: ptr++ or ptr--
    /\w+\s*\+\+/.test(c) && /\*\s*\w+/.test(c) ||  // ptr++ with dereference elsewhere
    /\w+\s*--/.test(c)   && /\*\s*\w+/.test(c) ||
    // Dereference + address-of both present (strong signal)
    (/\*\s*\w+/.test(c) && /&\s*\w+/.test(c)) ||
    // Explicit pointer arithmetic: ptr + n or ptr - n
    /\w+\s*\+\s*\w+/.test(c) && /\*\s*\w+/.test(c)
  );
}

/** Detect if/else/switch conditionals */
function hasConditionals(code) {
  if (!code) return false;
  return /\bif\s*\(|\belse\b|\belif\b|\bswitch\s*\(/.test(code);
}

/** Detect recursion (function calls itself) */
function hasRecursion(code, language) {
  if (!code) return false;
  const c = stripComments(code);

  // Python: def foo(...): ... foo(...)
  const pyFns = [...c.matchAll(/\bdef\s+(\w+)\s*\(/g)];
  for (const m of pyFns) {
    const name = m[1];
    if (name === 'main') continue;
    const after = c.slice(m.index + m[0].length);
    if (new RegExp(`\\b${name}\\s*\\(`).test(after)) return true;
  }

  // JS: function foo(...) { ... foo(...) }
  const jsFns = [...c.matchAll(/\bfunction\s+(\w+)\s*\(/g)];
  for (const m of jsFns) {
    const name = m[1];
    if (name === 'main') continue;
    const after = c.slice(m.index + m[0].length);
    if (new RegExp(`\\b${name}\\s*\\(`).test(after)) return true;
  }

  // C/C++/Java: return-type name(...) { ... name(...) }
  const cFns = [...c.matchAll(/\b(?:int|long|void|bool|double|float|string|char|auto)\s+(\w+)\s*\(/g)];
  for (const m of cFns) {
    const name = m[1];
    if (name === 'main') continue;
    const braceStart = c.indexOf('{', m.index);
    if (braceStart >= 0 && new RegExp(`\\b${name}\\s*\\(`).test(c.slice(braceStart + 1))) return true;
  }

  // C++ specific: return funcname( inside function body (return-based recursive call)
  const returnRecursive = [...c.matchAll(/\breturn\s+(\w+)\s*\(/g)];
  for (const m of returnRecursive) {
    const name = m[1];
    if (name === 'main') continue;
    // Check function is declared somewhere above this return
    if (new RegExp(`\\b(?:int|long|void|bool|double|float)\\s+${name}\\s*\\(`).test(c)) return true;
  }

  return false;
}

/**
 * Full hardcoding detection for pattern problems.
 * Returns { hardcoded: bool, reason: string, confidence: 'high'|'medium' }
 *
 * Catches four patterns:
 *  1. Full output embedded as \n-escaped string literal
 *  2. Repeated print statements with incrementally growing symbol strings
 *  3. Hardcoded list/array whose length matches expected output line count
 *  4. Symbol multiplied by a literal number (not a variable)
 */
function detectPatternHardcoding(code, expectedOutputs, language) {
  const NO = { hardcoded: false };
  if (!code || !expectedOutputs || expectedOutputs.length === 0) return NO;

  const stripped = stripComments(code);

  // ── Check 1: multi-line output embedded as single escaped string literal ──
  for (const expected of expectedOutputs) {
    if (!expected || typeof expected !== 'string') continue;
    const trimmed = expected.trim();
    if (trimmed.length < 4) continue;

    const asEscaped = trimmed.replace(/\r/g, '').replace(/\n/g, '\\n');
    if (code.includes('"' + asEscaped + '"') || code.includes("'" + asEscaped + "'")) {
      return { hardcoded: true, confidence: 'high', reason: `Output hardcoded as string literal: "${asEscaped.slice(0, 50)}"` };
    }

    if (trimmed.indexOf('\n') === -1 && trimmed.length > 3) {
      if (code.includes('"' + trimmed + '"') || code.includes("'" + trimmed + "'")) {
        return { hardcoded: true, confidence: 'high', reason: `Output hardcoded as string literal: "${trimmed}"` };
      }
    }

    const lines = trimmed.split('\n');
    if (lines.length >= 2) {
      const first = lines[0].trim();
      if (first.length >= 2 && (code.includes(first + '\\n') || code.includes(first + '\\r\\n'))) {
        return { hardcoded: true, confidence: 'high', reason: `Pattern first line "${first}\\n" appears hardcoded — use loops instead` };
      }
    }
  }

  // ── Check 2: repeated print calls where string lengths increase by exactly 1 ──
  // Matches: print("*"), print("**"), print("***") or cout << "*" etc.
  const printLiterals = [...stripped.matchAll(
    /(?:print\s*\(\s*["']|cout\s*<<\s*["']|printf\s*\(\s*["'])([*#@=+\-|^~.]{1,30})["']/g
  )].map(m => m[1]);

  if (printLiterals.length >= 3) {
    const lens = printLiterals.map(s => s.length);
    const allIncrement = lens.every((l, i) => i === 0 || l === lens[i - 1] + 1);
    const allSameChar  = printLiterals.every(s => new Set(s.split('')).size === 1);
    if (allIncrement && allSameChar) {
      return {
        hardcoded: true, confidence: 'high',
        reason: `Repeated print statements with lengths [${lens.join(', ')}] — pattern hardcoded line-by-line instead of using a loop`
      };
    }
  }

  // ── Check 3: hardcoded list whose size matches total expected output lines ──
  const totalExpectedLines = expectedOutputs.reduce((sum, e) => {
    return sum + (e ? e.trim().split('\n').length : 0);
  }, 0);

  if (totalExpectedLines >= 3) {
    const listMatch = stripped.match(/\[\s*(?:["'][*#@=+\-|^~.]{1,30}["']\s*,\s*){2,}["'][*#@=+\-|^~.]{1,30}["']\s*\]/);
    if (listMatch) {
      const itemCount = (listMatch[0].match(/["']/g) || []).length / 2;
      if (itemCount >= totalExpectedLines) {
        return {
          hardcoded: true, confidence: 'high',
          reason: `Hardcoded output list with ${Math.round(itemCount)} items matching expected output line count`
        };
      }
    }
  }

  // ── Check 4: symbol * LITERAL NUMBER (not symbol * variable) ──────────────
  // Bad:  "*" * 3   or  string(3, '*')
  // OK:   "*" * n   or  "*" * i   (variable — not flagged)
  const literalMultiplyMatches = [
    ...stripped.matchAll(/["'][*#@=+|^~.]{1,3}["']\s*\*\s*(\d+)/g),
    ...stripped.matchAll(/string\s*\(\s*(\d+)\s*,\s*['"][*#@=+|]['"]/, 'g'),
    ...stripped.matchAll(/std::string\s*\(\s*(\d+)\s*,\s*['"][*#@=+|]['"]/, 'g')
  ];
  const variableMultiplyMatches = [...stripped.matchAll(/["'][*#@=+|^~.]{1,3}["']\s*\*\s*([a-zA-Z_]\w*)/g)];

  if (literalMultiplyMatches.length > 0 && variableMultiplyMatches.length === 0) {
    const nums = literalMultiplyMatches.map(m => m[1]).join(', ');
    return {
      hardcoded: true, confidence: 'medium',
      reason: `Symbol multiplied by literal number(s) [${nums}] — use a variable (like n, i, row) instead`
    };
  }

  return NO;
}

/** Backward-compatible wrapper returning boolean */
function isHardcodedPattern(code, expectedOutputs, language) {
  return detectPatternHardcoding(code, expectedOutputs, language).hardcoded;
}

/**
 * Analyze source code for all tracked concepts
 */
function analyzeConcepts(sourceCode, language = 'python', expectedOutputs = [], isPatternQuestion = false) {
  return {
    loops:          hasLoops(sourceCode),
    doWhile:        hasDoWhile(sourceCode),
    switchStatement: hasSwitchStatement(sourceCode),
    nestedLoops:    hasNestedLoops(sourceCode),
    arrays:         hasArrays(sourceCode, language),
    arrays2d:       has2DArrays(sourceCode, language),
    arrays3d:       has3DArrays(sourceCode, language),
    pointers:       hasPointers(sourceCode, language),
    conditionals:   hasConditionals(sourceCode),
    recursion:      hasRecursion(sourceCode, language),
    hardcodedPattern: isPatternQuestion ? detectPatternHardcoding(sourceCode, expectedOutputs, language) : { hardcoded: false }
  };
}

/**
 * Check if student's code satisfies the teacher's required concepts
 * @param {object} detected - result of analyzeConcepts()
 * @param {string[]} requiredConcepts - e.g. ['loops', 'arrays_2d']
 * @param {number} threshold - 0-100, score must be >= threshold to pass
 */
function checkConceptCompliance(detected, requiredConcepts = [], threshold = 99) {
  if (!requiredConcepts || requiredConcepts.length === 0) {
    return { passed: true, score: 100, details: {}, message: null };
  }

  // Map concept keys to detected values
  const conceptMap = {
    loops:       detected.loops,
    do_while:    detected.doWhile,
    switch:      detected.switchStatement,
    nested_loops: detected.nestedLoops,
    arrays:      detected.arrays,
    arrays_2d:   detected.arrays2d,
    arrays_3d:   detected.arrays3d,
    pointers:    detected.pointers,
    conditionals: detected.conditionals,
    recursion:   detected.recursion
  };

  const details = {};
  let passedCount = 0;
  const failed = [];

  for (const concept of requiredConcepts) {
    const key = concept.toLowerCase().replace(/\s/g, '_');
    const satisfied = !!conceptMap[key];
    details[concept] = satisfied;
    if (satisfied) passedCount++;
    else failed.push(concept);
  }

  const score = Math.round((passedCount / requiredConcepts.length) * 100);
  const passed = score >= threshold;
  let message = null;
  if (!passed && failed.length > 0) {
    const labels = {
      loops: 'loops (for/while)',
      do_while: 'do-while loop',
      switch: 'switch/case statement',
      nested_loops: 'nested loops',
      arrays: '1D array',
      arrays_2d: '2D array/matrix',
      arrays_3d: '3D array',
      pointers: 'pointers',
      conditionals: 'if/else/switch',
      recursion: 'recursion'
    };
    const failedLabels = failed.map(f => labels[f.toLowerCase().replace(/\s/g, '_')] || f);
    message = `Required concept(s) not detected: ${failedLabels.join(', ')}`;
  }
  const hc = detected.hardcodedPattern;
  const isHardcoded = hc && (hc === true || hc.hardcoded);
  if (isHardcoded) {
    const hcReason = (hc && hc.reason) ? hc.reason : 'Pattern appears hardcoded — use loops to generate it dynamically';
    const hcConfidence = (hc && hc.confidence) ? hc.confidence : 'high';
    message = (message ? message + '. ' : '') + hcReason;
    return {
      passed: false, score: 0,
      details: { ...details, hardcoded_pattern: true },
      message,
      hardcoded: true,
      hardcodedReason: hcReason,
      hardcodedConfidence: hcConfidence
    };
  }

  return { passed, score, details, message };
}

module.exports = {
  analyzeConcepts,
  detectPatternHardcoding,
  checkConceptCompliance,
  isHardcodedPattern,
  CONCEPTS
};
