/**
 * LLMTestCaseService – generate C++ test cases using an LLM.
 * Primary: Groq (llama-3.3-70b-versatile) with retry on rate-limit.
 * Fallback: Gemini (gemini-flash-latest).
 *
 * API keys are read from environment variables or from backend/data/llm-config.json (gitignored).
 * See Iteration3Testing/README.md for setup.
 */
const path = require('path');
const fs = require('fs');
const Groq = require('groq-sdk');

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const TEST_CASE_SCHEMA = {
  name: 'string',
  description: 'string',
  input: 'string',
  expectedOutput: 'string',
  isHidden: 'boolean',
  isEdgeCase: 'boolean',
  timeLimitMs: 'number',
  notes: 'string'
};

const VALID_REQUIREMENT_KEYS = [
  'loops',
  'do_while',
  'switch',
  'nested_loops',
  'conditionals',
  'recursion',
  'arrays',
  'arrays_2d',
  'arrays_3d',
  'pointers'
];

function loadConfig() {
  const fromEnv = {
    groqApiKey: process.env.GROQ_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  };
  const configPath = path.join(__dirname, '..', 'data', 'llm-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return {
        groqApiKey: fromEnv.groqApiKey || data.groqApiKey || data.GROQ_API_KEY,
        geminiApiKey: fromEnv.geminiApiKey || data.geminiApiKey || data.GEMINI_API_KEY
      };
    } catch (e) {
      console.warn('LLM config file invalid or unreadable:', e.message);
    }
  }
  return fromEnv;
}

// ---------------------------------------------------------------------------
// Robust JSON parsing (adapted from friend's safeParseJSON pattern)
// Handles: markdown fences, trailing commas, control chars, truncated strings,
// and LLM preamble like "Here is the JSON: {...}"
// ---------------------------------------------------------------------------
function safeParseJSON(raw, fallback = null) {
  if (!raw || typeof raw !== 'string') return fallback;
  let s = raw.replace(/```json\s*|\s*```/g, '').trim();

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

  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  s = s.replace(/,(\s*[}\]])/g, '$1');

  try {
    return JSON.parse(s);
  } catch (e1) {
    if (e1.message && e1.message.includes('Unterminated')) {
      const repaired = s.replace(/("(?:input|expectedOutput|expected_output)"\s*:\s*")([^"]*?)(\s*[,}\])])/g, '$1$2"$3');
      try {
        return JSON.parse(repaired);
      } catch (_) {
        // fall through
      }
    }
    console.warn('safeParseJSON failed:', e1.message, 'Snippet:', s.slice(0, 200));
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Input normalization for AI-generated test cases.
// Converts bracket-style arrays into stdin-friendly format so teachers don't
// have to manually fix inputs like [1,2,3] → "3\n1 2 3".
// ---------------------------------------------------------------------------
function normalizeInputForStdin(inputStr) {
  if (!inputStr || typeof inputStr !== 'string') return inputStr;
  const s = inputStr.trim();

  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];

      // 3D array → "x y z\nrow..."
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

      // 2D array → "rows cols\nrow..."
      if (Array.isArray(first)) {
        const rows = parsed.length;
        const cols = first.length;
        const lines = [`${rows} ${cols}`];
        for (const row of parsed) {
          lines.push(row.map(String).join(' '));
        }
        return lines.join('\n');
      }

      // 1D numeric array → "n\ne1 e2 ..."
      if (parsed.every(x => typeof x === 'number' || (typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x)))) {
        return `${parsed.length}\n${parsed.map(String).join(' ')}`;
      }
    }
  } catch (_) { /* not valid JSON – that's fine */ }

  // Flat bracket fallback: [1,2,3] → "1 2 3"
  if (/^\[[\d\s,.\-]+\]$/.test(s)) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map(String).join(' ');
    } catch (_) { /* ignore */ }
  }

  return inputStr;
}

/**
 * Parse and normalize a single test case from LLM output.
 * Applies normalizeInputForStdin to the input field.
 */
