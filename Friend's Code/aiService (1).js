/**
 * AI Service - Question extraction & test case generation
 * Uses Groq (free) - fallback to Gemini if configured
 * Test cases: AI generates reference solution + inputs; we run solution via Judge0 for correct expectedOutput.
 */

const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const codeExecutionService = require('./codeExecutionService');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let groqClient = null;
let geminiModel = null;
if (GROQ_API_KEY) {
  groqClient = new Groq({ apiKey: GROQ_API_KEY });
}
if (GEMINI_API_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  } catch (e) {
    console.warn('Gemini init failed:', e.message);
  }
}

/**
 * Call AI - tries Groq first, falls back to Gemini on failure
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} opts - { temperature, maxTokens }
 * @returns {Promise<string>} Raw response text
 */
async function callAI(systemPrompt, userPrompt, opts = {}) {
  const { temperature = 0.1, maxTokens = 4096 } = opts;

  if (groqClient) {
    // Retry up to 3 times on 429 rate limit, waiting the time Groq tells us
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const chat = await groqClient.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          temperature,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        });
        return (chat.choices[0].message.content || '').trim();
      } catch (err) {
        const is429 = err.message && (err.message.includes('429') || err.message.includes('rate_limit_exceeded'));
        if (is429 && attempt < 2) {
          // Parse "Please try again in Xs" from error message
          const waitMatch = err.message.match(/try again in ([\d.]+)s/i);
          const waitMs = waitMatch ? Math.ceil(parseFloat(waitMatch[1]) * 1000) + 500 : 12000;
          console.log(`Groq rate limit hit, waiting ${Math.round(waitMs / 1000)}s before retry (attempt ${attempt + 1}/3)...`);
          await new Promise(res => setTimeout(res, waitMs));
          continue;
        }
        console.warn('Groq call failed:', err.message);
        if (geminiModel) console.log('Falling back to Gemini...');
        break;
      }
    }
  }

  if (geminiModel) {
    try {
      const combined = `${systemPrompt}\n\n---\n\n${userPrompt}`;
      const result = await geminiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: combined }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens
        }
      });
      const response = result.response;
      if (response && response.text) {
        return response.text().trim();
      }
    } catch (err) {
      console.error('Gemini call failed:', err.message);
      throw new Error('AI failed: ' + (err.message || 'Unknown error'));
    }
  }

  throw new Error('No AI configured. Add GROQ_API_KEY or GEMINI_API_KEY to .env');
}

/**
 * Robust JSON parse - handles common AI output issues (trailing commas, markdown, etc.)
 */
function safeParseJSON(raw, fallback = null) {
  if (!raw || typeof raw !== 'string') return fallback;
  let s = raw.replace(/```json\s*|\s*```/g, '').trim();
  // Extract JSON object/array (handle "Here is the JSON: {...}" or similar)
  const startObj = s.indexOf('{');
  const startArr = s.indexOf('[');
  let start = -1;
  let endChar = '';
  if (startArr >= 0 && (startObj < 0 || startArr < startObj)) {
    start = startArr;
    endChar = ']';
  } else if (startObj >= 0) {
    start = startObj;
    endChar = '}';
  }
  if (start >= 0) {
    const end = s.lastIndexOf(endChar);
    if (end > start) s = s.slice(start, end + 1);
  }
  // Remove control chars that break JSON
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  // Fix trailing commas before } or ]
  s = s.replace(/,(\s*[}\]])/g, '$1');
  // Fix unterminated strings: "input": "()[]  ,  -> "input": "()[]" ,
  // AI often forgets to close the string when input contains brackets like ()[]{}
  // Only match when there's NO " before the , or } (greedy [^"]* eats until " in valid case)
  s = s.replace(/("input"\s*:\s*")([^"]*)(\s*[,}\])])/g, (_, lead, val, trail) => {
    if (val.length > 0 && trail.match(/^\s*[,}\])]/)) return lead + val + '"' + trail;
    return lead + val + trail;
  });
  try {
    return JSON.parse(s);
  } catch (e1) {
    // Retry: repair truncated "input" strings (common when input has brackets)
    if (e1.message && e1.message.includes('Unterminated')) {
      const repaired = s.replace(/("input"\s*:\s*")([^"]*?)(\s*[,}\])])/g, '$1$2"$3');
      try {
        return JSON.parse(repaired);
      } catch (e2) {
        console.warn('JSON parse failed:', e1.message, 'Raw snippet:', s.slice(0, 200));
        return fallback;
      }
    }
    console.warn('JSON parse failed:', e1.message, 'Raw snippet:', s.slice(0, 200));
    return fallback;
  }
}

/**
 * Extract ONE question at a given index (0-based). Used for incremental extraction - get Q1, process, then Q2, etc.
 * @param {string} rawText - Full exam text
 * @param {number} index - 0 = first question, 1 = second, etc.
 * @returns {Promise<{id: number, text: string}|null>} Single question or null if none
 */
async function extractQuestionAtIndex(rawText, index) {
  if (!rawText || rawText.trim().length < 10) return null;
  const text = rawText.slice(0, 12000);
  const n = index + 1;
  try {
    const raw = await callAI(
      'You are an exam parser. Extract ONE programming question. Respond with ONLY valid JSON - no markdown. Escape quotes (use \\").',
      `Extract ONLY the ${n === 1 ? 'first' : `${n}th`} programming question from this exam text.

RULES:
1. ${n === 1 ? 'Get the FIRST question only.' : `We already have the first ${n - 1} question(s). Extract the NEXT one (question ${n}).`}
2. SCENARIO-BASED = ONE QUESTION: If a scenario has sub-parts (a)(b)(c), keep as one. Do NOT split.
3. PRESERVE EXACT TEXT - copy exactly, no summarization.
4. If there is no ${n}th question, return {"id":${n},"text":""}.

Return JSON: {"id":${n},"text":"full question text"} or {"id":${n},"text":""} if none.

EXAM TEXT:
${text}`,
      { temperature: 0.05, maxTokens: 8192 }
    );
    const parsed = safeParseJSON(raw || '{}', null);
    if (!parsed || typeof parsed !== 'object') return null;
    const txt = String(parsed.text || '').trim();
    if (!txt) return null;
    return { id: parseInt(parsed.id, 10) || n, text: txt };
  } catch (err) {
    console.warn('extractQuestionAtIndex error:', err.message);
    return null;
  }
}

/**
 * Extract programming questions from exam text (PDF or pasted)
 * IMPORTANT: Scenario-based questions with sub-parts (a), (b), (c), etc. are ONE question - keep full text.
 * @param {string} rawText - Text extracted from PDF or pasted by teacher
 * @returns {Promise<Array<{id: number, text: string}>>}
 */
async function extractQuestionsFromText(rawText) {
  if (!rawText || rawText.trim().length < 10) {
    return [];
  }

  const text = rawText.slice(0, 12000); // Allow longer for scenario-based questions

  try {
    const raw = await callAI(
      'You are an exam parser. Extract programming questions. Respond with ONLY a valid JSON array - no markdown, no code blocks. Escape quotes in strings (use \\"). No trailing commas.',
      `Extract programming questions from this exam text.

CRITICAL RULES:
1. SCENARIO-BASED = ONE QUESTION: If the document describes a single scenario (e.g. "Smart City Parking", "Billing System") with sub-parts (a), (b), (c), (d), (e) - treat it as ONE question. Return the COMPLETE text as a single "text" field. Do NOT split (a), (b), (c) into separate questions.
2. PRESERVE EXACT TEXT: Copy the question text exactly as it appears - do not summarize, paraphrase, or truncate. Include the full scenario, rules, constraints, and all sub-parts.
3. SPLIT ONLY when there are clearly multiple INDEPENDENT questions (e.g. "Question 1: Write a program to X" and "Question 2: Write a program to Y" as separate problems with different requirements).
4. If unsure, prefer ONE question with full text over splitting.
5. Extract at most 15 questions. If the document has more, return only the first 15.

Return ONLY a JSON array: [{"id": 1, "text": "Full question text exactly as in document"}, ...]
Each object must have "id" (number) and "text" (string). For a single scenario, return [{"id": 1, "text": "<entire document text>"}].

EXAM TEXT:
${text}`,
      { temperature: 0.05, maxTokens: 8192 }
    );
    const parsed = safeParseJSON(raw || '[]', []);
    const arr = Array.isArray(parsed) ? parsed : [];
    return arr.slice(0, 15); // Cap at 15 questions per exam
  } catch (err) {
    console.error('AI extractQuestions error:', err);
    throw new Error('AI extraction failed: ' + (err.message || 'Unknown error'));
  }
}

const LANGUAGE_HINTS = {
  python: 'Python: use input() or sys.stdin, print() for output',
  cpp: 'C++: use cin/cout or getline, include <iostream>',
  c: 'C: use scanf/printf or fgets',
  java: 'Java: use Scanner and System.out, wrap in a class with main',
  javascript: 'JavaScript: use readline or process.stdin for Node.js'
};

/** Problem type hints - precise I/O format guide per type */
const PROBLEM_TYPE_HINTS = {
  basic_programming: `- BASIC PROGRAMMING: simple I/O, space-separated numbers or single values.
   - Input: single integer, a string, or "n" then space-separated values. Keep it simple.`,

  loops: `- LOOPS PROBLEM: solution MUST use for/while/do-while loop(s). No recursion for main logic.
   - for: known number of iterations (e.g. print 1..n, sum first n).
   - while: condition-controlled (e.g. keep halving until <1).
   - do-while: executes at least once (C/C++ only: do { ... } while(cond);).
   - Input: single integer "n". Output: accumulated result or printed sequence.
   - Example inputs: "5", "10", "1", "0"
   - NEVER replace the loop with recursion or built-in sum()/range() in a single expression.`,

  conditionals: `- CONDITIONALS PROBLEM: solution uses if/else/elif or switch/case.
   - switch (C/C++/Java): integer or char input, map to labelled output.
   - if/else chains: range checks, comparisons, multi-way branching.
   - Input: single value (integer, float, or char). Output: a message or computed value.
   - Example inputs: "85", "3", "A", "7"
   - Typical problems: grade (A/B/C/F), day name from number, season from month, calculator op.`,

  recursion: `- RECURSION PROBLEM: function MUST call itself. No iterative loops for the main logic.
   - Always include a clear base case. Input: one or two integers.
   - Typical: factorial(n), fibonacci(n), power(base, exp), GCD(a,b), sum of digits, count digits, reverse string.
   - Input format: "5" or "2 10". Keep n ≤ 20 to avoid stack overflow in test cases.`,

  arrays_1d: `- 1D ARRAY PROBLEM: solution reads and processes a single linear array.
   - Input format (preferred): line 1 = "n" (size), line 2 = "e1 e2 ... en" space-separated.
   - OR single line: "3 1 4 1 5" (no n given) — use split() or cin in a loop.
   - Output: single result (max, min, sum, count, index) or transformed array printed space-separated.
   - Typical: max element, sum, reverse, linear search, count occurrences, sort.
   - Test inputs must include: small array (n=3-5), edge (n=1), larger (n=7-10).`,

  arrays_2d: `- 2D ARRAY / MATRIX PROBLEM: solution uses a 2D grid/matrix.
   - Input: line 1 = "rows cols", then each row on its own line as space-separated integers.
   - Example 3x3 input: "3 3\\n1 2 3\\n4 5 6\\n7 8 9"
   - Output format depends on the problem:
       * Row sums THEN column sums: print n values (one per line) then m values (one per line).
         Example 3x3 → "6\\n15\\n24\\n12\\n15\\n18"  (3 row sums + 3 col sums = 6 lines total)
       * Transpose: print m rows of n values each, space-separated.
       * Single scalar (total sum, trace, max): one number.
       * Row-by-row output: each row on its own line, values space-separated.
   - CRITICAL: If the problem asks for row sums AND column sums separately, output them on
     SEPARATE lines — never combine on one line. Row sums come first (n lines), then
     column sums (m lines). Total output lines = n + m.
   - Typical problems: row/column totals, transpose, diagonal sum, matrix max/min, search.
   - Keep matrices small: 2x2 to 4x4 for test cases.`,

  arrays_3d: `- 3D ARRAY PROBLEM: solution uses a 3-dimensional array.
   - Input: line 1 = "x y z" (layers rows cols), then all elements layer→row→col, each row on its own line.
   - Example 2x2x2: "2 2 2\\n1 2\\n3 4\\n5 6\\n7 8"
   - Output: sum of all elements, or value at specific index.
   - Keep dimensions at 2x2x2 or 2x2x3 maximum for test cases.`,

  pointers: `- POINTERS PROBLEM (C/C++ ONLY): solution MUST use pointer variables (* and/or &).
   - No Python/Java — this type is C/C++ only.
   - Typical: swap two numbers via pointers, sum array via pointer arithmetic, pass array to function.
   - Input: same format as the underlying data — integers or space-separated numbers.
   - Example inputs: "5 3", "5\\n1 2 3 4 5"
   - MUST declare at least one pointer: int *p = &x; or pass as *arr.`,

  patterns: `- PATTERN PROBLEM: output is a visual shape made of characters (*, digits, letters).
   - Input: single integer "n" (height or size of pattern). Output: the pattern.
   - Solution MUST use nested loops to generate the pattern dynamically.
   - NEVER hardcode the pattern as a string literal or print it in one statement.
   - Typical: right triangle, inverted triangle, pyramid, diamond, hollow square, number triangle.
   - Example inputs: "3", "5", "4", "6", "1"`,

  algorithm: `- ALGORITHM: use space-separated numbers for array input, e.g. "0 1 0 2 1" NOT "[0,1,0,2]".
   - Solutions use input().split() or cin >> in a loop.`,

  data_structure: `- DATA STRUCTURE (BST, linked list, graph, heap, stack, queue):
   - Array/List: "n" then "e1 e2 e3..." space-separated.
   - Graph: "n m" then "u v" per edge line.
   - 2D grid: "rows cols" then grid rows.
   - Operations: "n" then one operation per line.`,

  oop: `- OOP: main() reads stdin operation lines. Format: "OPERATION arg1 arg2..." one per line.
   - Each test case = different operation sequence. expectedOutput = full program output for that sequence.`
};

