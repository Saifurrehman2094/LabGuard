/**
 * AI Service - Question extraction & test case generation
 * Uses Groq (free) - fallback to Gemini if configured
 * Test cases: AI generates reference solution + inputs; we run solution via Judge0 for correct expectedOutput.
 */

const Groq = require('groq-sdk');
const codeExecutionService = require('./codeExecutionService');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let groqClient = null;
if (GROQ_API_KEY) {
  groqClient = new Groq({ apiKey: GROQ_API_KEY });
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
 * Extract programming questions from exam text (PDF or pasted)
 * @param {string} rawText - Text extracted from PDF or pasted by teacher
 * @returns {Promise<Array<{id: number, text: string}>>}
 */
async function extractQuestionsFromText(rawText) {
  if (!rawText || rawText.trim().length < 10) {
    return [];
  }

  const text = rawText.slice(0, 8000); // Limit token usage

  if (groqClient) {
    try {
      const chat = await groqClient.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: 'You are an exam parser. Extract programming questions. Respond with ONLY a valid JSON array - no markdown, no code blocks, no extra text. Escape quotes in strings (use \\"). No trailing commas.'
          },
          {
            role: 'user',
            content: `Extract all programming/coding questions from this exam text.
Return ONLY a JSON array: [{"id": 1, "text": "Full question text here"}, ...]
Each object must have "id" (number) and "text" (string).

EXAM TEXT:
${text}`
          }
        ]
      });

      const raw = chat.choices[0].message.content?.trim() || '[]';
      const parsed = safeParseJSON(raw, []);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('Groq extractQuestions error:', err);
      throw new Error('AI extraction failed: ' + (err.message || 'Unknown error'));
    }
  }

  throw new Error('No AI API key configured. Set GROQ_API_KEY in .env');
}

const LANGUAGE_HINTS = {
  python: 'Python: use input() or sys.stdin, print() for output',
  cpp: 'C++: use cin/cout or getline, include <iostream>',
  c: 'C: use scanf/printf or fgets',
  java: 'Java: use Scanner and System.out, wrap in a class with main',
  javascript: 'JavaScript: use readline or process.stdin for Node.js'
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
    // 2a. TEST_INPUTS: followed by JSON array
    const testInputsMatch = raw.match(/TEST_INPUTS:\s*(\[[\s\S]*?\])/i);
    if (testInputsMatch) {
      const parsed = safeParseJSON(testInputsMatch[1], []);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inputs = parsed.map(t => ({
          input: String(t.input ?? t.stdin ?? t.value ?? '').trim(),
          description: String(t.description ?? t.desc ?? t.label ?? '').trim()
        }));
      }
    }

    // 2b. Find JSON array with "input" key (any array in response)
    if (inputs.length === 0) {
      const extracted = extractJsonArray(raw);
      if (extracted.length > 0) {
        inputs = extracted.map(t => ({
          input: String(t.input ?? t.stdin ?? t.value ?? '').trim(),
          description: String(t.description ?? t.desc ?? t.label ?? '').trim()
        }));
      }
    }

    // 2c. Fallback: extract "input" values with regex (handles broken JSON)
    if (inputs.length === 0 && raw.includes('"input"')) {
      const inputMatches = raw.matchAll(/"input"\s*:\s*"((?:[^"\\]|\\.)*)"?/g);
      for (const m of inputMatches) {
        const val = (m[1] || '').replace(/\\"/g, '"').trim();
        if (val.length > 0 && val.length < 200) inputs.push({ input: val, description: `Case ${inputs.length + 1}` });
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
          inputs.push({ input: val, description: `From problem` });
        }
      }
    }
  }

  return { solution, inputs };
}

/**
 * Generate reference solution + test inputs from AI (no expected outputs - we compute them)
 * Uses delimiter format to avoid JSON escaping issues when code contains quotes.
 * @param {string} questionText - The programming question
 * @param {string} language - python, cpp, c, java, javascript
 * @returns {Promise<{referenceSolution: string, testInputs: Array<{input: string, description: string}>}>}
 */
