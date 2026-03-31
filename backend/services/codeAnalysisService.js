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

    const requiredLoop = options.required_loop === true;
    const requiredRecursion = options.required_recursion === true;
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

    return {
      checks,
      unmet_requirements: unmetRequirements,
      function_names: functionDefs.slice(0, 40),
      recursion_functions: recursionHits.slice(0, 40),
      clang_ast: {
        available: astRecursion.available,
        error: astRecursion.error || null
      },
      complexity: complexitySignal
    };
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
    const text = String(source || '');
    const tokenRe = /\bfor\b|\bwhile\b|\bdo\b|\{|\}|;/g;
    const stack = [];
    let loopCount = 0;
    let maxLoopDepth = 0;

    const currentLoopDepth = () =>
      stack.reduce((n, x) => (x === 'loop' || x === 'loopPending' ? n + 1 : n), 0);

    let match = tokenRe.exec(text);
    while (match) {
      const tok = match[0];
      if (tok === 'for' || tok === 'while' || tok === 'do') {
        loopCount += 1;
        // pending until we see '{' or a terminating ';' (single-statement loop)
        stack.push('loopPending');
        const depth = currentLoopDepth();
        if (depth > maxLoopDepth) maxLoopDepth = depth;
      } else if (tok === '{') {
        // If a loop was pending, treat this as loop body start.
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i] === 'loopPending') {
            stack[i] = 'loop';
            break;
          }
          if (stack[i] === '{') break;
        }
        stack.push('{');
      } else if (tok === ';') {
        // Single-statement loop without braces ends at ';' (very rough, but fixes common cases).
        if (stack.length && stack[stack.length - 1] === 'loopPending') {
          stack.pop();
        }
      } else if (tok === '}') {
        // Close a brace scope, then if it belonged to a loop body, pop that loop marker.
        while (stack.length) {
          const top = stack.pop();
          if (top === '{') break;
        }
        // Pop a loop marker if present right before this block.
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
    const candidates = ['clang++', 'clang'];
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
    const candidates = ['clang++', 'clang'];
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

module.exports = CodeAnalysisService;