function normalizeTestCase(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rawInput = typeof raw.input === 'string' ? raw.input : (raw.input != null ? String(raw.input) : '');
  const rawDescription =
    typeof raw.description === 'string'
      ? raw.description
      : typeof raw.notes === 'string'
      ? raw.notes
      : '';
  return {
    name: typeof raw.name === 'string' ? raw.name : (raw.name != null ? String(raw.name) : 'Unnamed'),
    description: rawDescription.trim() || 'Covers a representative execution path.',
    input: normalizeInputForStdin(rawInput),
    expectedOutput: typeof raw.expectedOutput === 'string' ? raw.expectedOutput : (raw.expectedOutput != null ? String(raw.expectedOutput) : ''),
    isHidden: Boolean(raw.isHidden),
    isEdgeCase: Boolean(raw.isEdgeCase),
    timeLimitMs: typeof raw.timeLimitMs === 'number' ? raw.timeLimitMs : (typeof raw.timeLimitMs === 'string' ? parseInt(raw.timeLimitMs, 10) : 2000),
    notes: typeof raw.notes === 'string' ? raw.notes : (raw.notes != null ? String(raw.notes) : '')
  };
}

/**
 * Safe parse of JSON array of test cases.
 * Uses safeParseJSON for fault-tolerant extraction, then normalizes each test case.
 * Returns { ok: true, testCases } or { ok: false, error }.
 */
function parseTestCasesJson(text) {
  if (!text || typeof text !== 'string') {
    return { ok: false, error: 'No JSON found in LLM response' };
  }

  const parsed = safeParseJSON(text, null);
  if (parsed == null) {
    return { ok: false, error: 'Could not extract valid JSON from response' };
  }

  let arr;
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (parsed && Array.isArray(parsed.testCases)) {
    arr = parsed.testCases;
  } else if (parsed && Array.isArray(parsed.tests)) {
    arr = parsed.tests;
  } else if (parsed && Array.isArray(parsed.test_cases)) {
    arr = parsed.test_cases;
  } else {
    return { ok: false, error: 'Response is not a JSON array of test cases' };
  }

  const testCases = arr.map(normalizeTestCase).filter(Boolean);
  if (testCases.length === 0) {
    return { ok: false, error: 'Parsed array contained no valid test cases' };
  }
  return { ok: true, testCases };
}

function parseRequirementAnalysis(text) {
  const parsed = safeParseJSON(text, null);
  if (!parsed || typeof parsed !== 'object') return null;
  const requiredConcepts = Array.isArray(parsed.requiredConcepts)
    ? parsed.requiredConcepts
        .map((item) => String(item || '').toLowerCase().replace(/\s+/g, '_').trim())
        .filter((item) => VALID_REQUIREMENT_KEYS.includes(item))
    : [];
  const problemType =
    typeof parsed.problemType === 'string' && parsed.problemType.trim()
      ? parsed.problemType.trim().toLowerCase()
      : inferProblemTypeFromConcepts(requiredConcepts, false);
  return {
    requiredConcepts: Array.from(new Set(requiredConcepts)),
    isPatternQuestion: !!parsed.isPatternQuestion,
    problemType
  };
}

function inferProblemTypeFromConcepts(requiredConcepts, isPatternQuestion) {
  if (isPatternQuestion) return 'patterns';
  if (requiredConcepts.includes('arrays_3d')) return 'arrays_3d';
  if (requiredConcepts.includes('arrays_2d')) return 'arrays_2d';
  if (requiredConcepts.includes('arrays')) return 'arrays_1d';
  if (requiredConcepts.includes('pointers')) return 'pointers';
  if (requiredConcepts.includes('recursion')) return 'recursion';
  if (requiredConcepts.includes('conditionals')) return 'conditionals';
  if (requiredConcepts.includes('nested_loops')) return 'loops';
  if (requiredConcepts.includes('loops')) return 'loops';
  return 'basic_programming';
}