/**
 * Extract all JSON arrays from text - returns first array that looks like test inputs
 */
function extractJsonArray(text) {
  if (!text) return [];
  const results = [];
  let pos = 0;
  while (pos < text.length) {
    const start = text.indexOf('[', pos);
    if (start < 0) break;
    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (escape) { escape = false; continue; }
      if (c === '\\' && inString) { escape = true; continue; }
      if ((c === '"' || c === "'") && !inString) { inString = c; continue; }
      if (c === inString) { inString = false; continue; }
      if (inString) continue;
      if (c === '[') depth++;
      if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) { pos = start + 1; continue; }
    const arrStr = text.slice(start, end + 1);
    const parsed = safeParseJSON(arrStr, null);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];
      if (first && typeof first === 'object' && (first.input !== undefined || first.stdin !== undefined || first.value !== undefined)) {
        return parsed; // Found test inputs array
      }
    }
    pos = end + 1;
  }
  return [];
}

// Patterns that indicate code (broad coverage for all languages)
const CODE_PATTERNS = /(?:def |class |import |from |print\s*\(|input\s*\(|cout|cin|scanf|printf|System\.|Scanner|readline|process\.stdin|#include|using |int main|public static|function |const |let |var |=>|std::)/;

/**
 * Parse AI response - multiple strategies to avoid JSON/code escaping issues
 * @param {string} raw - AI response
 * @param {string} questionText - Original problem (for extracting example inputs)
 */
function parseSolutionAndInputs(raw, questionText = '') {
  let solution = '';
  let inputs = [];

  try {
    if (!raw || typeof raw !== 'string') return { solution: '', inputs: [] };
    raw = raw.trim();

    // 1. Extract code from markdown code block
    const codeBlocks = raw.matchAll(/```(?:\w+)?\s*([\s\S]*?)```/g);
    for (const m of codeBlocks) {
      const candidate = m[1].trim();
      if (candidate.length > 8 && (CODE_PATTERNS.test(candidate) || candidate.includes('(') && candidate.includes(')'))) {
        solution = candidate;
        break;
      }
    }
    if (!solution && raw.includes('```')) {
      const first = raw.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      if (first && first[1].trim().length > 5) solution = first[1].trim();
    }

    // 2. Extract test inputs - try multiple strategies
    // 2a. TEST_INPUTS: followed by JSON array (bracket-aware: input values may contain ])
    const testInputsIdx = raw.search(/TEST_INPUTS:\s*\[/i);
    if (testInputsIdx >= 0) {
      const start = raw.indexOf('[', testInputsIdx);
      let depth = 0;
      let inString = false;
      let strChar = '';
      let escape = false;
      let end = -1;
      for (let i = start; i < raw.length; i++) {
        const c = raw[i];
        if (escape) { escape = false; continue; }
        if ((c === '"' || c === "'") && !inString) { inString = true; strChar = c; continue; }
        if (c === strChar && inString) { inString = false; continue; }
        if (c === '\\' && inString) { escape = true; continue; }
        if (inString) continue;
        if (c === '[') depth++;
        if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end > start) {
        const arrStr = raw.slice(start, end + 1);
        const parsed = safeParseJSON(arrStr, []);
        if (Array.isArray(parsed) && parsed.length > 0) {
          inputs = parsed.map(t => ({
            input: String(t.input ?? t.stdin ?? t.value ?? '').trim(),
            expectedOutput: String(t.expectedOutput ?? t.expected_output ?? t.output ?? '').trim(),
            description: String(t.description ?? t.desc ?? t.label ?? '').trim()
          }));
        }
      }
    }

    // 2b. Find JSON array with "input" key (any array in response)
    if (inputs.length === 0) {
      const extracted = extractJsonArray(raw);
      if (extracted.length > 0) {
        inputs = extracted.map(t => ({
          input: String(t.input ?? t.stdin ?? t.value ?? '').trim(),
          expectedOutput: String(t.expectedOutput ?? t.expected_output ?? t.output ?? '').trim(),
          description: String(t.description ?? t.desc ?? t.label ?? '').trim()
        }));
      }
    }

    // 2c. Fallback: extract "input" values with regex (handles broken JSON)
    if (inputs.length === 0 && raw.includes('"input"')) {
      const inputMatches = raw.matchAll(/"input"\s*:\s*"((?:[^"\\]|\\.)*)"?/g);
      for (const m of inputMatches) {
        const val = (m[1] || '').replace(/\\"/g, '"').trim();
        if (val.length > 0 && val.length < 200) inputs.push({ input: val, expectedOutput: '', description: `Case ${inputs.length + 1}` });
      }
    }

    // 2c. Simple line format: "Input: x" or "Input 1: 5" or "1. 5"
    if (inputs.length === 0 && raw.includes('Input')) {
      const lines = raw.split(/\n/);
      for (const line of lines) {
        const m = line.match(/(?:Input\s*(?:\d+)?\s*[:=]\s*|^\d+\.\s*)(.+)/i);
        if (m && m[1].trim().length > 0 && m[1].trim().length < 200) {
          inputs.push({ input: m[1].trim(), description: `Input ${inputs.length + 1}` });
        }
      }
    }

    // 3. Fallback: full JSON parse (for old format)
    if ((!solution || inputs.length === 0) && raw.startsWith('{')) {
      const parsed = safeParseJSON(raw, {});
      if (!solution) solution = String(parsed.referenceSolution ?? parsed.reference_solution ?? parsed.code ?? '').trim();
      if (inputs.length === 0) {
        const arr = parsed.testInputs ?? parsed.test_inputs ?? parsed.inputs ?? [];
        if (Array.isArray(arr)) {
          inputs = arr.map(t => ({
            input: String(t.input ?? t.stdin ?? t.value ?? '').trim(),
            expectedOutput: String(t.expectedOutput ?? t.expected_output ?? t.output ?? '').trim(),
            description: String(t.description ?? t.desc ?? t.label ?? '').trim()
          }));
        }
      }
    }
  } catch (e) {
    console.warn('parseSolutionAndInputs error:', e.message);
  }

  // 4. Fallback: extract example inputs from problem text (e.g. "Input: 5" or "Example: 3, 5")
  if (inputs.length === 0 && questionText) {
    const examples = questionText.match(/(?:Input|Example)[:\s]+([^\n]+?)(?:\s*(?:Output|→|=>)|$)/gi);
    if (examples) {
      for (const ex of examples.slice(0, 6)) {
        const m = ex.match(/(?:Input|Example)[:\s]+([^\n→=>]+)/i);
        const val = m ? m[1].trim() : '';
        if (val.length > 0 && val.length < 80 && !/format|constraint|description/i.test(val)) {
          inputs.push({ input: val, expectedOutput: '', description: `From problem` });
        }
      }
    }
  }
  // Ensure all inputs have expectedOutput field
  inputs = inputs.map(t => ({ ...t, expectedOutput: t.expectedOutput ?? '' }));

  return { solution, inputs };
}

/**
 * Generate ONLY the solution (no test inputs) - for OOP two-phase generation
 */
async function generateSolutionOnly(questionText, language = 'python', problemType = 'oop', requiredConcepts = []) {
  if (!questionText || questionText.trim().length < 5) return { referenceSolution: '' };
  const langHint = LANGUAGE_HINTS[language] || LANGUAGE_HINTS.python;
  const conceptMap = { loops: 'loops', nested_loops: 'nested loops', arrays: 'arrays', pointers: 'pointers', conditionals: 'conditionals', recursion: 'recursion' };
  const conceptLabels = (requiredConcepts || []).map(c => conceptMap[c] || c).filter(Boolean);
  const conceptHint = conceptLabels.length > 0 ? `\nREQUIRED: ${conceptLabels.join(', ')}.` : '';

  const isBanking = /bank|account|deposit|withdraw|transfer|savings|current|overdraft/i.test(questionText);
  const bankingHint = isBanking
    ? `\nBANKING: main() must read OPERATION LINES from stdin (e.g. "CREATE_SAVINGS 1 John 1000", "DEPOSIT 1 500", "WITHDRAW 2 100"). Use a simple, consistent format: one operation per line.`
    : '';

  const sys = `You are a programming expert. Generate a correct ${language} solution. Output ONLY a code block with triple backticks. No explanation. Code must read from stdin and print to stdout.
${conceptHint}${bankingHint}
${langHint}`;

  const usr = `Implement this problem. Use a clear, parseable input format in main() (e.g. operation type + params per line). Output format: \`\`\`${language}\n// your code\n\`\`\`

PROBLEM:
${questionText.slice(0, 8000)}`;

  const raw = await callAI(sys, usr, { temperature: 0.05, maxTokens: 8192 }) || '';
  const { solution } = parseSolutionAndInputs(raw, questionText);
  return { referenceSolution: solution };
}

/**
 * Generate test inputs that MATCH the given solution's input format (OOP two-phase)
 */
async function generateInputsForSolution(questionText, referenceSolution, language = 'python', problemType = 'oop') {
  if (!referenceSolution || referenceSolution.trim().length < 20) return [];
  const sys = `You analyze code to understand its input format, then generate matching test inputs.
Output ONLY a JSON array: [{"input": "value", "description": "label"}, ...]
- "input" must be EXACTLY what the program expects on stdin. Use \\n for newlines between lines.
- Study the solution: how does main() read input? (input(), readline(), cin, Scanner, split()). Match that format exactly.
- Each test case = different scenario. For banking: different operation sequences (create accounts, deposit, withdraw, transfer). Cover: success, min balance decline, overdraft, student fee.
- Generate 5-6 cases. Each "input" must be valid for the solution's parser.`;
  const usr = `SOLUTION (${language}):
\`\`\`
${referenceSolution.slice(0, 4000)}
\`\`\`

PROBLEM CONTEXT:
${questionText.slice(0, 2000)}

Generate test inputs that this solution will accept. Return JSON: [{"input":"...","description":"..."}, ...]`;

  const raw = await callAI(sys, usr, { temperature: 0.05, maxTokens: 4096 }) || '';
  let parsed = safeParseJSON(raw.replace(/```json\s*|\s*```/g, '').trim(), null);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    const extracted = extractJsonArray(raw);
    parsed = extracted.length > 0 ? extracted : null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return [];
  return parsed.map(t => ({
    input: String(t.input ?? t.stdin ?? t.value ?? '').trim(),
    expectedOutput: '',
    description: String(t.description ?? t.desc ?? t.label ?? `Case ${parsed.indexOf(t) + 1}`).trim()
  })).filter(t => t.input.length > 0);
}

/**
 * Returns a concept-specific instruction string to append to the AI system prompt.
 * Tells the AI exactly what construct to use, input format, test values, and what to avoid.
 * @param {string} problemType
 * @returns {string}
 */
function getConceptPrompt(problemType, questionText, language) {
  const isCpp = language === 'cpp' || language === 'c++';
  const isC   = language === 'c';
  const isClike = isCpp || isC;

  const prompts = {
    loops: `
CONCEPT ENFORCEMENT — LOOPS:
- Solution MUST use a for or while loop as the primary control structure.
- Do NOT use recursion to replace the loop.
- Do NOT compute the result in a single expression without a visible loop body.
- Input format: a single integer n on one line (e.g. "7").
- Test case values to generate:
    normal:   n = 5, n = 10, n = 7
    boundary: n = 1 (single iteration), n = 0 (zero iterations if valid)
    large:    n = 20 or n = 100 (if feasible)
- Expected output: the result of running the loop n times (sum, product, printed sequence, etc.).
${isClike ? `
C++ SYNTAX REQUIREMENT:
- Use for(int i = 0; i < n; i++) or while(condition) loop construct.
- Read with cin. Print with cout.
- Example:
    int n; cin >> n;
    for(int i = 1; i <= n; i++) cout << i << " ";` : ''}`,

    do_while: `
CONCEPT ENFORCEMENT — DO-WHILE LOOP (C/C++/Java only):
- Solution MUST use a do { ... } while(condition); construct.
- The loop body must execute at least once before the condition is checked.
- Do NOT use a plain while or for loop as the primary structure.
- Input format: a single integer or a sequence of integers ending with a sentinel (e.g. "0").
- Test case values to generate:
    normal:   input that causes multiple iterations (e.g. "3 7 2 0")
    boundary: sentinel only — loop runs exactly once (e.g. "0")
    edge:     single non-sentinel value followed by sentinel (e.g. "5 0")
- Expected output: accumulated result or last processed value.`,

    conditionals: `
CONCEPT ENFORCEMENT — CONDITIONALS (if/else/elif):
- Solution MUST use if/else or elif chains for multi-way branching.
- Do NOT use a lookup dict/map or switch to replace the if/else logic (unless switch is specified).
- Input format: a single value on one line — integer, float, or a single character/word.
- Test case values to generate:
    normal:   values that hit the most common branches (e.g. score 85, 72, 45)
    boundary: exact threshold values (e.g. 90, 80, 70, 60, 0)
    edge:     values at or just past each boundary (e.g. 89, 91)
- Expected output: a single label or message (e.g. "A", "Pass", "Invalid").`,

    switch: `
CONCEPT ENFORCEMENT — SWITCH/CASE:
- Solution MUST use a switch (C/C++/Java) or equivalent if/elif (Python) with clearly labelled cases.
- Each case must be a distinct integer or character value — no range checks inside case blocks.
- Include a default/else branch for unrecognised values.
- Input format: a single integer or single character on one line (e.g. "3" or "B").
- Test case values to generate:
    normal:   one input per defined case (e.g. 1, 2, 3, 4, 5)
    default:  a value not in any case (e.g. 9 or 0)
    boundary: first and last valid case numbers
- Expected output: the label or result mapped to that case.`,

    recursion: `
CONCEPT ENFORCEMENT — RECURSION:
- Solution function MUST call itself. No iterative loops (for/while) for the main computation.
- Include a clear base case that terminates the recursion.
- Do NOT convert to iteration or use memoisation tables instead of recursive calls.
- Input format: one or two integers on one line (e.g. "6" or "2 10"). Keep n ≤ 20.
- Test case values to generate:
    normal:   n = 5, n = 8, n = 3
    base:     n = 0 and n = 1 (base-case inputs)
    moderate: n = 10, n = 15
- Expected output: the single computed value (factorial, fib number, power, etc.).
${isClike ? `
C++ SYNTAX REQUIREMENT:
- Declare the recursive function BEFORE main().
- Example:
    int solve(int n) {
      if (n <= 0) return 0;   // base case
      return n + solve(n - 1); // recursive call
    }
    int main() { int n; cin >> n; cout << solve(n) << endl; }` : ''}`,

    arrays_1d: `
CONCEPT ENFORCEMENT — 1D ARRAYS:
- Solution MUST declare and use a 1-dimensional array or list.
- Do NOT process elements without storing them in an array first.
- Input format (strict): line 1 = n (size), line 2 = n space-separated integers.
    Example: "5\\n3 1 4 1 5"
- Test case values to generate:
    normal:   n = 5 with varied values
    small:    n = 3
    single:   n = 1
    large:    n = 8 or n = 10
    all same: n = 4 with identical elements (e.g. "4\\n7 7 7 7")
- Expected output: the computed result (max, min, sum, reversed array space-separated, etc.).
${isClike ? `
C++ SYNTAX REQUIREMENT:
- Use: int arr[100]; for(int i = 0; i < n; i++) cin >> arr[i];
- Print: for(int i = 0; i < n; i++) cout << arr[i] << " ";
- Use fixed-size array (int arr[100]) or vector<int> arr(n).` : ''}`,

    arrays_2d: `
CONCEPT ENFORCEMENT — 2D ARRAYS / MATRIX:
- Solution MUST declare and use a 2-dimensional array/matrix with nested loops.
- Input format (strict): line 1 = "rows cols" (two integers n and m), then n lines each with m space-separated integers.
    Example 3×3 input: "3 3\\n1 2 3\\n4 5 6\\n7 8 9"

OUTPUT FORMAT RULES (read the problem carefully to pick the right one):
1. ROW SUMS then COLUMN SUMS (most common for this problem type):
   - Print n lines (one per row): sum of that row.
   - Then print m lines (one per column): sum of that column.
   - Total output = n + m lines. Each line is a single integer.
   - CORRECT for "3 3\\n1 2 3\\n4 5 6\\n7 8 9":
       6      ← row 0 sum
       15     ← row 1 sum
       24     ← row 2 sum
       12     ← col 0 sum
       15     ← col 1 sum
       18     ← col 2 sum
   - WRONG: printing all 6 numbers on one line, or printing col sums before row sums.

2. TRANSPOSE: print m rows, each with n values space-separated.

3. SINGLE SCALAR: one integer (total sum, max element, trace, etc.).

4. DIAGONAL: one integer per diagonal element, or single sum.

- Keep matrix dimensions between 2×2 and 4×4 for test cases.
- Test inputs to cover: square (3×3), rectangle (2×3), negatives that cancel, single row (1×m), single col (n×1).
${isClike ? `
C++ SYNTAX REQUIREMENT:
- Declare: int arr[10][10];
- Read:    for(int i=0;i<n;i++) for(int j=0;j<m;j++) cin >> arr[i][j];
- Row sum: for(int j=0;j<m;j++) rowSum += arr[i][j];  cout << rowSum << endl;
- Col sum: for(int i=0;i<n;i++) colSum += arr[i][j];  cout << colSum << endl;` : `
PYTHON SYNTAX REQUIREMENT:
- Read:    matrix = [list(map(int, input().split())) for _ in range(n)]
- Row sum: print(sum(matrix[i]))  — one line per row
- Col sum: print(sum(matrix[i][j] for i in range(n)))  — one line per col`}`,

    arrays_3d: `
CONCEPT ENFORCEMENT — 3D ARRAYS:
- Solution MUST declare and use a 3-dimensional array.
- Input format (strict): line 1 = "x y z" (layers rows cols), then all elements layer→row→col,
  each row on its own line.
    Example 2×2×2: "2 2 2\\n1 2\\n3 4\\n5 6\\n7 8"
- Keep all dimensions at 2 for test cases (2×2×2 or 2×2×3 max).
- Test case values to generate:
    2×2×2 with distinct values
    2×2×2 with all same value (e.g. all 1s)
    2×2×3 for non-cubic shape
- Expected output: sum of all elements, or value at a specified index.`,

    pointers: `
CONCEPT ENFORCEMENT — POINTERS (C/C++ ONLY):
- Solution MUST declare at least one pointer variable using * and/or use & (address-of).
- Do NOT pass values directly without pointer indirection for the primary operation.
- Typical constructs: int *p = &x; swap via pointers; pointer arithmetic on array; *p = value.
- Input format: same as the underlying data — one or two integers, or n then space-separated.
    Example: "5 3" or "5\\n1 2 3 4 5"
- Test case values to generate:
    normal:   two distinct integers (e.g. "8 3")
    zero:     one or both values are 0 (e.g. "0 5")
    negative: negative values if applicable (e.g. "-3 7")
    array:    n=4 with varied values if pointer-to-array is needed
- Expected output: modified value(s) or result of pointer operation.
${isClike ? `
C++ SYNTAX REQUIREMENT:
- Declare at least one pointer with *. Use dereference * and address-of & operators.
- Pointer arithmetic example:
    int *left = arr;
    int *right = arr + n - 1;
    while(left < right) {
        int temp = *left; *left = *right; *right = temp;
        left++; right--;
    }
- Read with cin. Print with cout.` : ''}`,

    patterns: '__DYNAMIC__',   // resolved dynamically below

    nested_loops: `
CONCEPT ENFORCEMENT — NESTED LOOPS:
- Solution MUST contain a loop inside another loop (at least 2 levels of nesting).
- Both the outer and inner loop variables must contribute to the computation or output.
- Do NOT flatten the logic into a single loop or use a formula.
- Input format: one or two integers (e.g. "n" or "rows cols").
- Test case values to generate:
    small:  n = 2 or rows=2 cols=3
    normal: n = 4 or rows=3 cols=4
    square: n = 3 (rows = cols)
- Expected output: the 2D result printed row by row, space-separated per row.
${isClike ? `
C++ SYNTAX REQUIREMENT:
- Use nested for(int i=0;...) { for(int j=0;...) { ... } } loops.
- Print each row with cout, then cout << endl; or cout << "\\n"; after each row.` : ''}`
  };

  const base = prompts[problemType];

  // Dynamic pattern prompt: universal rules + subtype-specific block
  if (base === '__DYNAMIC__') {
    const subtype = detectPatternSubtype(questionText || '');
    const subtypeBlock = PATTERN_SUBTYPE_PROMPTS[subtype] || PATTERN_SUBTYPE_PROMPTS.star_right_triangle;
    const cppPatternNote = isClike ? `
C++ SYNTAX REQUIREMENT FOR PATTERNS:
- Use nested for(int i=1;i<=n;i++) { for(int j=...) { ... } cout << endl; } loops.
- Print each character with cout << '*' or cout << i etc.
- End each row with cout << endl; or cout << '\\n';
- NEVER use cout << endl with end= tricks. NEVER suppress row newlines.
- Read input with: int n; cin >> n;` : '';
    return `\nCONCEPT ENFORCEMENT — PATTERN PRINTING [subtype: ${subtype.toUpperCase()}]:
${PATTERN_UNIVERSAL_RULES}
${subtypeBlock}
${cppPatternNote}
`;
  }

  return base || '';
}

// ─────────────────────────────────────────────────────────────────────────────
// PATTERN SUBTYPE DETECTION & PROMPTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect which specific pattern variant is being asked for.
 * Order: more specific checks first to avoid false matches.
 * @param {string} questionText
 * @returns {string} subtype key
 */
function detectPatternSubtype(questionText) {
  if (!questionText) return 'star_right_triangle';
  const t = questionText.toLowerCase();

  // Hollow variants first (more specific)
  if (/hollow\s*diamond|diamond\s*hollow/i.test(t))          return 'star_hollow_diamond';
  if (/hollow\s*square|square\s*hollow|border\s*(only|stars)|only\s*border/i.test(t)) return 'star_hollow_square';
  if (/hollow\s*triangle|triangle\s*hollow/i.test(t))        return 'star_hollow_triangle';

  // Special star shapes
  if (/butterfly/i.test(t))                                  return 'star_butterfly';
  if (/hourglass/i.test(t))                                  return 'star_hourglass';
  if (/\bk[\s-]?pattern\b|\bk[\s-]?shape\b/i.test(t))       return 'star_k_pattern';
  if (/\bdiamond\b|\brhombus\b/i.test(t))                    return 'star_diamond';

  // Star triangles / squares
  if (/\bsquare\b.*\bstar|\bstar\b.*\bsquare|n\s*x\s*n\s*star/i.test(t)) return 'star_square';
  if (/left[\s-]?(triangle|half|align)|right[\s-]?align.*left/i.test(t)) return 'star_left_triangle';
  if (/revers|invert|decreas.*star|upside.*down|downward/i.test(t))       return 'star_reverse_triangle';

  // Number patterns (more specific first)
  if (/pascal/i.test(t))                                     return 'number_pascal';
  if (/palindrome.*number|number.*palindrome|mirror.*row|row.*mirror/i.test(t)) return 'number_palindrome';
  if (/mirror.*triangle|revers.*number|number.*decreas|count.*down/i.test(t))   return 'number_mirror';
  if (/zero[\s-]?one|0[\s,]1\s*pattern|one[\s-]?zero/i.test(t))           return 'zero_one_triangle';
  if (/\bbinary\b.*pattern|alternating\s*(0|1)|0\s*1\s*0\s*1/i.test(t))   return 'binary_triangle';
  if (/sequential.*number|changing.*number|number.*sequen/i.test(t))       return 'number_changing';
  if (/increasing.*number|1\s*2\s*3\s*per\s*row|different.*number.*each/i.test(t)) return 'number_increasing';
  if (/number.*triangle|row.*number|digit.*triangle|row.*repeated/i.test(t)) return 'number_right_triangle';

  // Default: plain star right triangle
  return 'star_right_triangle';
}

/** Universal rules prepended to every pattern subtype prompt */
const PATTERN_UNIVERSAL_RULES = `
INPUT/OUTPUT:
- Input: a single integer n on one line (e.g. "5").
- Test cases: n=1, n=2, n=3, n=4, n=5, n=6, n=7 (cover small, normal, larger).
- Expected output: the pattern, one row per line. Use \\n between rows in the JSON expectedOutput.

UNIVERSAL RULES FOR ALL PATTERN PROBLEMS (strictly follow every one):
1. Every row MUST end with its own newline. Use a separate print()/cout statement per row.
2. NEVER collect rows into a list and join/print at once. This collapses newlines.
3. NEVER use end='' or end=' ' or sep='' in a row-terminating print.
4. NEVER hardcode a literal star/space string like "***" or "   " as a fixed value.
5. ALL star counts and space counts MUST come from the loop variable (i, j, n) — never a literal number.
6. Solution MUST contain at least TWO standalone loop constructs (outer + inner nested loops).
   List comprehensions like [x for x in ...] do NOT count as a loop — use proper for loops.
7. STAR SPACING: Always separate each star with exactly one space.
   Use ' '.join(['*'] * count) — NOT '*' * count.
   Example: 3 stars → "* * *"  NOT "***"
   Exception: only omit spaces if the problem statement explicitly says "print stars without spaces".

WRONG PATTERN (do NOT use):
\`\`\`python
rows = []
for i in range(1, n+1):
    rows.append('*' * i)
print(' '.join(rows))          # WRONG — single line output
\`\`\`
`;

/** Subtype-specific instructions keyed by subtype string */
const PATTERN_SUBTYPE_PROMPTS = {

  star_right_triangle: `
SUBTYPE: RIGHT-ALIGNED STAR TRIANGLE
Each row i (1..n) prints exactly i stars, left-aligned.
Use: for i in range(1, n+1): print('*' * i)   — '*' * i is ALLOWED (i is a variable).
CORRECT:
\`\`\`python
n = int(input())
for i in range(1, n + 1):
    print('*' * i)
\`\`\`
For n=3 → "\\n" separated: *  /  **  /  ***`,

  star_left_triangle: `
SUBTYPE: LEFT-ALIGNED (RIGHT-JUSTIFIED) STAR TRIANGLE
Row i has (n-i) leading spaces then i stars.
Use TWO inner loops or string formatting: print(' '*(n-i) + '*'*i).
CORRECT:
\`\`\`python
n = int(input())
for i in range(1, n + 1):
    print(' ' * (n - i) + '*' * i)
\`\`\`
For n=3 → "  *" / " **" / "***"`,

  star_reverse_triangle: `
SUBTYPE: REVERSE / INVERTED STAR TRIANGLE
Row i (starting at n down to 1) prints n-i+1 stars (decreasing).
Outer loop from n down to 1, or from 1 to n printing n-i+1 stars.
CORRECT:
\`\`\`python
n = int(input())
for i in range(n, 0, -1):
    print('*' * i)
\`\`\`
For n=3 → "***" / "**" / "*"`,

  star_hollow_triangle: `
SUBTYPE: HOLLOW TRIANGLE
Print star only on the first column, last column of each row, and entire last row.
CORRECT:
\`\`\`python
n = int(input())
for i in range(1, n + 1):
    if i == 1:
        print('*')
    elif i == n:
        print('*' * i)
    else:
        print('*' + ' ' * (i - 2) + '*')
\`\`\``,

  star_square: `
SUBTYPE: SOLID STAR SQUARE (n × n)
Every row prints exactly n stars. Outer loop n times, print '*' * n each row.
CORRECT:
\`\`\`python
n = int(input())
for i in range(n):
    print('*' * n)
\`\`\`
For n=3 → "***" / "***" / "***"`,

  star_hollow_square: `
SUBTYPE: HOLLOW SQUARE (border stars only)
Print stars only on the border: first row, last row, first col, last col.
Middle cells print space. Use nested loops with if condition.
CORRECT:
\`\`\`python
n = int(input())
for i in range(n):
    for j in range(n):
        if i == 0 or i == n-1 or j == 0 or j == n-1:
            print('*', end='')
        else:
            print(' ', end='')
    print()   # end-of-row newline — required
\`\`\`
NOTE: end='' on COLUMN characters is allowed; the row-terminating print() has NO end argument.`,

  star_diamond: `
SUBTYPE: SOLID DIAMOND
Upper half (rows 1..n): row i has (n-i) leading spaces then (2i-1) stars.
Lower half (rows n-1..1): mirror of upper.
STAR SPACING: Each star MUST be separated by exactly one space.
  Middle row of n=5 diamond → "* * * * * * * * *"  (9 stars, single space between each)
  Never print stars as "***" — always use ' '.join(['*'] * count).
  Never add extra leading or trailing spaces beyond the indent offset.
CORRECT:
\`\`\`python
n = int(input())
for i in range(1, n + 1):
    indent = ' ' * (n - i)
    stars = ' '.join(['*'] * (2 * i - 1))
    print(indent + stars)
for i in range(n - 1, 0, -1):
    indent = ' ' * (n - i)
    stars = ' '.join(['*'] * (2 * i - 1))
    print(indent + stars)
\`\`\`
For n=3:
  "  *"
 "* * *"
"* * * * *"
 "* * *"
  "  *"`,

  star_hollow_diamond: `
SUBTYPE: HOLLOW DIAMOND
Same shape as solid diamond but only first and last star per row; middle positions = spaces.
STAR SPACING: Each star MUST be separated by exactly one space. Middle of row = single spaces.
CORRECT:
\`\`\`python
n = int(input())
for i in range(1, n + 1):
    indent = ' ' * (n - i)
    width = 2 * i - 1
    if width == 1:
        print(indent + '*')
    else:
        # first star, (width-2) spaces, last star — all single-space separated
        middle = ' ' * (width - 2)
        print(indent + '* ' + middle + ' *')
for i in range(n - 1, 0, -1):
    indent = ' ' * (n - i)
    width = 2 * i - 1
    if width == 1:
        print(indent + '*')
    else:
        middle = ' ' * (width - 2)
        print(indent + '* ' + middle + ' *')
\`\`\``,

  star_butterfly: `
SUBTYPE: BUTTERFLY PATTERN
Upper half row i (1..n): i stars, (2*(n-i)) spaces, i stars.
Lower half row i (n-1..1): same formula.
CORRECT:
\`\`\`python
n = int(input())
for i in range(1, n + 1):
    print('*' * i + ' ' * (2 * (n - i)) + '*' * i)
for i in range(n - 1, 0, -1):
    print('*' * i + ' ' * (2 * (n - i)) + '*' * i)
\`\`\``,

  star_hourglass: `
SUBTYPE: HOURGLASS
Upper half (n..1 stars, decreasing): row i has (n-i) leading spaces then (2i-1) stars.
Lower half (1..n stars, increasing): mirror.
CORRECT:
\`\`\`python
n = int(input())
for i in range(n, 0, -1):
    print(' ' * (n - i) + '*' * (2 * i - 1))
for i in range(2, n + 1):
    print(' ' * (n - i) + '*' * (2 * i - 1))
\`\`\``,

  star_k_pattern: `
SUBTYPE: K PATTERN (stars on left, middle, right forming a K shape)
Row 1 and last: full row. Middle rows: first star + spaces + star at position matching row.
Implement as: outer loop prints left edge and diagonal branch.
CORRECT:
\`\`\`python
n = int(input())
for i in range(1, n + 1):
    for j in range(1, n + 1):
        if j == 1 or j == (n + 1 - i) or j == i:
            print('*', end='')
        else:
            print(' ', end='')
    print()
\`\`\``,

  number_right_triangle: `
SUBTYPE: NUMBER TRIANGLE (row number repeated)
Row i prints the number i repeated i times, space-separated.
CORRECT:
\`\`\`python
n = int(input())
for i in range(1, n + 1):
    print(' '.join([str(i)] * i))
\`\`\`
For n=3 → "1" / "2 2" / "3 3 3"`,

  number_increasing: `
SUBTYPE: INCREASING NUMBERS PER ROW (1 2 3 per row)
Row i prints 1 2 3 ... i (sequential from 1 to i).
CORRECT:
\`\`\`python
n = int(input())
for i in range(1, n + 1):
    print(' '.join(str(j) for j in range(1, i + 1)))
\`\`\`
For n=3 → "1" / "1 2" / "1 2 3"`,

  number_reverse: `
SUBTYPE: REVERSE NUMBER TRIANGLE
Row i prints i down to 1.
CORRECT:
\`\`\`python
n = int(input())
for i in range(1, n + 1):
    print(' '.join(str(j) for j in range(i, 0, -1)))
\`\`\`
For n=3 → "1" / "2 1" / "3 2 1"`,

  number_palindrome: `
SUBTYPE: PALINDROME NUMBER TRIANGLE
Row i prints 1 2 ... i ... 2 1 (mirror around i).
CORRECT:
\`\`\`python
n = int(input())
for i in range(1, n + 1):
    row = list(range(1, i + 1)) + list(range(i - 1, 0, -1))
    print(' '.join(map(str, row)))
\`\`\`
For n=3 → "1" / "1 2 1" / "1 2 3 2 1"`,

  number_mirror: `
SUBTYPE: MIRROR / REVERSE-PYRAMID NUMBER TRIANGLE
Row i prints numbers i down to 1 (each row starts from its row number).
CORRECT:
\`\`\`python
n = int(input())
for i in range(n, 0, -1):
    print(' '.join(str(j) for j in range(i, 0, -1)))
\`\`\`
For n=3 → "3 2 1" / "2 1" / "1"`,

  number_pascal: `
SUBTYPE: PASCAL'S TRIANGLE
Row i has i+1 values. dp[i][j] = dp[i-1][j-1] + dp[i-1][j]. First and last element always 1.
CRITICAL: Use proper nested for loops — NOT list comprehension for row computation.
CORRECT (use this exact pattern):
\`\`\`python
n = int(input())
dp = [[0] * (n + 1) for _ in range(n + 1)]
for i in range(n):
    dp[i][0] = 1
    for j in range(1, i + 1):
        dp[i][j] = dp[i-1][j-1] + dp[i-1][j]
    dp[i][i] = 1
    print(' '.join(str(dp[i][j]) for j in range(i + 1)))
\`\`\`
For n=4 → "1" / "1 1" / "1 2 1" / "1 3 3 1"

WRONG (do NOT use list comprehension for row computation):
\`\`\`python
row = [1]
for i in range(n):
    row = [1] + [row[j-1] + row[j] for j in range(1, len(row))] + [1]  # WRONG — list comprehension
\`\`\``,

  number_changing: `
SUBTYPE: SEQUENTIAL / CHANGING NUMBER TRIANGLE
Numbers increment continuously: 1 / 2 3 / 4 5 6 / 7 8 9 10 ...
CORRECT:
\`\`\`python
n = int(input())
num = 1
for i in range(1, n + 1):
    print(' '.join(str(num + j) for j in range(i)))
    num += i
\`\`\`
For n=3 → "1" / "2 3" / "4 5 6"`,

  zero_one_triangle: `
SUBTYPE: ZERO-ONE TRIANGLE
Cell (i, j) is 1 if (i+j) is even, else 0.
CORRECT:
\`\`\`python
n = int(input())
for i in range(1, n + 1):
    row = []
    for j in range(1, i + 1):
        row.append('1' if (i + j) % 2 == 0 else '0')
    print(' '.join(row))
\`\`\`
For n=3 → "1" / "0 1" / "1 0 1"`,

  binary_triangle: `
SUBTYPE: BINARY / ALTERNATING 0-1 TRIANGLE
Row starts with 1 if row is odd, 0 if even; alternates within each row.
CORRECT:
\`\`\`python
n = int(input())
for i in range(1, n + 1):
    start = 1 if i % 2 != 0 else 0
    row = [(start + j) % 2 for j in range(i)]
    print(' '.join(map(str, row)))
\`\`\`
For n=3 → "1" / "0 1" / "1 0 1"`
};

/**
 * Keyword-based fast detection of problem type from the question text.
 * Returns the most likely problemType string without an AI call.
 * @param {string} questionText
 * @returns {string} problemType key
 */
function detectProblemType(questionText) {
  if (!questionText || typeof questionText !== 'string') return 'basic_programming';
  const t = questionText.toLowerCase();

  // Order matters — more specific checks first
  if (/\b(recursion|recursive|factorial|fibonacci|fib\b|hanoi|tower of hanoi|base case|call itself|self.call)\b/.test(t)) return 'recursion';
  if (/\b(pattern|triangle|pyramid|star\b|diamond|rhombus|hollow|butterfly|hourglass|k.?pattern|pascal|palindrome.*row|row.*number|number.*triangle|binary.*pattern|zero.one|0.1.pattern|alternating.*digit|sequential.*number|changing.*number|mirror.*triangle|reverse.*pyramid|right.angle|inverted|left.half|border.only)\b/.test(t)) return 'patterns';
  if (/\b(pointer|address|dereference|&\w|swap.*pointer|pass.*reference|pointer arithmetic)\b/.test(t)) return 'pointers';
  if (/\b(switch|case\b|menu.driven|menu option|select.*option|choose.*case)\b/.test(t)) return 'switch';
  if (/\b(do.while|do\s*{|executes at least once|repeat.*until)\b/.test(t)) return 'do_while';
  if (/\b(3d array|three.dimensional|3.d array|3-dimensional|arr\[.*\]\[.*\]\[.*\])\b/.test(t)) return 'arrays_3d';
  if (/\b(2d array|matrix|grid|two.dimensional|2.d array|row.*col|rows.*cols|m.?x.?n|n.?x.?n)\b/.test(t)) return 'arrays_2d';
  if (/\b(array|list\b|elements?|index|indices|arr\[|sequence of numbers|store.*numbers)\b/.test(t)) return 'arrays_1d';
  if (/\b(if.*else|if.*elif|conditional|grade|classify|categorize|branch|multiple condition)\b/.test(t)) return 'conditionals';
  if (/\b(nested loop|loop inside|inner loop|outer loop|multiplication table|times table)\b/.test(t)) return 'nested_loops';
  if (/\b(loop|iteration|iterate|repeat|for loop|while loop|do loop|count.*times|sum.*n|print.*n times)\b/.test(t)) return 'loops';

  return 'basic_programming';
}

/**
 * Strip teacher-level metadata from a problem statement before passing it to the AI.
 *
 * Teachers often include constraints, required concepts, examples, penalty clauses,
 * and detailed I/O format explanations that make the AI over-strict when generating
 * reference solutions and test cases.  This function keeps only what the AI needs:
 * the core problem description + a single Input/Output summary line.
 *
 * The FULL text is always preserved for the teacher UI and concept detection — it is
 * NEVER replaced; only the copy sent to AI prompts is stripped.
 *
 * @param {string} fullText  Raw problem text (may be hundreds of lines)
 * @returns {string}         Lean, AI-friendly version (≤ 1 200 chars)
 */
function extractMinimalProblemInfo(fullText) {
  if (!fullText || fullText.trim().length < 10) return fullText;
  let text = fullText;

  // 1. Remove whole labelled sections that start with these keywords on their own line.
  //    Matches the keyword label + everything until the next blank line.
  text = text.replace(
    /^[ \t]*(important|constraints?|required\s+concepts?|concept\s+requirements?|notes?|hint|hints|scoring|grading|marking|penalty|penalties|restriction|time\s+complexity|space\s+complexity)[ \t]*:.*(\n(?![ \t]*\n).*)*\n?/gim,
    ''
  );

  // 2. Remove bullet / numbered lines that encode constraints
  //    e.g. "- Must use loops", "• No recursion allowed", "3. Do not use built-ins"
  text = text.replace(
    /^[ \t]*(\d+\.|[-•*])\s*(must\s+use|do\s+not|don[''']?t|avoid|use\s+only|no\s+recursion|no\s+hardcod|required:|marks?\s+will|you\s+must|you\s+should|students?\s+must).*/gim,
    ''
  );

  // 3. Extract the FIRST "Input:" and "Output:" summary lines before removing detail blocks.
  //    Capture up to 200 chars so multi-part formats ("first n lines…next m lines…") survive.
  const inputSummaryMatch  = text.match(/\b(?:input\s*(?:format)?)\s*:\s*([^\n]{5,200})/i);
  const outputSummaryMatch = text.match(/\b(?:output\s*(?:format)?)\s*:\s*([^\n]{5,200})/i);

  // 4. Remove all detailed Input Format / Output Format sections (multi-line).
  text = text.replace(
    /^[ \t]*(input|output)\s*(format)?\s*:.*(\n(?![ \t]*\n).*)*\n?/gim,
    ''
  );

  // 5. Keep only the FIRST example/sample block — remove the rest.
  //    Strategy: find the second occurrence of "Example" or "Sample" and truncate there.
  const exRe = /\b(example|sample)\b/gi;
  let exMatch;
  let exCount = 0;
  let secondExIdx = -1;
  while ((exMatch = exRe.exec(text)) !== null) {
    exCount++;
    if (exCount === 2) { secondExIdx = exMatch.index; break; }
  }
  if (secondExIdx > 0) {
    text = text.slice(0, secondExIdx);
  }

  // 6. Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  // 7. Re-append compact I/O summary lines (one line each)
  if (inputSummaryMatch)  text += `\nInput: ${inputSummaryMatch[1].trim()}`;
  if (outputSummaryMatch) text += `\nOutput: ${outputSummaryMatch[1].trim()}`;

  // 8. Hard cap to keep prompts lean
  return text.slice(0, 1200);
}

/**
 * Generate reference solution + test inputs from AI (no expected outputs - we compute them)
 * @param {string} questionText - The programming question
 * @param {string} language - python, cpp, c, java, javascript
 * @param {string} problemType - algorithm | data_structure | oop | loops | conditionals | etc.
 * @param {string[]} requiredConcepts - optional: loops, nested_loops, arrays, pointers, conditionals, recursion
 * @returns {Promise<{referenceSolution: string, testInputs: Array<{input: string, description: string}>}>}
 */
async function generateReferenceSolutionAndInputs(questionText, language = 'python', problemType = 'basic_programming', requiredConcepts = []) {
  if (!questionText || questionText.trim().length < 5) {
    return { referenceSolution: '', testInputs: [] };
  }

  // Reference solution is generated in Python for maximum reliability —
  // Python has predictable output (no trailing spaces, consistent newlines).
  // Student submissions default to C++ but can be in any language;
  // both sides are normalised before comparison — language-independent matching.
  const REF_LANG = 'python';

  const langHint = LANGUAGE_HINTS[REF_LANG];          // always Python hint
  const typeHint = PROBLEM_TYPE_HINTS[problemType] || PROBLEM_TYPE_HINTS.basic_programming;
  const conceptMap = { loops: 'loops', do_while: 'do-while loop', switch: 'switch/case', nested_loops: 'nested loops', arrays: '1D arrays', arrays_2d: '2D arrays', arrays_3d: '3D arrays', pointers: 'pointers', conditionals: 'conditionals', recursion: 'recursion' };
  const conceptLabels = (requiredConcepts || []).map(c => conceptMap[c] || c).filter(Boolean);
  const conceptHint = conceptLabels.length > 0
    ? `\nREQUIRED CONCEPTS (must use in solution): ${conceptLabels.join(', ')}. Do NOT hardcode output; use these concepts.`
    : '';

  // Concept prompt uses Python rules (reference solution is Python)
  const conceptPrompt = getConceptPrompt(problemType, questionText, REF_LANG);

  const systemPrompt = `You are a programming assistant. Generate a correct Python solution and test inputs.

PROBLEM TYPE: ${problemType.toUpperCase().replace(/_/g, ' ')}
${typeHint}${conceptHint}${conceptPrompt}

STRICT OUTPUT FORMAT (follow exactly):
1. First, a code block with triple backticks. Put ONLY the Python code inside. Code must read from stdin and print to stdout.
2. After the code block, on a new line, write exactly: TEST_INPUTS:
3. On the next line, a JSON array. Format: [{"input": "value", "expectedOutput": "output", "description": "label"}, ...]
   - "input" is the stdin (use \\n for newline between lines). Use simple values: numbers, short strings.
   - "expectedOutput" is the EXACT output your solution produces. CRITICAL: Include for every test case.
   - For multi-line output (e.g. per-vehicle billing), use \\n in the string: "expectedOutput": "50\\n120\\n200"
   - "description" is a short label like "basic" or "edge case"
   - CRITICAL: Always close each string with a quote. For inputs like ()[] or {[]}, use {"input": "()[]", "expectedOutput": "...", "description": "balanced"}
   - Generate 5-6 test cases covering normal, edge, and boundary cases

Example for "double the number":
\`\`\`python
n = int(input())
print(n * 2)
\`\`\`

TEST_INPUTS:
[{"input": "5", "expectedOutput": "10", "description": "basic"}, {"input": "0", "expectedOutput": "0", "description": "zero"}]

Example for "trapping rain water" (array input):
\`\`\`python
heights = list(map(int, input().split()))
# ... solution ...
\`\`\`

TEST_INPUTS:
[{"input": "0 1 0 2 1 0 1 3 2 1 2 1", "expectedOutput": "6", "description": "classic"}, {"input": "4 2 0 3 2 5", "expectedOutput": "9", "description": "another"}]
${problemType === 'oop' ? `

Example for OOP BANKING: Design main() to parse operation lines. Format depends on your design (e.g. "1 1 John 1000" for create savings, "2 1 500" for deposit). Each test case = DIFFERENT operation sequence. Each expectedOutput = FULL program output for that sequence. Cover: deposit success, withdraw min-balance decline, overdraft, student fee, transfer.
Example for OOP GIFT/ORDER: "Rose 10", "GUCCI 5", "2 HappyBirthday 3" per line.
` : ''}

${langHint}`;

  const isBankingOOP = problemType === 'oop' && /bank|account|deposit|withdraw|transfer|savings|current|overdraft/i.test(questionText);
  const bankingRule = isBankingOOP
    ? `6. OOP BANKING: Your main() must parse OPERATION LINES (e.g. "CREATE_SAVINGS 1 John 1000", "DEPOSIT 1 500", "WITHDRAW 2 100", "TRANSFER 1 2 200"). Each test case = different operation sequence. expectedOutput = full program output for that sequence. Test: min balance decline, overdraft decline, student withdrawal fee, successful transfer, display/summary.`
    : '';

  // Detect validation/checker problems (username, password, format validators)
  const isValidation = /valid|invalid|check|verif|format|rule|must (start|contain|have|be)|length (must|should)|character/i.test(questionText);
  const validationRule = isValidation
    ? `6. VALIDATION PROBLEM: Your solution must print ONLY the result (e.g. "VALID" or "INVALID: reason"). NEVER print "Input: X, Expected Output: Y" or echo back the input. The output must be exactly what the problem's Output Format says - nothing else.`
    : '';

  // Build a lean version of the problem text for the AI prompt.
  // Strips constraints / required-concepts / detailed I/O sections so the AI
  // focuses on correctness rather than over-strict rule enforcement.
  const minimalProblemText = extractMinimalProblemInfo(questionText);

  const userPrompt = `Generate a Python solution and 5-6 test inputs for this problem. Output format: code block first, then TEST_INPUTS: then JSON array.

CRITICAL RULES:
1. Solve the core problem described below. Keep the solution straightforward and correct.
2. For scenario-based problems with sub-parts (a)(b)(c), generate test cases that cover the full scenario.
3. For each test case you MUST include "expectedOutput" - the exact output your solution produces. Run through your solution mentally for each input. Use \\n for newlines in multi-line output. This is required for grading.
4. Implement billing tables, peak hours, daily caps, and rounding exactly as specified. Do not skip any business logic.
5. EACH test case must have a DIFFERENT expectedOutput. Never repeat the same output (e.g. "Account Number: 1 Owner Name: John Doe") for all cases.
${bankingRule}${validationRule}

PROBLEM:
${minimalProblemText}`;

  const raw = await callAI(systemPrompt, userPrompt, { temperature: 0.08, maxTokens: 8192 }) || '';
  const { solution, inputs } = parseSolutionAndInputs(raw, questionText);

  // ── 2D-array row/col sum guard ────────────────────────────────────────────
  // If the problem asks for row sums then column sums, make sure the generated
  // solution actually prints n+m lines and doesn't collapse both into one number.
  let finalSolution = solution;
  if (problemType === 'arrays_2d' && solution) {
    const isRowColSum = /\b(row.{0,20}col|column.{0,20}row|sum.{0,20}each.{0,20}(row|col)|row.{0,20}sum.{0,30}col.{0,20}sum)\b/i.test(questionText);
    if (isRowColSum) {
      // Check: solution must have at least 2 print loops (one for rows, one for cols)
      const printLoopCount = (solution.match(/\bfor\b[^:]+:\s*\n[^:]+print/g) || []).length +
                             (solution.match(/\bprint\s*\(.+\)\s*\n[^#]*\bfor\b/g) || []).length;
      const hasSeparateOutputLoops = /for.+row|row_sum|rowsum|row\s+sum/i.test(solution) &&
                                     /for.+col|col_sum|colsum|col\s+sum/i.test(solution);
      if (!hasSeparateOutputLoops) {
        console.warn('[aiService] arrays_2d row/col sum solution may be wrong — retrying with explicit prompt');
        const rowColPrompt = systemPrompt + `\n\nCRITICAL FIX REQUIRED:
The problem asks to print ROW SUMS first (n lines) then COLUMN SUMS (m lines).
Your solution MUST:
1. Loop over each row, compute sum, print one integer per line.
2. Loop over each column, compute sum, print one integer per line.
3. Total output lines = n + m.
CORRECT Python:
n, m = map(int, input().split())
matrix = [list(map(int, input().split())) for _ in range(n)]
for i in range(n):
    print(sum(matrix[i]))
for j in range(m):
    print(sum(matrix[i][j] for i in range(n)))
Do NOT print a single total. Do NOT put row and column sums on the same line.`;
        try {
          const retryRaw = await callAI(rowColPrompt, userPrompt, { temperature: 0.05, maxTokens: 8192 }) || '';
          const retryParsed = parseSolutionAndInputs(retryRaw, questionText);
          if (retryParsed.solution) {
            finalSolution = retryParsed.solution;
            console.log('[aiService] arrays_2d row/col retry succeeded');
          }
        } catch (e) {
          console.warn('[aiService] arrays_2d retry failed:', e.message);
        }
      }
    }
  }

  // ── Pattern solution guard ─────────────────────────────────────────────────
  if (problemType === 'patterns' && solution) {

    // 1. Auto-fix suppressed row newlines (end='' / end=' ' on print calls)
    let fixed = solution;
    fixed = fixed.replace(/\bprint\((.+?),\s*end\s*=\s*["']\s*["']\s*\)/g, 'print($1)');
    fixed = fixed.replace(/\bprint\((.+?),\s*end\s*=\s*["']\s+["']\s*\)/g, 'print($1)');
    if (fixed !== solution) {
      console.warn('[aiService] Pattern solution had suppressed newlines — auto-fixed');
    }
    finalSolution = fixed;

    // 2. Structural validation
    // Count only STANDALONE loop lines (not list-comprehension `for` keywords).
    // A standalone loop is a line where `for` or `while` is the first keyword
    // after optional indentation — not embedded inside [ ... for ... ].
    const standaloneLoopCount = finalSolution.split('\n')
      .filter(line => /^\s*(for|while)\s+/.test(line))
      .length;

    const hasHardcodedStars = /["'][*#@]{3,}["']/.test(finalSolution);

    // Detect collect-then-join: list comprehension collecting rows + a single join print
    const hasListCollect = /\[\s*\w+\s+for\s+\w+\s+in\b/.test(finalSolution) &&
                           /['"]\s*\.\s*join\s*\(/.test(finalSolution) &&
                           !/print\s*\(/.test(finalSolution.split(/join\s*\(/)[1]?.slice(0, 60) || '');

    // Pascal-specific: must have at least 2 STANDALONE for loops (outer + inner dp loop).
    // List-comprehension row computation like [row[j-1]+row[j] for j in range(...)] must NOT
    // be the only loop structure — that avoids the nested-loop concept requirement.
    const subtype = detectPatternSubtype(questionText);
    const pascalListCompOnly = subtype === 'number_pascal' &&
      standaloneLoopCount < 2 &&
      /\[.+\bfor\b.+\bin\b.+\]/.test(finalSolution);  // has list comprehension but < 2 proper loops

    const validationFailed = standaloneLoopCount < 2 || hasHardcodedStars || hasListCollect || pascalListCompOnly;
    if (validationFailed) {
      console.warn(`[aiService] Pattern subtype [${subtype}] solution failed validation — retrying`);

      // One retry with a stronger, explicit subtype prompt injected into system prompt
      const retrySystem = systemPrompt + `\n\nREINFORCED REQUIREMENT: The solution MUST contain at least two loop constructs (nested). Do NOT use list comprehension that collects all rows. Do NOT hardcode any star string literal. The subtype is: ${subtype.toUpperCase()}.\n${PATTERN_SUBTYPE_PROMPTS[subtype] || ''}`;
      try {
        const retryRaw = await callAI(retrySystem, userPrompt, { temperature: 0.05, maxTokens: 8192 }) || '';
        const retryParsed = parseSolutionAndInputs(retryRaw, questionText);
        if (retryParsed.solution) {
          let retryFixed = retryParsed.solution;
          retryFixed = retryFixed.replace(/\bprint\((.+?),\s*end\s*=\s*["']\s*["']\s*\)/g, 'print($1)');
          retryFixed = retryFixed.replace(/\bprint\((.+?),\s*end\s*=\s*["']\s+["']\s*\)/g, 'print($1)');
          finalSolution = retryFixed;
          console.log(`[aiService] Pattern retry succeeded for subtype [${subtype}]`);
        }
      } catch (retryErr) {
        console.warn('[aiService] Pattern retry failed:', retryErr.message);
      }
    }
  }

  return {
    referenceSolution: finalSolution,
    testInputs: inputs
  };
}

/**
 * Convert array-like input to stdin format.
 * - 1D array [0,1,0,2] -> "0 1 0 2"
 * - 2D array [[1,0],[1,1]] -> "2 2\n1 0\n1 1" (rows cols, then rows)
 * - Array of arrays [[1,3],[2,6]] -> "1 3\n2 6" (merge intervals style)
 */
function normalizeInputForStdin(inputStr) {
  if (!inputStr || typeof inputStr !== 'string') return inputStr;
  const s = inputStr.trim();

  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];

      // 3D array: [[[1,2],[3,4]],[[5,6],[7,8]]] -> "2 2 2\n1 2\n3 4\n5 6\n7 8"
      if (Array.isArray(first) && Array.isArray(first[0])) {
        const x = parsed.length;
        const y = first.length;
        const z = first[0].length;
        const lines = [`${x} ${y} ${z}`];
        for (const layer of parsed) {
          for (const row of layer) {
            lines.push(row.map(String).join(' '));
          }
        }
        return lines.join('\n');
      }

      // 2D array: [[1,2,3],[4,5,6]] -> "2 3\n1 2 3\n4 5 6"
      if (Array.isArray(first)) {
        const rows = parsed.length;
        const cols = first.length;
        const lines = [`${rows} ${cols}`];
        for (const row of parsed) {
          lines.push(row.map(String).join(' '));
        }
        return lines.join('\n');
      }

      // 1D array: [3,1,4,1,5] -> "5\n3 1 4 1 5"
      if (parsed.every(x => typeof x === 'number' || (typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x)))) {
        return `${parsed.length}\n${parsed.map(String).join(' ')}`;
      }
    }
  } catch (_) { /* ignore */ }

  // 1D flat bracket: [1,2,3] without nested (fallback to space-sep no n prefix)
  const flat1D = s.match(/^\[[\d\s,.-]+\]$/);
  if (flat1D) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map(String).join(' ');
    } catch (_) { /* ignore */ }
  }

  return inputStr;
}

/**
 * Quick sanity-check on an AI-predicted output value.
 * Returns true if the value looks plausible for the given problem type.
 * @param {string} predicted
 * @param {string} problemType
 * @returns {boolean}
 */
function sanityCheckPrediction(predicted, problemType) {
  if (!predicted || typeof predicted !== 'string') return false;
  const t = (problemType || '').toLowerCase();

  // loops / math / recursion — expect a number somewhere in the output
  if (['loops', 'do_while', 'nested_loops', 'recursion', 'conditionals', 'basic_programming'].includes(t)) {
    return /\d/.test(predicted);
  }

  // patterns — expect at least one symbol character
  if (t === 'patterns') {
    return /[*#@=+\-|^~.]/.test(predicted);
  }

  // arrays / pointers — expect a number or bracket
  if (t.startsWith('arrays') || t === 'pointers') {
    return /[\d\[\]]/.test(predicted);
  }

  // generic — anything non-empty passes
  return predicted.trim().length > 0;
}

/**
 * Batch predict expected outputs for multiple inputs (one AI call instead of N).
 * Only called for inputs where Judge0 execution FAILED — never overrides a
 * verified Judge0 result.
 *
 * @param {string} questionText
 * @param {string[]} inputs          - ONLY the inputs where Judge0 failed
 * @param {string} referenceSolution - reference code to simulate
 * @param {string} language
 * @param {string} [problemType]     - used for sanity check
 * @returns {Promise<string[]>}      - same length as inputs, or 'NEEDS_REVIEW'
 */
async function predictExpectedOutputsBatch(questionText, inputs, referenceSolution, language, problemType = 'basic_programming') {
  if (!questionText || !inputs?.length || !referenceSolution) return [];

  const inputsJson = JSON.stringify(
    inputs.map((inp, i) => ({ n: i + 1, input: (inp || '').replace(/\n/g, '\\n') }))
  );

  const prompt = `You are simulating code execution. Given the EXACT code below, determine what it would print to stdout for each input.

PROBLEM:
${questionText.slice(0, 1500)}

REFERENCE CODE (${language}) — simulate this exactly:
\`\`\`
${referenceSolution.slice(0, 1800)}
\`\`\`

For each input, reply with ONLY what this code would print. No explanation. No markdown.
Reply as a JSON array: ["output1","output2",...] same order as inputs. Use "" for empty output.

INPUTS (in order): ${inputsJson}`;

  const raw = await callAI('Reply with ONLY a JSON array of strings: ["out1","out2",...]', prompt, { temperature: 0.02, maxTokens: 2048 });
  const parsed = safeParseJSON((raw || '').replace(/```json\s*|\s*```/g, '').trim(), null);

  if (!Array.isArray(parsed)) return inputs.map(() => 'NEEDS_REVIEW');

  return parsed.slice(0, inputs.length).map(s => {
    const trimmed = String(s || '').trim();
    if (!trimmed) return 'NEEDS_REVIEW';
    const ok = sanityCheckPrediction(trimmed, problemType);
    return ok ? trimmed : 'NEEDS_REVIEW';
  });
}

/**
 * Predict expected output via AI when execution fails (fallback for correct expected outputs)
 * @param {string} questionText - The problem
 * @param {string} input - Test input
 * @param {string} referenceSolution - The reference code (may have failed to run)
 * @param {string} language - python, cpp, etc.
 * @returns {Promise<string>} Expected output
 */
async function predictExpectedOutputViaAI(questionText, input, referenceSolution, language) {
  if (!questionText || !input || !referenceSolution) return '';
  const prompt = `You are a programming assistant. Given this problem, input, and reference solution, determine the EXACT expected output.

PROBLEM (excerpt):
${questionText.slice(0, 3000)}

REFERENCE SOLUTION (${language}):
\`\`\`
${referenceSolution.slice(0, 2000)}
\`\`\`

INPUT (stdin, use \\n for newlines):
${input.replace(/\n/g, '\\n')}

Respond with ONLY the exact expected output (what the program would print to stdout). No explanation, no markdown, no code. Just the raw output.`;
  const raw = await callAI(
    'You output only the exact expected stdout. No extra text.',
    prompt,
    { temperature: 0.02, maxTokens: 512 }
  );
  return (raw || '').trim();
}

/**
 * Generate test cases for a programming question
 * @param {string} questionText - The programming question
 * @param {string} language - python, cpp, c, java, javascript
 * @param {string} problemType - algorithm | data_structure | oop
 * @returns {Promise<{testCases: Array<{input: string, expectedOutput: string, description: string}>, referenceSolution: string}>}
 */
async function generateTestCases(questionText, language = 'python', problemType = 'basic_programming', requiredConcepts = []) {
  if (!questionText || questionText.trim().length < 5) {
    return { testCases: [], referenceSolution: '' };
  }

  if (!groqClient && !geminiModel) {
    throw new Error('No AI configured. Add GROQ_API_KEY or GEMINI_API_KEY to .env');
  }

  // Reference solution is generated and executed in Python for maximum reliability —
  // Python gives predictable stdout (no trailing spaces, consistent newlines).
  // Student submissions default to C++ but can be any language;
  // outputs are normalised before comparison — language-independent.
  const REF_LANG = 'python';

  try {
    let referenceSolution = '';
    let testInputs = [];

    // OOP: Two-phase generation - solution first, then inputs that match the solution's format
    if (problemType === 'oop') {
      try {
        const solResult = await generateSolutionOnly(questionText, REF_LANG, problemType, requiredConcepts);
        referenceSolution = solResult.referenceSolution;
        if (referenceSolution) {
          testInputs = await generateInputsForSolution(questionText, referenceSolution, REF_LANG, problemType);
          if (testInputs.length > 0) {
            console.log('OOP two-phase: generated', testInputs.length, 'inputs matching solution format');
          }
        }
      } catch (oopErr) {
        console.warn('OOP two-phase failed:', oopErr.message);
      }
    }

    // Fallback: single-shot generation (or when two-phase produced nothing)
    if (!referenceSolution || testInputs.length === 0) {
      try {
        const result = await generateReferenceSolutionAndInputs(questionText, REF_LANG, problemType, requiredConcepts);
        referenceSolution = referenceSolution || result.referenceSolution;
        if (testInputs.length === 0) testInputs = result.testInputs;
      } catch (parseErr) {
        console.warn('First parse attempt failed:', parseErr.message);
      }
    }

    // Retry up to 2 times with different prompts — always Python (ref solution)
    for (let attempt = 0; attempt < 2 && (!referenceSolution || testInputs.length === 0); attempt++) {
      console.warn(`AI retry ${attempt + 1}/2...`);
      try {
        const typeHint = problemType === 'oop'
          ? 'For OOP BANKING: Input = operation lines (CREATE_SAVINGS 1 John 1000, DEPOSIT 1 500, WITHDRAW 2 100). Each test case = different operations. Each expectedOutput = FULL different output. For OOP GIFT: "Rose 10", "GUCCI 5" per line.'
          : (problemType === 'data_structure'
            ? 'For data structures (BST, graph, heap, etc.): use "n" then elements, or "n m" for graph edges, or operation lines. Use \\n for multi-line.'
            : 'For arrays use space-separated: "0 1 0 2" not "[0,1,0,2]".');
        const conceptStr = (requiredConcepts || []).length > 0 ? ` Use: ${(requiredConcepts || []).join(', ')}. Do not hardcode.` : '';
        const isValidationRetry = /valid|invalid|check|verif|format|rule|must (start|contain|have|be)|length (must|should)|character/i.test(questionText);
        const validationStr = isValidationRetry ? ' VALIDATION: print ONLY the result (e.g. "VALID" or "INVALID: reason"). Never echo input.' : '';
        const prompts = [
          { sys: `Format: 1) Code in \`\`\` block. 2) TEST_INPUTS: [{"input":"x","expectedOutput":"y","description":"z"}]. Include expectedOutput for each. ${typeHint}${conceptStr}${validationStr}`, usr: `Problem (${problemType}):\n${questionText.slice(0, 2000)}\n\nPython solution + 4-5 test inputs with expectedOutput. Code block first, then TEST_INPUTS: [{"input":"...","expectedOutput":"...","description":"..."}]` },
          { sys: `Output: 1) Code in triple backticks. 2) Line "TEST_INPUTS:" then valid JSON with input, expectedOutput, description. ${typeHint}${validationStr}`, usr: `Write Python code for:\n${questionText.slice(0, 1500)}\n\nThen: TEST_INPUTS: [{"input":"...","expectedOutput":"...","description":"..."}]` }
        ];
        const p = prompts[Math.min(attempt, prompts.length - 1)];
        const retryRaw = await callAI(p.sys, p.usr, { temperature: 0.02 });
        const retryParsed = parseSolutionAndInputs(retryRaw || '', questionText);
        if (retryParsed.solution) referenceSolution = retryParsed.solution;
        if (retryParsed.inputs.length > 0) testInputs = retryParsed.inputs;
      } catch (retryErr) {
        console.warn('Retry failed:', retryErr.message);
      }
    }

    if (!referenceSolution || testInputs.length === 0) {
      return { testCases: [], referenceSolution: '' };
    }

    const TIME_LIMIT = 3; // 3 seconds per run

    // Normalize reference solution stdout before storing as expected output.
    // trimEnd per line removes trailing spaces from Python print() while
    // preserving internal newlines for multi-line outputs (patterns, etc.).
    const normalizeStdout = (raw) => {
      if (!raw) return '';
      return String(raw)
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(line => line.trimEnd())
        .filter((line, i, arr) => i < arr.length - 1 || line.length > 0) // drop trailing blank lines
        .join('\n')
        .trim();
    };

    // Run the Python reference solution against each test input via Judge0.
    // Using Python (REF_LANG) every time — student can submit in any language;
    // their output is normalized before comparison, so language differences vanish.
    const runOne = async (tc) => {
      let inputToUse = tc.input;
      try {
        let runResult = await codeExecutionService.runCode(referenceSolution, inputToUse, REF_LANG, TIME_LIMIT);
        const execOutput = runResult.error ? '' : normalizeStdout(runResult.stdout);
        if (execOutput) return { input: inputToUse, expectedOutput: execOutput, description: tc.description ?? '' };
        const normalized = normalizeInputForStdin(tc.input);
        if (normalized !== tc.input) {
          runResult = await codeExecutionService.runCode(referenceSolution, normalized, REF_LANG, TIME_LIMIT);
          if (!runResult.error && runResult.stdout) return { input: normalized, expectedOutput: normalizeStdout(runResult.stdout), description: tc.description ?? '' };
        }
      } catch (err) {
        console.warn('Test case execution failed:', tc.input?.slice(0, 40), err.message);
      }
      return { input: inputToUse, expectedOutput: '', description: tc.description ?? '', needsAI: !!questionText };
    };
    const results = await Promise.all(testInputs.map(tc => runOne(tc)));

    // Batch AI prediction ONLY for cases where Judge0 execution truly failed
    // (never override a verified Judge0 output — only fill empty slots)
    const failed = results.filter(r => !r.expectedOutput && r.needsAI);
    if (failed.length > 0 && questionText) {
      try {
        const batchOutputs = await predictExpectedOutputsBatch(
          questionText, failed.map(f => f.input), referenceSolution, REF_LANG, problemType
        );
        failed.forEach((f, i) => {
          const predicted = batchOutputs[i];
          if (predicted && predicted !== 'NEEDS_REVIEW') {
            f.expectedOutput = predicted;
          } else if (predicted === 'NEEDS_REVIEW') {
            f.expectedOutput = 'NEEDS_REVIEW';  // stored for teacher to verify
          }
        });
      } catch (_) {
        for (let i = 0; i < Math.min(2, failed.length); i++) {
          try {
            const out = await predictExpectedOutputViaAI(questionText, failed[i].input, referenceSolution, REF_LANG);
            if (out) failed[i].expectedOutput = out;
          } catch (_) {}
        }
      }
    }

    const testCases = results
      .filter(r => r.expectedOutput)
      .map(r => ({
        input: r.input,
        expectedOutput: r.expectedOutput,
        description: r.description,
        // Flag test cases that need manual teacher review (AI sanity check failed)
        needsReview: r.expectedOutput === 'NEEDS_REVIEW'
      }));
    return { testCases, referenceSolution };
  } catch (err) {
    console.error('Groq generateTestCases error:', err);
    const msg = err.message || 'Unknown error';
    if (msg.includes('JSON') || msg.includes('position') || msg.includes('Unexpected')) {
      throw new Error('AI returned invalid format. Try again or add test cases manually.');
    }
    throw new Error('AI test case generation failed: ' + msg);
  }
}

/**
 * Generate 3 best solutions for a problem (different approaches)
 * @param {string} questionText - The programming question
 * @param {string} language - python, cpp, etc.
 * @returns {Promise<{solutions: Array<{label: string, code: string}>}>}
 */
async function generateThreeSolutions(questionText, language = 'python') {
  if (!questionText || questionText.trim().length < 5) {
    return { solutions: [] };
  }
  if (!groqClient && !geminiModel) {
    throw new Error('No AI configured. Add GROQ_API_KEY or GEMINI_API_KEY to .env');
  }

  const langHint = LANGUAGE_HINTS[language] || LANGUAGE_HINTS.python;

  const systemPrompt = `You generate 3 different ${language} solutions for a problem. Each solution must read from stdin and print to stdout.

OUTPUT FORMAT (strict):
SOLUTION_1: [short label, e.g. "Efficient approach"]
\`\`\`${language}
[code]
\`\`\`

SOLUTION_2: [short label, e.g. "Readable approach"]
\`\`\`${language}
[code]
\`\`\`

SOLUTION_3: [short label, e.g. "Alternative method"]
\`\`\`${language}
[code]
\`\`\`

Provide 3 different approaches: one optimized for efficiency, one for readability, one with a different algorithm. ${langHint}`;

  const userPrompt = `Generate 3 different ${language} solutions for this problem. Each must read stdin and print stdout.

PROBLEM:
${questionText.slice(0, 3500)}`;

  const raw = await callAI(systemPrompt, userPrompt, { temperature: 0.2 }) || '';
  const solutions = [];

  const blocks = raw.split(/(?=SOLUTION_\d+:)/i);
  for (const block of blocks) {
    const labelMatch = block.match(/SOLUTION_\d+:\s*([^\n`]+)/i);
    const codeMatch = block.match(/```(?:\w+)?\s*([\s\S]*?)```/);
    if (labelMatch && codeMatch && codeMatch[1].trim().length > 5) {
      solutions.push({
        label: labelMatch[1].trim(),
        code: codeMatch[1].trim()
      });
    }
  }

  if (solutions.length === 0 && raw.includes('```')) {
    const allBlocks = raw.matchAll(/```(?:\w+)?\s*([\s\S]*?)```/g);
    let i = 0;
    for (const m of allBlocks) {
      if (m[1].trim().length > 10 && CODE_PATTERNS.test(m[1])) {
        solutions.push({ label: `Solution ${i + 1}`, code: m[1].trim() });
        i++;
        if (i >= 3) break;
      }
    }
  }

  return { solutions: solutions.slice(0, 3) };
}

function isConfigured() {
  return !!(GROQ_API_KEY || GEMINI_API_KEY);
}

/**
 * Analyze student solution for partial credit when test cases don't all pass.
 * Compares with reference solution and required concepts - gives marks based on correctness and concept usage.
 * @param {string} problemText - The programming problem
 * @param {string} studentCode - Student's solution
 * @param {string} referenceSolution - Correct reference solution
 * @param {string[]} requiredConcepts - e.g. ['loops', 'conditionals']
 * @param {Array<{passed: boolean, score: number}>} testCaseResults - Per-test-case results
 * @returns {Promise<number>} Score 0-100 for partial credit
 */
async function analyzeSolutionForPartialCredit(problemText, studentCode, referenceSolution, requiredConcepts = [], testCaseResults = []) {
  if (!problemText || !studentCode) return 0;
  const passedCount = testCaseResults.filter(r => r.passed).length;
  const totalCount = testCaseResults.length || 1;
  const testCasePct = totalCount > 0 ? (passedCount / totalCount) * 100 : 0;
  const avgScore = testCaseResults.length > 0
    ? testCaseResults.reduce((s, r) => s + (r.score ?? (r.passed ? 100 : 0)), 0) / testCaseResults.length
    : 0;

  if (!groqClient && !geminiModel) {
    return Math.round(Math.max(testCasePct, avgScore));
  }
  if (!referenceSolution || referenceSolution.trim().length < 20) {
    return Math.round(Math.max(testCasePct, avgScore));
  }
  try {
    const conceptsStr = requiredConcepts.length > 0 ? requiredConcepts.join(', ') : 'none specified';
    const sys = `You are a programming grader. A student's solution did not pass all test cases. Compare it with the reference solution and required concepts. Give a score 0-100 considering:
- Test case correctness: ${passedCount}/${totalCount} passed (${Math.round(testCasePct)}%).
- Required concepts (${conceptsStr}): Did the student use them? Give partial credit if they tried (e.g. used loops, conditionals) even if output is wrong.
- Logic similarity to reference: Is the approach correct? Minor bugs vs completely wrong.
- Be fair: If student used correct concepts and got close, give 40-70. If completely wrong approach, give 10-30. If most test cases pass, give 70-95.`;
    const usr = `PROBLEM:
${problemText.slice(0, 1500)}

REFERENCE SOLUTION:
\`\`\`
${referenceSolution.slice(0, 2500)}
\`\`\`

STUDENT SOLUTION:
\`\`\`
${studentCode.slice(0, 2500)}
\`\`\`

Test cases: ${passedCount}/${totalCount} passed. Required concepts: ${conceptsStr}.
Give a score 0-100. Reply with ONLY the number.`;
    const raw = await callAI(sys, usr, { temperature: 0.1, maxTokens: 10 }) || '';
    const num = parseInt(String(raw).replace(/\D/g, ''), 10);
    if (isNaN(num)) return Math.round(Math.max(testCasePct, avgScore));
    const aiScore = Math.max(0, Math.min(100, num));
    return Math.round(Math.max(aiScore, testCasePct, avgScore * 0.5));
  } catch (err) {
    console.warn('analyzeSolutionForPartialCredit failed:', err.message);
    return Math.round(Math.max(testCasePct, avgScore));
  }
}

/**
 * Analyze code that failed to compile/run - give partial credit for correct logic
 * @param {string} problemText - The programming problem description
 * @param {string} sourceCode - Student's code (has syntax/compile error)
 * @param {string} errorMessage - The compile/runtime error
 * @returns {Promise<number>} Score 0-100 based on logic correctness
 */
async function analyzeCodeLogicForPartialCredit(problemText, sourceCode, errorMessage) {
  if (!problemText || !sourceCode) return 0;
  try {
    const systemPrompt = `You are a programming grader. A student's code failed to run (syntax/compile error). 
Analyze the code's LOGIC only - ignore syntax errors. Grade 0-100 based on:
- Does the approach solve the problem correctly?
- Are algorithms/data structures appropriate?
- Is the overall logic sound?
Reply with ONLY a number 0-100, nothing else.`;

    const userPrompt = `PROBLEM:
${problemText.slice(0, 2000)}

STUDENT CODE:
\`\`\`
${sourceCode.slice(0, 3000)}
\`\`\`

ERROR: ${(errorMessage || '').slice(0, 500)}

Give a score 0-100 for logic correctness (ignore syntax). Reply with only the number.`;

    const raw = await callAI(systemPrompt, userPrompt, { temperature: 0.1, maxTokens: 10 }) || '';
    const num = parseInt(String(raw).replace(/\D/g, ''), 10);
    if (isNaN(num)) return 0;
    return Math.max(0, Math.min(100, num));
  } catch (err) {
    console.warn('AI logic analysis failed:', err.message);
    return 0;
  }
}

/**
 * Analyze problem text to auto-detect required programming concepts and question type
 * Used for: required concepts (loops, nested_loops, arrays, pointers, conditionals),
 * is_pattern_question (detect hardcoding), and problem type for test case generation
 * @param {string} problemText - The programming question text
 * @returns {Promise<{requiredConcepts: string[], isPatternQuestion: boolean, problemType: string}>}
 */
async function analyzeProblemRequirements(problemText) {
  if (!problemText || problemText.trim().length < 10) {
    return { requiredConcepts: [], isPatternQuestion: false, problemType: 'basic_programming' };
  }
  if (!groqClient && !geminiModel) {
    return { requiredConcepts: [], isPatternQuestion: false, problemType: 'basic_programming' };
  }

  const sys = `You analyze programming problems and infer what concepts a correct solution must use.
The problem statement will NOT say which concepts to use — you must figure it out from the logic and I/O.

VALID concept keys (pick all that apply):
  loops           — any for/while/do-while loop
  nested_loops    — loop inside a loop (required for patterns, matrix traversal)
  do_while        — do-while loop specifically (C/C++: at least one execution guaranteed)
  switch          — switch/case statement (integer or char dispatch)
  arrays          — 1D array/list usage
  arrays_2d       — 2D matrix / grid
  arrays_3d       — 3D array
  pointers        — C/C++ pointer variables (* / &)
  conditionals    — if/else/elif branching
  recursion       — function calls itself

VALID problemType (pick ONE best match):
  loops           — primary concept is a loop (for/while/do-while), no arrays needed
  conditionals    — primary concept is branching (if/else/switch), simple I/O
  recursion       — function must call itself
  arrays_1d       — operates on a 1D array/list
  arrays_2d       — operates on a 2D matrix
  arrays_3d       — operates on a 3D array
  pointers        — C/C++ pointers are central
  patterns        — output is a visual character pattern (stars, numbers, shapes)
  basic_programming — mixed or unclear; simple I/O
  algorithm       — sorting, searching, mathematical algorithm on arrays
  data_structure  — BST, graph, linked list, stack, queue, heap

is_pattern_question: true ONLY if the output is a visual character pattern that a student might hardcode as a string.

Reply with ONLY valid JSON, no markdown, no explanation.`;

  const usr = `Analyze and return JSON: {"requiredConcepts":["..."],"isPatternQuestion":false,"problemType":"..."}
Problem:
${problemText.slice(0, 2500)}`;

  try {
    const raw = await callAI(sys, usr, { temperature: 0.05, maxTokens: 300 });
    const parsed = safeParseJSON(raw, { requiredConcepts: [], isPatternQuestion: false, problemType: 'basic_programming' });
    const concepts = Array.isArray(parsed.requiredConcepts) ? parsed.requiredConcepts : [];
    const validConcepts = ['loops', 'nested_loops', 'do_while', 'switch', 'arrays', 'arrays_2d', 'arrays_3d', 'pointers', 'conditionals', 'recursion'];
    const filtered = concepts.map(c => String(c).toLowerCase().replace(/\s/g, '_')).filter(c => validConcepts.includes(c));
    const validTypes = ['basic_programming', 'algorithm', 'data_structure', 'oop', 'loops', 'conditionals', 'recursion', 'arrays_1d', 'arrays_2d', 'arrays_3d', 'pointers', 'patterns'];
    const pType = validTypes.includes(parsed.problemType) ? parsed.problemType : 'basic_programming';
    return {
      requiredConcepts: filtered,
      isPatternQuestion: !!parsed.isPatternQuestion || pType === 'patterns',
      problemType: pType
    };
  } catch (err) {
    console.warn('analyzeProblemRequirements failed:', err.message);
    return { requiredConcepts: [], isPatternQuestion: false, problemType: 'basic_programming' };
  }
}

/**
 * Detect if an expected output string looks like a collapsed single-line
 * pattern output that should have been multi-line.
 *
 * Heuristics:
 *  - Output has no \n (single line)
 *  - Contains at least 3 space-separated tokens
 *  - Tokens form a triangular count pattern (1, 2, 3, ...) or repeated groups
 *    e.g. "1 2 2 3 3 3" looks like rows 1, 2, 3 were joined with spaces
 */
function looksLikeCollapsedPatternOutput(expectedOutput) {
  if (!expectedOutput || typeof expectedOutput !== 'string') return false;
  const s = expectedOutput.trim();
  if (s.includes('\n')) return false;  // already multi-line — not our bug
  const tokens = s.split(/\s+/);
  if (tokens.length < 3) return false;

  // Check triangular grouping: groups of size 1, 2, 3, ... using repeated value per group
  // e.g. "1 2 2 3 3 3" → group1=[1], group2=[2,2], group3=[3,3,3]
  let idx = 0;
  let row = 1;
  let isTriangular = true;
  while (idx < tokens.length) {
    const chunk = tokens.slice(idx, idx + row);
    if (chunk.length !== row) { isTriangular = false; break; }
    const allSame = chunk.every(t => t === chunk[0]);
    if (!allSame) { isTriangular = false; break; }
    idx += row;
    row++;
  }
  if (isTriangular && idx === tokens.length) return true;

  // Fallback: repeated symbol characters in a single line (e.g. "* ** *** ****")
  if (/^[*#@=+\-|^~.\s]+$/.test(s) && tokens.length >= 3) return true;

  return false;
}

/**
 * Re-run existing test cases for a pattern question through Judge0 using
 * the stored reference solution and update any that have collapsed/wrong
 * expected outputs.
 *
 * Called from the IPC handler `ai:fix-pattern-test-cases`.
 *
 * @param {string} referenceSolution - Reference code stored in DB
 * @param {Array<{test_case_id:string, input_data:string, expected_output:string}>} testCases
 * @param {string} language
 * @returns {Promise<Array<{testCaseId:string, oldOutput:string, newOutput:string, fixed:boolean}>>}
 */
async function fixPatternTestCases(referenceSolution, testCases, language = 'python') {
  if (!referenceSolution || !testCases || testCases.length === 0) return [];

  const normalizeStdout = (raw) => (raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const TIME_LIMIT = 5;
  const results = [];

  for (const tc of testCases) {
    const oldOutput = (tc.expected_output || '').trim();
    const needsFix = looksLikeCollapsedPatternOutput(oldOutput);

    if (!needsFix) {
      results.push({ testCaseId: tc.test_case_id, oldOutput, newOutput: oldOutput, fixed: false });
      continue;
    }

    try {
      const runResult = await codeExecutionService.runCode(
        referenceSolution, tc.input_data, language, TIME_LIMIT
      );
      const newOutput = runResult.error ? '' : normalizeStdout(runResult.stdout);

      if (newOutput && newOutput !== oldOutput) {
        results.push({ testCaseId: tc.test_case_id, oldOutput, newOutput, fixed: true });
        console.log(`[fixPatternTestCases] Fixed test case ${tc.test_case_id}: "${oldOutput}" → "${newOutput.replace(/\n/g, '\\n')}"`);
      } else if (!newOutput) {
        // Execution failed — keep old, flag as unfixable
        results.push({ testCaseId: tc.test_case_id, oldOutput, newOutput: oldOutput, fixed: false, error: runResult.error || 'Empty output' });
      } else {
        // Output was already correct
        results.push({ testCaseId: tc.test_case_id, oldOutput, newOutput, fixed: false });
      }
    } catch (err) {
      console.warn(`[fixPatternTestCases] Error re-running test case ${tc.test_case_id}:`, err.message);
      results.push({ testCaseId: tc.test_case_id, oldOutput, newOutput: oldOutput, fixed: false, error: err.message });
    }
  }

  return results;
}

/**
 * Generate a concise teacher-focused AI summary for an evaluation.
 * Falls back gracefully to a rule-based summary if AI is unavailable.
 *
 * @param {object} evidence - { questionTitle, language, score, maxScore,
 *   passedCount, totalCount, hardcoded, hardcodedReason,
 *   conceptPassed, conceptDetails, testResults, sourceCode }
 * @param {object} options  - { style: 'brief'|'detailed' }
 * @returns {Promise<{ text: string, confidence: 'ai'|'fallback' }>}
 */
async function generateSubmissionSummary(evidence, options = {}) {
  const {
    questionTitle = 'Unknown question',
    language = 'unknown',
    score = 0, maxScore = 100,
    passedCount = 0, totalCount = 0,
    hardcoded = false, hardcodedReason = '',
    conceptPassed = true, conceptDetails = null,
    testResults = [],
    sourceCode = ''
  } = evidence || {};

  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const failedTCs = testResults.filter(r => !r.passed);
  const errored   = testResults.filter(r => r.stderr || r.exit_code);

  // ── AI path ───────────────────────────────────────────────────────────────
  if (groqClient || geminiModel) {
    const style = options.style === 'detailed' ? 'detailed (8-10 lines)' : 'concise (5-6 lines)';
    const sys = `You are a teaching assistant summarising a student programming submission for a teacher. Be factual, neutral, and ${style}. Do not repeat section headers. Write plain prose.`;

    const tcSample = failedTCs.slice(0, 3).map((r, i) =>
      `  TC${i + 1}: input="${(r.input_data || '').slice(0, 60)}", expected="${(r.expected_output || '').slice(0, 40)}", got="${(r.stdout || r.actual_output || '').slice(0, 40)}"${r.stderr ? `, error="${r.stderr.slice(0, 60)}"` : ''}`
    ).join('\n');

    const conceptStr = conceptDetails
      ? Object.entries(conceptDetails)
          .filter(([k]) => !['message', 'complianceScore'].includes(k))
          .map(([k, v]) => `${k}:${v ? '✓' : '✗'}`)
          .join(' ')
      : '';

    const usr = `Question: ${questionTitle} (${language})
Score: ${score}/${maxScore} (${pct}%)
Test cases: ${passedCount}/${totalCount} passed
Hardcoded: ${hardcoded ? `YES — ${hardcodedReason}` : 'No'}
Concept checks: ${conceptStr || 'none required'}
${failedTCs.length > 0 ? `Failed test cases (sample):\n${tcSample}` : 'All test cases passed.'}
Code length: ${sourceCode.length} chars, ${sourceCode.split('\n').length} lines

Write a ${style} teacher-facing summary covering: overall result, what the student did right/wrong, key failing patterns (if any), and one actionable feedback point.`;

    try {
      const raw = await callAI(sys, usr, { temperature: 0.3, maxTokens: 512 });
      if (raw && raw.trim().length > 20) {
        return { text: raw.trim(), confidence: 'ai' };
      }
    } catch (err) {
      console.warn('[generateSubmissionSummary] AI call failed, using fallback:', err.message);
    }
  }

  // ── Rule-based fallback ───────────────────────────────────────────────────
  const lines = [];
  lines.push(`Question: ${questionTitle} | Language: ${language} | Score: ${score}/${maxScore} (${pct}%)`);
  if (hardcoded) {
    lines.push(`⚠ Hardcoding detected: ${hardcodedReason || 'Output appears hardcoded rather than computed.'}`);
    lines.push('Score was overridden to 0. Student should rewrite solution using proper algorithmic logic.');
  } else if (passedCount === totalCount && totalCount > 0) {
    lines.push(`All ${totalCount} test cases passed. Solution appears correct.`);
    if (!conceptPassed) lines.push('Note: Required programming concepts were not all detected in the code.');
  } else {
    lines.push(`${passedCount}/${totalCount} test cases passed.`);
    if (failedTCs.length > 0) {
      const sample = failedTCs[0];
      lines.push(`First failure — input: "${(sample.input_data || '').slice(0, 50)}", expected: "${(sample.expected_output || '').slice(0, 40)}", got: "${(sample.stdout || sample.actual_output || '').slice(0, 40)}"`);
    }
    if (errored.length > 0) lines.push(`${errored.length} test case(s) produced runtime errors or non-zero exit codes.`);
    if (!conceptPassed) lines.push('Required programming concept(s) were not detected — score may have been reduced.');
  }
  lines.push(`(Summary auto-generated — AI service unavailable)`);

  return { text: lines.join('\n'), confidence: 'fallback' };
}

module.exports = {
  extractQuestionsFromText,
  extractQuestionAtIndex,
  generateTestCases,
  generateThreeSolutions,
  analyzeCodeLogicForPartialCredit,
  analyzeSolutionForPartialCredit,
  analyzeProblemRequirements,
  getConceptPrompt,
  detectProblemType,
  detectPatternSubtype,
  fixPatternTestCases,
  extractMinimalProblemInfo,
  generateSubmissionSummary,
  isConfigured
};
