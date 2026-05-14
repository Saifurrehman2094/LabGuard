const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

class CodeAnalysisService {
  getCapabilities() {
    const clangProbe = this._probeClangBinary();
    return {
      recursion_ast_available: clangProbe.available,
      clang_binary: clangProbe.binary || null,
      clang_error: clangProbe.error || null
    };
  }

  analyzeCppSource(sourceText, options = {}) {
    const source = String(sourceText || '');
    const lower = source.toLowerCase();
    const loopMatches = source.match(/\b(for|while)\s*\(|\bdo\s*\{/g) || [];
    const loopMetrics = this._estimateLoopMetrics(source);
    const functionDefs = this._extractFunctionNames(source);
    const heuristicRecursionHits = functionDefs.filter((name) => {
      const re = new RegExp(`\\b${escapeRegex(name)}\\s*\\(`, 'g');
      const matches = source.match(re) || [];
      return matches.length >= 2;
    });
    const astRecursion = this._detectRecursionViaClangAst(source, options);
    const recursionHits =
      astRecursion.available && Array.isArray(astRecursion.recursive_functions)
        ? astRecursion.recursive_functions
        : heuristicRecursionHits;
    const largeIfElseChains = (source.match(/\bif\s*\(/g) || []).length >= 10;
    const manyNumericLiterals = (source.match(/\b\d+\b/g) || []).length >= 40;
    const stdMapInitLike = /\{\s*\{\s*[-\d]+/.test(source) || /\[\s*[-\d]+\s*\]\s*=/.test(source);

    const suspiciousPatterns = [];
    if (largeIfElseChains) suspiciousPatterns.push('large_if_else_chain');
    if (manyNumericLiterals) suspiciousPatterns.push('many_numeric_literals');
    if (stdMapInitLike) suspiciousPatterns.push('literal_mapping_pattern');

    const checks = {
      loop_detected: loopMatches.length > 0,
      loop_count: loopMetrics.loop_count,
      loop_nesting_max: loopMetrics.loop_nesting_max,
      recursion_detected: recursionHits.length > 0,
      suspicious_patterns: suspiciousPatterns,
      recursion_detection_source: astRecursion.available ? 'clang_ast' : 'heuristic'
    };

    const conceptChecks = {
      loops: checks.loop_detected,
      nested_loops: checks.loop_nesting_max >= 2,
      do_while: /\bdo\s*\{/.test(source) || /\bdo\s+[^\n;]*\bwhile\s*\(/.test(source),
      switch: /\bswitch\s*\(/.test(source),
      conditionals: /\bif\s*\(|\belse\b/.test(source),
      recursion: checks.recursion_detected,
      arrays: /\[[^\]]*\]/.test(source),
      arrays_2d: /\[[^\]]*\]\s*\[[^\]]*\]/.test(source) || /\bvector\s*<\s*vector\s*</i.test(source),
      arrays_3d:
        /\[[^\]]*\]\s*\[[^\]]*\]\s*\[[^\]]*\]/.test(source) ||
        /\bvector\s*<\s*vector\s*<\s*vector\s*</i.test(source),
      pointers: /(^|[^A-Za-z0-9_])\*+\s*[A-Za-z_]\w*|&\s*[A-Za-z_]\w*/.test(source) || /\bnullptr\b/.test(lower)
    };

    const requiredLoop = options.required_loop === true;
    const requiredRecursion = options.required_recursion === true;
    const requiredConcepts = Array.isArray(options.required_concepts)
      ? options.required_concepts.filter((item) => typeof item === 'string' && item.trim())
      : [];
    const maxLoopNesting =
      typeof options.max_loop_nesting === 'number' ? options.max_loop_nesting : null;
    const expectedComplexity =
      typeof options.expected_complexity === 'string' ? options.expected_complexity : null;
    const complexitySignal = this._estimateComplexitySignal({
      loop_nesting_max: loopMetrics.loop_nesting_max,
      recursion_detected: recursionHits.length > 0,
      expected_complexity: expectedComplexity
    });
    const unmetRequirements = [];
    if (requiredLoop && !checks.loop_detected) unmetRequirements.push('loop_required_but_missing');
    if (requiredRecursion && !checks.recursion_detected) unmetRequirements.push('recursion_required_but_missing');
    if (maxLoopNesting != null && maxLoopNesting > 0 && checks.loop_nesting_max > maxLoopNesting) {
      unmetRequirements.push('loop_nesting_exceeds_limit');
    }
    const detectedConcepts = Object.entries(conceptChecks)
      .filter(([, detected]) => !!detected)
      .map(([concept]) => concept);
    const missingRequiredConcepts = requiredConcepts.filter((concept) => !conceptChecks[concept]);
    const detectedRequiredCount = requiredConcepts.length - missingRequiredConcepts.length;
    const coveragePct = requiredConcepts.length
      ? Math.round((detectedRequiredCount * 10000) / requiredConcepts.length) / 100
      : 100;

    for (const concept of missingRequiredConcepts) {
      unmetRequirements.push(`concept_required_but_missing:${concept}`);
    }

    const restrictedReport = this._analyzeRestrictedCppLibraries(source, options);
    if (restrictedReport && Array.isArray(restrictedReport.used_restrictions)) {
      for (const libId of restrictedReport.used_restrictions) {
        unmetRequirements.push(`restricted_library_used:${libId}`);
      }
    }

    return {
      checks,
      concept_checks: conceptChecks,
      detected_concepts: detectedConcepts,
      required_concepts: requiredConcepts,
      missing_required_concepts: missingRequiredConcepts,
      concept_coverage: {
        detected_count: detectedRequiredCount,
        required_count: requiredConcepts.length,
        coverage_pct: coveragePct,
        pass: missingRequiredConcepts.length === 0
      },
      unmet_requirements: unmetRequirements,
      function_names: functionDefs.slice(0, 40),
      recursion_functions: recursionHits.slice(0, 40),
      clang_ast: {
        available: astRecursion.available,
        error: astRecursion.error || null
      },
      complexity: complexitySignal,
      restricted_libraries: restrictedReport
    };
  }

  /**
   * Teacher-configured list of STL / headers / symbols students must not use.
   * Heuristic scan (not a full C++ parser); intended as a grading signal.
   */
  _analyzeRestrictedCppLibraries(sourceText, options) {
    const configured = normalizeRestrictedCppIds(options && options.restricted_cpp_libraries);
    if (!configured.length) return null;

    const sourceClean = this._stripCppCommentsForScan(String(sourceText || ''));
    const bitsPresent = /#\s*include\s*[<"]\s*bits\/stdc\+\+\.h\s*[>"]/i.test(sourceClean);

    const items = configured.map((id) => {
      const signals = this._collectRestrictedLibrarySignals(sourceClean, id, bitsPresent);
      return { id, used: signals.length > 0, signals };
    });

    return {
      configured,
      bits_stdcpp_h_present: bitsPresent,
      items,
      used_restrictions: items.filter((x) => x.used).map((x) => x.id),
      compliant: !items.some((x) => x.used)
    };
  }

  _collectRestrictedLibrarySignals(sourceClean, token, bitsPresent) {
    if (bitsPresent) {
      return [
        'Included <bits/stdc++.h> (treated as bringing in the entire standard library for restriction purposes).'
      ];
    }
    const id = String(token || '').toLowerCase();
    const patterns = restrictedLibraryPatternCatalog(id);
    const seen = new Set();
    const signals = [];
    for (const entry of patterns) {
      if (!entry || !entry.re) continue;
      if (entry.re.test(sourceClean)) {
        const label = entry.label || entry.re.source;
        if (!seen.has(label)) {
          seen.add(label);
          signals.push(label);
        }
      }
    }
    return signals.slice(0, 8);
  }

  _stripCppCommentsForScan(source) {
    const s = String(source || '');
    let out = '';
    for (let i = 0; i < s.length; ) {
      const c = s[i];
      const n = s[i + 1];
      if (c === '/' && n === '/') {
        i += 2;
        while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i += 1;
        out += ' ';
        continue;
      }
      if (c === '/' && n === '*') {
        i += 2;
        while (i < s.length - 1 && !(s[i] === '*' && s[i + 1] === '/')) i += 1;
        i = Math.min(s.length, i + 2);
        out += ' ';
        continue;
      }
      if (c === '"' || c === "'") {
        const quote = c;
        i += 1;
        while (i < s.length) {
          if (s[i] === '\\') {
            i += 2;
            continue;
          }
          if (s[i] === quote) {
            i += 1;
            break;
          }
          i += 1;
        }
        out += ' ';
        continue;
      }
      out += c;
      i += 1;
    }
    return out;
  }

  _estimateComplexitySignal(params) {
    const expected = params.expected_complexity || null;
    // Heuristic estimate only: primarily based on maximum loop nesting depth.
    const nesting = typeof params.loop_nesting_max === 'number' ? params.loop_nesting_max : 0;
    let estimated = 'unspecified';
    if (nesting <= 0) estimated = 'O(1)';
    else if (nesting === 1) estimated = 'O(n)';
    else if (nesting === 2) estimated = 'O(n^2)';
    else estimated = 'O(n^3+)';

    const order = (c) => {
      switch (c) {
        case 'O(1)':
          return 1;
        case 'O(log n)':
          return 2;
        case 'O(n)':
          return 3;
        case 'O(n log n)':
          return 4;
        case 'O(n^2)':
          return 5;
        case 'O(n^3+)':
          return 6;
        default:
          return null;
      }
    };

    const expOrder = order(expected);
    const estOrder = order(estimated);

    const met =
      expOrder == null || estOrder == null ? null : estOrder <= expOrder;

    return {
      expected,
      estimated,
      met,
      method: 'heuristic_loop_nesting',
      note:
        'Complexity check is heuristic (loop nesting) and intended as a teacher signal, not a formal proof.'
    };
  }

  _estimateLoopMetrics(source) {
    // Heuristic: estimate maximum *loop* nesting (ignore general braces like function bodies).
    // Not a formal parser; intended as a teacher signal.
    //
    // Important: do NOT treat `;` inside a for-header (e.g. for (int i=0; i<n; i++)) as the end
    // of a braceless loop — that was incorrectly popping loopPending and killed nested-loop depth.
    const text = String(source || '');
    const tokenRe = /\bfor\b|\bwhile\b|\bdo\b|\(|\)|\{|\}|;/g;
    const stack = [];
    let loopCount = 0;
    let maxLoopDepth = 0;

    const currentLoopDepth = () =>
      stack.reduce(
        (n, x) =>
          x === 'loop' || x === 'loopPendingDo' || (x && x.kind === 'loopPendingFw') ? n + 1 : n,
        0
      );

    let match = tokenRe.exec(text);
    while (match) {
      const tok = match[0];
      if (tok === 'for' || tok === 'while') {
        loopCount += 1;
        stack.push({ kind: 'loopPendingFw', headerParenDepth: 0 });
        const depth = currentLoopDepth();
        if (depth > maxLoopDepth) maxLoopDepth = depth;
      } else if (tok === 'do') {
        loopCount += 1;
        stack.push('loopPendingDo');
        const depth = currentLoopDepth();
        if (depth > maxLoopDepth) maxLoopDepth = depth;
      } else if (tok === '(') {
        const top = stack[stack.length - 1];
        if (top && top.kind === 'loopPendingFw') {
          top.headerParenDepth += 1;
        }
      } else if (tok === ')') {
        const top = stack[stack.length - 1];
        if (top && top.kind === 'loopPendingFw' && top.headerParenDepth > 0) {
          top.headerParenDepth -= 1;
        }
      } else if (tok === '{') {
        for (let i = stack.length - 1; i >= 0; i--) {
          const frame = stack[i];
          if (frame === 'loopPendingDo') {
            stack[i] = 'loop';
            break;
          }
          if (frame && frame.kind === 'loopPendingFw') {
            stack[i] = 'loop';
            break;
          }
          if (frame === '{') break;
        }
        stack.push('{');
      } else if (tok === ';') {
        const top = stack[stack.length - 1];
        if (top && top.kind === 'loopPendingFw' && top.headerParenDepth > 0) {
          // Still inside for/while ( ... ) header — semicolon is a clause separator, not loop end.
        } else if (top === 'loopPendingDo') {
          stack.pop();
        } else if (top && top.kind === 'loopPendingFw') {
          // Header finished (depth 0): for (...); or while (...);
          stack.pop();
        }
      } else if (tok === '}') {
        while (stack.length) {
          const top = stack.pop();
          if (top === '{') break;
        }
        if (stack.length && stack[stack.length - 1] === 'loop') {
          stack.pop();
        }
      }
      match = tokenRe.exec(text);
    }

    return { loop_count: loopCount, loop_nesting_max: maxLoopDepth };
  }

  _detectRecursionViaClangAst(source, options = {}) {
    const enabled = options.enable_clang_ast !== false;
    if (!enabled) {
      return { available: false, recursive_functions: [], error: 'disabled' };
    }
    const candidates = this._getClangCandidates();
    let tmpFile = null;
    for (const bin of candidates) {
      try {
        tmpFile = path.join(
          os.tmpdir(),
          `labguard-recursion-${Date.now()}-${Math.random().toString(16).slice(2)}.cpp`
        );
        fs.writeFileSync(tmpFile, source, 'utf8');
        const out = execFileSync(
          bin,
          ['-std=c++17', '-Xclang', '-ast-dump=json', '-fsyntax-only', tmpFile],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 3000 }
        );
        const ast = JSON.parse(out);
        const recursiveFunctions = this._extractRecursiveFunctionsFromAst(ast);
        return {
          available: true,
          recursive_functions: Array.from(recursiveFunctions)
        };
      } catch (error) {
        // Try next candidate
      } finally {
        if (tmpFile) {
          try {
            fs.unlinkSync(tmpFile);
          } catch (error) {
            // ignore
          }
        }
      }
    }
    return {
      available: false,
      recursive_functions: [],
      error: 'clang_not_available_or_ast_parse_failed'
    };
  }

  _probeClangBinary() {
    const candidates = this._getClangCandidates();
    for (const bin of candidates) {
      try {
        execFileSync(bin, ['--version'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 1500
        });
        return { available: true, binary: bin };
      } catch (error) {
        // try next
      }
    }
    return { available: false, error: 'clang_not_found' };
  }

  _getClangCandidates() {
    const candidates = ['clang++', 'clang'];
    if (os.platform() === 'win32') {
      const pf = process.env.ProgramFiles || 'C:\\Program Files';
      const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
      const local = process.env.LOCALAPPDATA || '';
      const windowsCandidates = [
        path.join(pf, 'LLVM', 'bin', 'clang++.exe'),
        path.join(pf, 'LLVM', 'bin', 'clang.exe'),
        path.join(pf86, 'LLVM', 'bin', 'clang++.exe'),
        path.join(pf86, 'LLVM', 'bin', 'clang.exe'),
        local ? path.join(local, 'Programs', 'LLVM', 'bin', 'clang++.exe') : null,
        local ? path.join(local, 'Programs', 'LLVM', 'bin', 'clang.exe') : null
      ].filter(Boolean);
      for (const c of windowsCandidates) {
        try {
          if (fs.existsSync(c)) candidates.push(c);
        } catch (_) {
          // ignore fs probe failures
        }
      }
    }
    return Array.from(new Set(candidates));
  }

  _extractRecursiveFunctionsFromAst(astRoot) {
    const recursive = new Set();

    const walk = (node, currentFunctionName = null) => {
      if (!node || typeof node !== 'object') return;
      const kind = node.kind || '';
      let fnName = currentFunctionName;
      if (kind === 'FunctionDecl' && typeof node.name === 'string') {
        fnName = node.name;
      }
      if (kind === 'CallExpr' && fnName) {
        const calledName = this._findCalledName(node);
        if (calledName && calledName === fnName) {
          recursive.add(fnName);
        }
      }
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (Array.isArray(value)) {
          for (const child of value) walk(child, fnName);
        } else if (value && typeof value === 'object') {
          walk(value, fnName);
        }
      }
    };

    walk(astRoot, null);
    return recursive;
  }

  _findCalledName(callExprNode) {
    let called = null;
    const walk = (node) => {
      if (!node || typeof node !== 'object' || called) return;
      if (node.kind === 'DeclRefExpr' && node.referencedDecl && typeof node.referencedDecl.name === 'string') {
        called = node.referencedDecl.name;
        return;
      }
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (Array.isArray(value)) {
          for (const child of value) walk(child);
        } else if (value && typeof value === 'object') {
          walk(value);
        }
      }
    };
    walk(callExprNode);
    return called;
  }