function heuristicAnalyzeRequirements(problemText) {
  const text = String(problemText || '');
  const lower = text.toLowerCase();
  const requiredConcepts = new Set();

  const add = (key) => {
    if (VALID_REQUIREMENT_KEYS.includes(key)) requiredConcepts.add(key);
  };

  if (/\bpattern|star pattern|print.*triangle|diamond|pyramid|asterisk/.test(lower)) {
    add('loops');
    add('nested_loops');
  }
  if (/\bmatrix|2d array|two dimensional|row|column|grid/.test(lower)) add('arrays_2d');
  if (/\b3d array|three dimensional|cube/.test(lower)) add('arrays_3d');
  if (/\barray|list of numbers|elements/.test(lower)) add('arrays');
  if (/\bpointer|address operator|dereference/.test(lower)) add('pointers');
  if (/\brecursive|recursion|factorial|fibonacci/.test(lower)) add('recursion');
  if (/\bif\b|\belse\b|\belseif\b|\bswitch\b|decision|grade|positive|negative|even|odd|eligible/.test(lower)) add('conditionals');
  if (/\bswitch\b|case\b/.test(lower)) add('switch');
  if (/\bdo[- ]while\b/.test(lower)) add('do_while');
  if (/\bloop\b|\biterate\b|\bfor each\b|\bseries\b|\bsum of first\b|\bcount\b|\bprint numbers\b|\bpattern\b/.test(lower)) add('loops');
  if (/\bnested\b|\bfor each row\b|\bfor each column\b|\bpattern\b/.test(lower)) add('nested_loops');

  const isPatternQuestion = /\bpattern|triangle|diamond|pyramid|asterisk|stars?\b/.test(lower);
  const conceptsArray = Array.from(requiredConcepts);

  return {
    requiredConcepts: conceptsArray,
    isPatternQuestion,
    problemType: inferProblemTypeFromConcepts(conceptsArray, isPatternQuestion)
  };
}

const SYSTEM_PROMPT = `You are generating deterministic unit test cases for C++ console programs. The program reads from stdin and writes to stdout.

Respond ONLY with a valid JSON array of test case objects. No other text or markdown. Each object must have exactly these fields (use empty string or false if not applicable):
- name (string): short identifier, e.g. "sample_input"
- description (string): what this test checks
- input (string): exact stdin content (can be multiline)
- expectedOutput (string): exact expected stdout (can be multiline; normalize trailing newlines)
- isHidden (boolean): true if hidden from students
- isEdgeCase (boolean): true for edge/boundary cases
- timeLimitMs (number): suggested timeout in ms, e.g. 2000
- notes (string): optional note for teacher

Generate 6–12 test cases: a few sample/sanity, several edge cases (empty input, large numbers, boundaries), and 1–2 hidden. Avoid randomness; inputs and outputs must be deterministic.`;

function buildUserPrompt(questionText) {
  return `Question text:\n${questionText}\n\nGenerate test cases as a JSON array. Respond with only the JSON array, no other text.`;
}

class LLMTestCaseService {
  constructor() {
    this.config = loadConfig();
    this.groqClient = null;
    if (this.config.groqApiKey) {
      try {
        this.groqClient = new Groq({ apiKey: this.config.groqApiKey });
      } catch (e) {
        console.warn('Groq SDK init failed:', e.message);
      }
    }
  }

  getConfig() {
    return {
      groqApiKey: this.config.groqApiKey ? '***configured***' : undefined,
      geminiApiKey: this.config.geminiApiKey ? '***configured***' : undefined
    };
  }

  hasProvider(provider) {
    if (provider === 'groq') return Boolean(this.config.groqApiKey);
    if (provider === 'gemini') return Boolean(this.config.geminiApiKey);
    return false;
  }