async function generateReferenceSolutionAndInputs(questionText, language = 'python') {
  if (!questionText || questionText.trim().length < 5) {
    return { referenceSolution: '', testInputs: [] };
  }

  const langHint = LANGUAGE_HINTS[language] || LANGUAGE_HINTS.python;

  const chat = await groqClient.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    temperature: 0.08,
    max_tokens: 4096,
    messages: [
      {
        role: 'system',
        content: `You are a programming assistant. Generate a correct ${language} solution and test inputs.

STRICT OUTPUT FORMAT (follow exactly):
1. First, a code block with triple backticks. Put ONLY the ${language} code inside. Code must read from stdin and print to stdout.
2. After the code block, on a new line, write exactly: TEST_INPUTS:
3. On the next line, a JSON array. Format: [{"input": "value", "description": "label"}, ...]
   - "input" is the stdin (use \\n for newline). Use simple values: numbers, short strings.
   - For ARRAY inputs (e.g. trapping rain water, max subarray): use SPACE-SEPARATED numbers on one line, e.g. "0 1 0 2 1 0 1 3 2 1 2 1" NOT "[0,1,0,2,1]". Solutions read with input().split() or similar.
   - "description" is a short label like "basic" or "edge case"
   - CRITICAL: Always close each string with a quote. For inputs like ()[] or {[]}, the JSON must be: {"input": "()[]", "description": "balanced"} - note the closing " before the comma.
   - Generate 5-6 test cases covering normal, edge, and boundary cases

Example for "double the number":
\`\`\`python
n = int(input())
print(n * 2)
\`\`\`

TEST_INPUTS:
[{"input": "5", "description": "basic"}, {"input": "0", "description": "zero"}, {"input": "100", "description": "large"}]

Example for "trapping rain water" (array input):
\`\`\`python
heights = list(map(int, input().split()))
# ... solution ...
\`\`\`

TEST_INPUTS:
[{"input": "0 1 0 2 1 0 1 3 2 1 2 1", "description": "classic"}, {"input": "4 2 0 3 2 5", "description": "another"}]

${langHint}`
      },
      {
        role: 'user',
        content: `Generate a ${language} solution and 5-6 test inputs for this problem. Output format: code block first, then TEST_INPUTS: then JSON array.

PROBLEM:
${questionText.slice(0, 3500)}`
      }
    ]
  });

  const raw = chat.choices[0].message.content?.trim() || '';
  const { solution, inputs } = parseSolutionAndInputs(raw, questionText);

  return {
    referenceSolution: solution,
    testInputs: inputs
  };
}

/**
 * Convert array-like input to space-separated format for stdin.
 * AI sometimes returns "[0,1,0,2]" but solutions expect "0 1 0 2".
 */
function normalizeInputForStdin(inputStr) {
  if (!inputStr || typeof inputStr !== 'string') return inputStr;
  const s = inputStr.trim();
  // Match [1,2,3] or [1, 2, 3] - array of numbers
  const arrMatch = s.match(/^\[[\d\s,.-]+\]$/);
  if (arrMatch) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.every(x => typeof x === 'number' || (typeof x === 'string' && /^-?\d+$/.test(x)))) {
        return arr.map(String).join(' ');
      }
    } catch (_) { /* ignore */ }
  }
  return inputStr;
}

/**
 * Generate test cases for a programming question
 * Uses execution: AI generates reference solution + inputs; we run solution via Judge0 to get correct expectedOutput.
 * @param {string} questionText - The programming question
 * @param {string} language - python, cpp, c, java, javascript
 * @returns {Promise<{testCases: Array<{input: string, expectedOutput: string, description: string}>, referenceSolution: string}>}
 */