  _extractFunctionNames(source) {
    const names = new Set();
    const re = /(?:^|\n)\s*(?:[\w:<>,~*&\s]+)\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\{/g;
    let match = re.exec(source);
    while (match) {
      const name = match[1];
      if (name && !['if', 'for', 'while', 'switch', 'catch'].includes(name)) {
        names.add(name);
      }
      match = re.exec(source);
    }
    return Array.from(names);
  }
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRestrictedCppIds(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || '').trim().toLowerCase())
        .filter((item) => item.length > 0 && item.length <= 64)
    )
  );
}

/**
 * @param {string} id normalized token
 * @returns {{re: RegExp, label: string}[]}
 */
function restrictedLibraryPatternCatalog(id) {
  const inc = (name) => ({
    re: new RegExp(`#\\s*include\\s*[<"]\\s*${escapeRegex(name)}\\s*[>"]`, 'i'),
    label: `#include <${name}>`
  });

  const stdsym = (sym, label) => ({
    re: new RegExp(`\\bstd\\s*::\\s*${escapeRegex(sym)}\\b`, 'i'),
    label: label || `std::${sym}`
  });

  const catalog = {
    vector: [inc('vector'), stdsym('vector'), { re: /\bvector\s*</i, label: 'vector<…>' }],
    map: [
      inc('map'),
      stdsym('map'),
      stdsym('multimap'),
      { re: /\bmap\s*</i, label: 'map<…>' },
      { re: /\bmultimap\s*</i, label: 'multimap<…>' }
    ],
    unordered_map: [inc('unordered_map'), stdsym('unordered_map'), { re: /\bunordered_map\s*</i, label: 'unordered_map<…>' }],
    set: [inc('set'), stdsym('set'), stdsym('multiset'), { re: /\b(?:multi)?set\s*</i, label: 'set / multiset <…>' }],
    unordered_set: [inc('unordered_set'), stdsym('unordered_set'), { re: /\bunordered_set\s*</i, label: 'unordered_set<…>' }],
    deque: [inc('deque'), stdsym('deque'), { re: /\bdeque\s*</i, label: 'deque<…>' }],
    list: [inc('list'), stdsym('list'), { re: /\blist\s*</i, label: 'list<…>' }],
    queue: [inc('queue'), stdsym('queue'), stdsym('priority_queue'), { re: /\bqueue\s*</i, label: 'queue<…>' }],
    stack: [inc('stack'), stdsym('stack'), { re: /\bstack\s*</i, label: 'stack<…>' }],
    string: [inc('string'), stdsym('string'), { re: /\bstring\s*</i, label: 'string (template)' }],
    algorithm: [
      inc('algorithm'),
      stdsym('sort'),
      stdsym('stable_sort'),
      stdsym('binary_search'),
      stdsym('lower_bound'),
      stdsym('upper_bound'),
      stdsym('min_element'),
      stdsym('max_element'),
      stdsym('find'),
      stdsym('reverse'),
      stdsym('unique'),
      stdsym('count'),
      stdsym('accumulate'),
      { re: /\bsort\s*\(/i, label: 'sort(…)' }
    ],
    numeric: [inc('numeric'), stdsym('accumulate'), stdsym('inner_product'), stdsym('partial_sum')],
    cmath: [inc('cmath'), inc('math.h'), stdsym('sqrt'), stdsym('pow'), stdsym('sin'), stdsym('cos'), stdsym('abs')],
    cstring: [
      inc('cstring'),
      inc('string.h'),
      { re: /\bmemcpy\s*\(/i, label: 'memcpy(…)' },
      { re: /\bmemset\s*\(/i, label: 'memset(…)' },
      { re: /\bstrlen\s*\(/i, label: 'strlen(…)' }
    ],
    cstdio: [
      inc('cstdio'),
      inc('stdio.h'),
      { re: /\b(std\s*::\s*)?(printf|scanf|fprintf|sscanf|fscanf|sprintf)\s*\(/i, label: 'printf / scanf family' }
    ],
    iostream: [
      inc('iostream'),
      stdsym('cin'),
      stdsym('cout'),
      stdsym('cerr'),
      stdsym('clog'),
      stdsym('endl'),
      { re: /\bcin\s*>>/i, label: 'cin >>' },
      { re: /\bcout\s*<</i, label: 'cout <<' }
    ],
    sstream: [inc('sstream'), stdsym('stringstream'), stdsym('istringstream'), stdsym('ostringstream')],
    fstream: [inc('fstream'), stdsym('ifstream'), stdsym('ofstream'), stdsym('fstream')],
    functional: [inc('functional'), stdsym('function'), stdsym('bind'), stdsym('less'), stdsym('greater')],
    utility: [inc('utility'), stdsym('pair'), stdsym('make_pair')],
    memory: [inc('memory'), stdsym('unique_ptr'), stdsym('shared_ptr'), stdsym('make_unique'), stdsym('make_shared')],
    iterator: [inc('iterator'), stdsym('back_inserter'), stdsym('istream_iterator'), stdsym('ostream_iterator')],
    bitset: [inc('bitset'), stdsym('bitset'), { re: /\bbitset\s*</i, label: 'bitset<…>' }],
    regex: [inc('regex'), stdsym('regex'), stdsym('smatch'), stdsym('regex_search')]
  };

  if (catalog[id]) return catalog[id];

  if (id.includes('/') || id.includes('.')) {
    return [
      {
        re: new RegExp(`#\\s*include\\s*[<"]\\s*${escapeRegex(id)}\\s*[>"]`, 'i'),
        label: `#include <${id}>`
      }
    ];
  }

  const safe = id.replace(/[^a-z0-9._+-]/gi, '');
  if (!safe || safe !== id) {
    return [];
  }
  const out = [inc(safe), stdsym(safe)];
  if (/^[a-z_]\w*$/i.test(id)) {
    out.push({ re: new RegExp(`\\b${escapeRegex(id)}\\s*<`, 'i'), label: `${id}<…>` });
    out.push({ re: new RegExp(`\\b${escapeRegex(id)}\\s*\\(`, 'i'), label: `${id}(…)` });
  }
  return out;
}

module.exports = CodeAnalysisService;