  // -------------------------------------------------------------------------
  // Core LLM call: Groq primary (with 429 retry-backoff), Gemini fallback.
  // Returns raw text string or throws.
  // -------------------------------------------------------------------------
  async _callAI(systemPrompt, userPrompt, opts = {}) {
    const { temperature = 0.2, maxTokens = 8192 } = opts;
    const errors = [];

    // ── Groq primary ──
    if (this.groqClient) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const chat = await this.groqClient.chat.completions.create({
            model: GROQ_MODEL,
            temperature,
            max_tokens: maxTokens,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ]
          });
          return (chat.choices[0].message.content || '').trim();
        } catch (err) {
          const msg = err.message || String(err);
          const is429 = msg.includes('429') || msg.includes('rate_limit');
          if (is429 && attempt < 2) {
            const waitMatch = msg.match(/try again in ([\d.]+)s/i);
            const waitMs = waitMatch ? Math.ceil(parseFloat(waitMatch[1]) * 1000) + 500 : 12000;
            console.log(`Groq rate limit, waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/3)...`);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
          console.warn('Groq call failed:', msg);
          errors.push(`Groq: ${msg}`);
          if (this.config.geminiApiKey) console.log('Falling back to Gemini...');
          break;
        }
      }
    }

    // ── Gemini fallback ──
    if (this.config.geminiApiKey) {
      try {
        const url = `${GEMINI_URL}?key=${encodeURIComponent(this.config.geminiApiKey)}`;
        const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
            generationConfig: { temperature, maxOutputTokens: maxTokens }
          })
        });

        if (res.status === 429) {
          errors.push('Gemini: rate limit (429)');
          throw new Error(errors.join(' | '));
        }
        if (!res.ok) {
          const t = await res.text();
          errors.push(`Gemini: HTTP ${res.status} – ${t.slice(0, 150)}`);
          throw new Error(errors.join(' | '));
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          errors.push('Gemini: empty response');
          throw new Error(errors.join(' | '));
        }
        return text.trim();
      } catch (err) {
        if (errors.length > 0 && err.message === errors.join(' | ')) throw err;
        errors.push(`Gemini: ${err.message}`);
        throw new Error(errors.join(' | '));
      }
    }

    throw new Error(errors.length ? errors.join(' | ') : 'No LLM configured. Set GROQ_API_KEY or GEMINI_API_KEY.');
  }

  /**
   * Generate test cases for a question.
   * Provider is handled automatically (Groq → Gemini fallback).
   * @param {string} questionText
   * @param {{ provider?: 'auto' | 'groq' | 'gemini' }} options
   * @returns {Promise<{ success: boolean, testCases?: object[], error?: string, code?: string, provider?: string }>}
   */
  async generateTestCases(questionText, options = {}) {
    const provider = (options.provider || 'auto').toLowerCase();

    if (!this.config.groqApiKey && !this.config.geminiApiKey) {
      return {
        success: false,
        error: 'No LLM API key configured. Set GROQ_API_KEY or GEMINI_API_KEY in environment or in backend/data/llm-config.json.',
        code: 'NO_API_KEY'
      };
    }

    const combinedPrompt = `${SYSTEM_PROMPT}\n\n${buildUserPrompt(questionText)}`;

    // If a specific provider is forced, only try that one
    if (provider === 'gemini' && !this.config.geminiApiKey) {
      return { success: false, error: 'Gemini API key not configured.', code: 'NO_API_KEY' };
    }
    if (provider === 'groq' && !this.config.groqApiKey) {
      return { success: false, error: 'Groq API key not configured.', code: 'NO_API_KEY' };
    }

    try {
      let text;

      if (provider === 'gemini') {
        text = await this._callGeminiWithSchema(questionText);
      } else {
        text = await this._callAI(SYSTEM_PROMPT, buildUserPrompt(questionText), { temperature: 0.2, maxTokens: 8192 });
      }

      const parsed = parseTestCasesJson(text);
      if (!parsed.ok) {
        return {
          success: false,
          error: `Could not parse test cases: ${parsed.error}. You can add test cases manually.`,
          code: 'PARSE_ERROR'
        };
      }

      // Batch fallback: fill in any test cases that have empty expectedOutput
      const enriched = await this._batchFillMissingOutputs(questionText, parsed.testCases);
      const normalized = enriched.map((tc, index) => ({
        ...tc,
        name: tc.name || `test_case_${index + 1}`,
        description:
          typeof tc.description === 'string' && tc.description.trim()
            ? tc.description.trim()
            : tc.isEdgeCase
            ? 'Covers an edge or boundary condition.'
            : tc.isHidden
            ? 'Hidden validation case for grading coverage.'
            : 'Covers a representative execution path.'
      }));

      return { success: true, testCases: normalized };
    } catch (err) {
      const msg = err.message || String(err);
      if (msg.includes('429') || msg.includes('rate_limit')) {
        return {
          success: false,
          error: 'LLM rate limit reached. Wait a few minutes or add test cases manually.',
          code: 'RATE_LIMIT'
        };
      }
      if (msg.includes('401') || msg.includes('Invalid')) {
        return { success: false, error: `API key error: ${msg}`, code: 'AUTH_ERROR' };
      }
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('ECONNREFUSED')) {
        return { success: false, error: 'Network error. Check your internet connection and try again.', code: 'NETWORK' };
      }
      return { success: false, error: msg, code: 'ERROR' };
    }
  }

  async analyzeRequirements(problemText) {
    const heuristic = heuristicAnalyzeRequirements(problemText);
    if (!this.config.groqApiKey && !this.config.geminiApiKey) {
      return { success: true, ...heuristic, source: 'heuristic' };
    }

    const sys = `You analyze programming questions and infer what concepts a correct student solution must use.
Return ONLY valid JSON:
{
  "requiredConcepts": ["loops", "conditionals"],
  "isPatternQuestion": false,
  "problemType": "loops"
}
Valid concept keys only: ${VALID_REQUIREMENT_KEYS.join(', ')}.
Problem types should be one of: basic_programming, loops, conditionals, recursion, arrays_1d, arrays_2d, arrays_3d, pointers, patterns.`;
    const usr = `Question text:\n${String(problemText || '').slice(0, 5000)}`;

    try {
      const raw = await this._callAI(sys, usr, { temperature: 0.05, maxTokens: 1200 });
      const parsed = parseRequirementAnalysis(raw);
      if (!parsed) {
        return { success: true, ...heuristic, source: 'heuristic_fallback' };
      }
      const mergedConcepts = Array.from(
        new Set([...(heuristic.requiredConcepts || []), ...(parsed.requiredConcepts || [])])
      );
      return {
        success: true,
        requiredConcepts: mergedConcepts,
        isPatternQuestion: heuristic.isPatternQuestion || parsed.isPatternQuestion,
        problemType:
          parsed.problemType ||
          heuristic.problemType ||
          inferProblemTypeFromConcepts(mergedConcepts, heuristic.isPatternQuestion || parsed.isPatternQuestion),
        source: 'ai'
      };
    } catch (err) {
      return { success: true, ...heuristic, source: 'heuristic_fallback' };
    }
  }

  /**
   * Call Gemini with responseSchema for structured JSON (keeps existing schema enforcement).
   * Used when provider is explicitly 'gemini'.
   */
  async _callGeminiWithSchema(questionText) {
    if (!this.config.geminiApiKey) throw new Error('Gemini API key not configured');
    const url = `${GEMINI_URL}?key=${encodeURIComponent(this.config.geminiApiKey)}`;
    const combinedPrompt = `${SYSTEM_PROMPT}\n\n${buildUserPrompt(questionText)}`;

    const geminiResponseSchema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          input: { type: 'string' },
          expectedOutput: { type: 'string' },
          isHidden: { type: 'boolean' },
          isEdgeCase: { type: 'boolean' },
          timeLimitMs: { type: 'number' },
          notes: { type: 'string' }
        },
        required: ['name', 'description', 'input', 'expectedOutput', 'isHidden', 'isEdgeCase', 'timeLimitMs']
      }
    };

    const makeBody = (includeSchema) => ({
      contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        ...(includeSchema ? { responseSchema: geminiResponseSchema } : {})
      }
    });

    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeBody(true))
    });
    if (res.status === 400) {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeBody(false))
      });
    }
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');
    return text;
  }

  /**
   * Batch fallback: for test cases where expectedOutput is empty, use AI to predict.
   * Marks predicted outputs with needsReview so teachers know to verify.
   */
  async _batchFillMissingOutputs(questionText, testCases) {
    const missing = testCases.filter(tc => !tc.expectedOutput || tc.expectedOutput.trim() === '');
    if (missing.length === 0) return testCases;

    console.log(`[LLM] ${missing.length}/${testCases.length} test cases have empty expectedOutput – attempting batch prediction...`);

    try {
      const inputsJson = JSON.stringify(
        missing.map((tc, i) => ({ n: i + 1, input: (tc.input || '').replace(/\n/g, '\\n') }))
      );

      const sysPrompt = 'You are simulating C++ program execution. Reply with ONLY a JSON array of strings: ["output1","output2",...]. No markdown.';
      const usrPrompt = `Given this programming problem, determine the expected stdout for each test input.

Problem:
${questionText.slice(0, 3000)}

Inputs (in order): ${inputsJson}

Reply with a JSON array of the expected output strings, in the same order.`;

      const raw = await this._callAI(sysPrompt, usrPrompt, { temperature: 0.05, maxTokens: 2048 });
      const predicted = safeParseJSON(raw, null);

      if (Array.isArray(predicted)) {
        let filled = 0;
        missing.forEach((tc, i) => {
          const output = predicted[i] != null ? String(predicted[i]).trim() : '';
          if (output) {
            tc.expectedOutput = output;
            tc.notes = tc.notes ? `${tc.notes} [AI-predicted output – needs review]` : '[AI-predicted output – needs review]';
            filled++;
          }
        });
        if (filled > 0) {
          console.log(`[LLM] Batch-predicted ${filled}/${missing.length} missing outputs (marked for review).`);
        }
      }
    } catch (err) {
      console.warn('[LLM] Batch prediction failed (teacher can add outputs manually):', err.message);
    }

    return testCases;
  }

  async generateSubmissionSummary(evidence, options = {}) {
    if (!this.config.groqApiKey && !this.config.geminiApiKey) {
      return {
        success: false,
        error: 'No LLM API key configured for summary generation.',
        code: 'NO_API_KEY'
      };
    }
    const compactEvidence = compactEvidenceForSummary(evidence);
    const prompt = buildSummaryPrompt(compactEvidence, options);
    try {
      const text = await this._callAI(
        'You are helping a teacher quickly review one C++ submission. Write a strict, factual 5-6 line summary.',
        prompt,
        { temperature: 0.2, maxTokens: Math.min(Number(options.maxOutputTokens) || 4096, 8192) }
      );

      const normalized = String(text).trim();
      if (!normalized) {
        return { success: false, error: 'Empty summary response.', code: 'EMPTY' };
      }
      let summaryLines = normalized
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 12);
      summaryLines = finalizeSummaryLines(summaryLines);
      const summary = summaryLines.join('\n');
      if (summaryLines.length < 3) {
        return {
          success: false,
          error: 'Summary was truncated by the model. Retry or use a shorter evidence payload.',
          code: 'SUMMARY_TRUNCATED'
        };
      }
      return {
        success: true,
        summary,
        confidence: inferSummaryConfidence(evidence)
      };
    } catch (err) {
      return { success: false, error: err.message || String(err), code: 'ERROR' };
    }
  }
}