async function generateTestCases(questionText, language = 'python') {
  if (!questionText || questionText.trim().length < 5) {
    return { testCases: [], referenceSolution: '' };
  }

  if (!groqClient) {
    throw new Error('No AI API key configured. Set GROQ_API_KEY in .env');
  }

  try {
    let referenceSolution = '';
    let testInputs = [];

    try {
      const result = await generateReferenceSolutionAndInputs(questionText, language);
      referenceSolution = result.referenceSolution;
      testInputs = result.testInputs;
    } catch (parseErr) {
      console.warn('First parse attempt failed:', parseErr.message);
    }

    // Retry up to 2 times with different prompts
    for (let attempt = 0; attempt < 2 && (!referenceSolution || testInputs.length === 0) && groqClient; attempt++) {
      console.warn(`AI retry ${attempt + 1}/2...`);
      try {
        const prompts = [
          { sys: 'Format: 1) Code in ``` block. 2) TEST_INPUTS: [{"input":"x","description":"y"}]. For array inputs use SPACE-SEPARATED numbers: "0 1 0 2" not "[0,1,0,2]".', usr: `Problem:\n${questionText.slice(0, 2000)}\n\n${language} solution + 4-5 test inputs. Code block first, then TEST_INPUTS: [{"input":"...","description":"..."}]` },
          { sys: 'Output: 1) Code in triple backticks. 2) Line "TEST_INPUTS:" then valid JSON. For arrays use space-separated: "1 2 3" not "[1,2,3]".', usr: `Write ${language} code for:\n${questionText.slice(0, 1500)}\n\nThen: TEST_INPUTS: [{"input":"0 1 0 2","description":"basic"},{"input":"1 1 1","description":"edge"}]` }
        ];
        const p = prompts[Math.min(attempt, prompts.length - 1)];
        const retry = await groqClient.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          temperature: 0.02,
          max_tokens: 4096,
          messages: [
            { role: 'system', content: p.sys },
            { role: 'user', content: p.usr }
          ]
        });
        const retryParsed = parseSolutionAndInputs(retry.choices[0].message.content?.trim() || '', questionText);
        if (retryParsed.solution) referenceSolution = retryParsed.solution;
        if (retryParsed.inputs.length > 0) testInputs = retryParsed.inputs;
      } catch (retryErr) {
        console.warn('Retry failed:', retryErr.message);
      }
    }

    if (!referenceSolution || testInputs.length === 0) {
      return { testCases: [], referenceSolution: '' };
    }

    const testCases = [];
    for (const tc of testInputs) {
      let inputToUse = tc.input;
      let expectedOutput = '';
      try {
        let runResult = await codeExecutionService.runCode(
          referenceSolution,
          inputToUse,
          language,
          2
        );
        expectedOutput = runResult.error ? '' : (runResult.stdout || '').trim();

        // Retry with normalized input if execution failed and input looks like JSON array
        if (!expectedOutput && runResult.error) {
          const normalized = normalizeInputForStdin(tc.input);
          if (normalized !== tc.input) {
            runResult = await codeExecutionService.runCode(
              referenceSolution,
              normalized,
              language,
              2
            );
            if (!runResult.error && runResult.stdout) {
              expectedOutput = (runResult.stdout || '').trim();
              inputToUse = normalized;
            }
          }
        }
      } catch (err) {
        console.warn('Test case execution failed for input:', tc.input?.slice(0, 50), err.message);
        // Retry with normalized input
        const normalized = normalizeInputForStdin(tc.input);
        if (normalized !== tc.input) {
          try {
            const runResult = await codeExecutionService.runCode(
              referenceSolution,
              normalized,
              language,
              2
            );
            if (!runResult.error && runResult.stdout) {
              expectedOutput = (runResult.stdout || '').trim();
              inputToUse = normalized;
            }
          } catch (_) { /* keep expectedOutput empty */ }
        }
      }

      testCases.push({
        input: inputToUse,
        expectedOutput,
        description: tc.description ?? ''
      });
      if (!expectedOutput) {
        console.warn('Test case has empty expected output. Input:', inputToUse?.slice(0, 60));
      }
    }
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
  if (!groqClient) {
    throw new Error('No AI API key configured. Set GROQ_API_KEY in .env');
  }

  const langHint = LANGUAGE_HINTS[language] || LANGUAGE_HINTS.python;

  const chat = await groqClient.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    temperature: 0.2,
    max_tokens: 4096,
    messages: [
      {
        role: 'system',
        content: `You generate 3 different ${language} solutions for a problem. Each solution must read from stdin and print to stdout.

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

Provide 3 different approaches: one optimized for efficiency, one for readability, one with a different algorithm. ${langHint}`
      },
      {
        role: 'user',
        content: `Generate 3 different ${language} solutions for this problem. Each must read stdin and print stdout.

PROBLEM:
${questionText.slice(0, 3500)}`
      }
    ]
  });

  const raw = chat.choices[0].message.content?.trim() || '';
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
  return !!GROQ_API_KEY;
}

module.exports = {
  extractQuestionsFromText,
  generateTestCases,
  generateThreeSolutions,
  isConfigured
};