// ---------------------------------------------------------------------------
// Summary helpers (unchanged from original)
// ---------------------------------------------------------------------------

function compactEvidenceForSummary(evidence) {
  if (!evidence || typeof evidence !== 'object') return {};
  const bd = evidence.analysis_breakdown && typeof evidence.analysis_breakdown === 'object'
    ? { ...evidence.analysis_breakdown }
    : null;
  if (bd && Array.isArray(bd.failed_examples)) {
    bd.failed_examples = bd.failed_examples.slice(0, 3).map((ex) => {
      if (!ex || typeof ex !== 'object') return ex;
      return {
        category: ex.category,
        reason: ex.reason,
        expected: truncateStr(ex.expected, 120),
        actual: truncateStr(ex.actual, 120)
      };
    });
  }
  return {
    evaluation_id: evidence.evaluation_id,
    status: evidence.status,
    score: evidence.score,
    max_score: evidence.max_score,
    analysis_breakdown: bd,
    requirement_checks: evidence.requirement_checks,
    hardcoding_flags: evidence.hardcoding_flags
  };
}

function truncateStr(s, max) {
  if (s == null) return s;
  const t = String(s);
  if (t.length <= max) return t;
  return t.slice(0, max) + '…';
}

function joinAllTextParts(parts) {
  if (!Array.isArray(parts) || !parts.length) return '';
  return parts
    .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
    .join('');
}

function sentenceEndsCleanly(line) {
  const s = String(line).trim();
  return /[.!?…](?:['")\]]*\s*)?$/.test(s);
}

function finalizeSummaryLines(lines) {
  const trimmed = lines.map((l) => l.trim()).filter(Boolean);
  let out = trimmed.slice();
  while (out.length > 0 && !sentenceEndsCleanly(out[out.length - 1])) {
    out = out.slice(0, -1);
  }
  if (out.length === 0 && trimmed.length > 0) {
    const recovered = truncateToLastSentenceBoundary(trimmed.join('\n'));
    if (recovered) {
      out = recovered
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    }
  }
  return out;
}

function truncateToLastSentenceBoundary(text) {
  const t = String(text).trim();
  if (!t) return '';
  const re = /[.!?](?=\s|$)/g;
  let end = -1;
  let m;
  while ((m = re.exec(t)) !== null) {
    const ch = m[0];
    const i = m.index;
    if (ch === '.' && i > 0 && /\d/.test(t[i - 1]) && /\d/.test(t[i + 1] || '')) {
      continue;
    }
    end = i + 1;
  }
  if (end <= 0) return '';
  return t.slice(0, end).trim();
}

function buildSummaryPrompt(evidence, options = {}) {
  const mode = options.mode || 'balanced';
  const text = JSON.stringify(evidence || {}, null, 2);
  return [
    'Write a strict, factual 5-6 line summary in plain text.',
    'Each line must be one or more complete sentences (do not stop mid-sentence).',
    'Every line MUST end with a period (.), question mark (?), or exclamation (!).',
    'Never end a line with a bare number or an unfinished clause.',
    'Line 1 should state overall performance.',
    'Include what student did well and what needs improvement.',
    'Mention unmet requirements only if provided.',
    'Do not assign final marks. End with one actionable next step for student.',
    `Tone mode: ${mode}`,
    '',
    'Evidence JSON:',
    text
  ].join('\n');
}

function inferSummaryConfidence(evidence) {
  const breakdown = evidence && evidence.analysis_breakdown;
  if (!breakdown) return 'low';
  const hasCategories = breakdown.category_stats && Object.keys(breakdown.category_stats).length > 0;
  const passRate = typeof breakdown.pass_rate === 'number' ? breakdown.pass_rate : 0;
  if (hasCategories && passRate >= 0.85) return 'high';
  if (hasCategories) return 'medium';
  return 'low';
}

module.exports = LLMTestCaseService;
module.exports.parseTestCasesJson = parseTestCasesJson;
module.exports.normalizeTestCase = normalizeTestCase;
module.exports.safeParseJSON = safeParseJSON;
module.exports.normalizeInputForStdin = normalizeInputForStdin;
module.exports.loadConfig = loadConfig;
