/**
 * LLMTestCaseService – generate C++ test cases using an LLM (Gemini primary, Hugging Face fallback).
 * API keys are read from environment variables or from backend/data/llm-config.json (gitignored).
 * See Iteration3Testing/README.md and backend/data/llm-config.example.json for setup.
 */
const path = require('path');
const fs = require('fs');

// Gemini model used for test-case generation.
// \"gemini-1.5-flash\" was deprecated for v1beta; use a current model instead.
// See https://ai.google.dev/gemini-api/docs/models for up-to-date options.
const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const HF_MODEL = 'meta-llama/Llama-3.2-3B-Instruct';
const HF_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

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

function loadConfig() {
  const fromEnv = {
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    huggingfaceToken: process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN
  };
  const configPath = path.join(__dirname, '..', 'data', 'llm-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return {
        geminiApiKey: fromEnv.geminiApiKey || data.geminiApiKey || data.GEMINI_API_KEY,
        huggingfaceToken: fromEnv.huggingfaceToken || data.huggingfaceToken || data.HUGGINGFACE_TOKEN
      };
    } catch (e) {
      console.warn('LLM config file invalid or unreadable:', e.message);
    }
  }
  return fromEnv;
}

/**
 * Strip markdown code fence and extract JSON string.
 */
function extractJsonFromResponse(text) {
  if (!text || typeof text !== 'string') return null;
  let s = text.trim();
  const jsonBlock = /^```(?:json)?\s*([\s\S]*?)```\s*$/m.exec(s);
  if (jsonBlock) s = jsonBlock[1].trim();
  return s;
}

/**
 * Parse and normalize a single test case from LLM output.
 */
function normalizeTestCase(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    name: typeof raw.name === 'string' ? raw.name : (raw.name != null ? String(raw.name) : 'Unnamed'),
    description: typeof raw.description === 'string' ? raw.description : (raw.description != null ? String(raw.description) : ''),
    input: typeof raw.input === 'string' ? raw.input : (raw.input != null ? String(raw.input) : ''),
    expectedOutput: typeof raw.expectedOutput === 'string' ? raw.expectedOutput : (raw.expectedOutput != null ? String(raw.expectedOutput) : ''),
    isHidden: Boolean(raw.isHidden),
    isEdgeCase: Boolean(raw.isEdgeCase),
    timeLimitMs: typeof raw.timeLimitMs === 'number' ? raw.timeLimitMs : (typeof raw.timeLimitMs === 'string' ? parseInt(raw.timeLimitMs, 10) : 2000),
    notes: typeof raw.notes === 'string' ? raw.notes : (raw.notes != null ? String(raw.notes) : '')
  };
}

/**
 * Safe parse of JSON array of test cases; returns { ok: true, testCases } or { ok: false, error }.
 */
function parseTestCasesJson(text) {
  const raw = extractJsonFromResponse(text);
  if (!raw) return { ok: false, error: 'No JSON found in LLM response' };
  let arr;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      arr = parsed;
    } else if (parsed && Array.isArray(parsed.testCases)) {
      arr = parsed.testCases;
    } else if (parsed && Array.isArray(parsed.tests)) {
      arr = parsed.tests;
    } else {
      return { ok: false, error: 'Response is not a JSON array of test cases' };
    }
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e.message}` };
  }
  const testCases = arr.map(normalizeTestCase).filter(Boolean);
  return { ok: true, testCases };
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
  }

  getConfig() {
    return { ...this.config };
  }

  hasProvider(provider) {
    if (provider === 'gemini') return Boolean(this.config.geminiApiKey);
    if (provider === 'hf') return Boolean(this.config.huggingfaceToken);
    return false;
  }

  /**
   * Generate test cases using the specified provider.
   * @param {string} questionText - Full question description
   * @param {{ provider: 'gemini' | 'hf' }} options
   * @returns {Promise<{ success: boolean, testCases?: object[], error?: string, code?: string }>}
   */
  async generateTestCases(questionText, options = {}) {
    const provider = (options.provider || 'gemini').toLowerCase();
    if (provider !== 'gemini' && provider !== 'hf') {
      return { success: false, error: 'Invalid provider. Use "gemini" or "hf".', code: 'INVALID_PROVIDER' };
    }

    if (provider === 'gemini') {
      if (!this.config.geminiApiKey) {
        return {
          success: false,
          error: 'Gemini API key not configured. Set GEMINI_API_KEY in environment or in backend/data/llm-config.json. See Iteration3Testing/README.md for setup.',
          code: 'NO_API_KEY'
        };
      }
      return this._callGemini(questionText);
    }

    if (provider === 'hf') {
      if (!this.config.huggingfaceToken) {
        return {
          success: false,
          error: 'Hugging Face token not configured. Set HUGGINGFACE_TOKEN in environment or in backend/data/llm-config.json. See Iteration3Testing/README.md for setup.',
          code: 'NO_API_KEY'
        };
      }
      return this._callHuggingFace(questionText);
    }

    return { success: false, error: 'Unknown provider.', code: 'UNKNOWN' };
  }

  async _callGemini(questionText) {
    const url = `${GEMINI_URL}?key=${encodeURIComponent(this.config.geminiApiKey)}`;
    const combinedPrompt = `${SYSTEM_PROMPT}\n\n${buildUserPrompt(questionText)}`;
    const body = {
      contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json'
      }
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.status === 401) {
        return { success: false, error: 'Invalid Gemini API key. Check your key at aistudio.google.com/app/apikey', code: '401' };
      }
      if (res.status === 403) {
        return { success: false, error: 'Gemini API access forbidden. Check your project and API key.', code: '403' };
      }
      if (res.status === 429) {
        return {
          success: false,
          error: 'Gemini rate limit reached. Wait a few minutes or add questions/test cases manually.',
          code: '429'
        };
      }
      if (!res.ok) {
        const t = await res.text();
        return { success: false, error: `Gemini API error (${res.status}): ${t.slice(0, 200)}`, code: String(res.status) };
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return { success: false, error: 'Empty or unexpected response from Gemini.', code: 'EMPTY' };
      }

      const parsed = parseTestCasesJson(text);
      if (!parsed.ok) {
        return { success: false, error: `Could not parse test cases: ${parsed.error}. You can add test cases manually.`, code: 'PARSE_ERROR' };
      }
      return { success: true, testCases: parsed.testCases };
    } catch (err) {
      const msg = err.message || String(err);
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('ECONNREFUSED')) {
        return { success: false, error: 'Network error. Check your internet connection and try again.', code: 'NETWORK' };
      }
      return { success: false, error: msg, code: 'ERROR' };
    }
  }

  async _callHuggingFace(questionText) {
    const fullPrompt = `${SYSTEM_PROMPT}\n\n${buildUserPrompt(questionText)}`;
    try {
      const res = await fetch(HF_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.huggingfaceToken}`
        },
        body: JSON.stringify({
          inputs: fullPrompt,
          parameters: { max_new_tokens: 4096, temperature: 0.2, return_full_text: false }
        })
      });

      if (res.status === 401) {
        return { success: false, error: 'Invalid Hugging Face token. Create one at huggingface.co/settings/tokens', code: '401' };
      }
      if (res.status === 403) {
        return { success: false, error: 'Hugging Face access forbidden. Check token and model access.', code: '403' };
      }
      if (res.status === 429) {
        return {
          success: false,
          error: 'Hugging Face rate limit reached. Wait a few minutes or add test cases manually.',
          code: '429'
        };
      }
      if (!res.ok) {
        const t = await res.text();
        return { success: false, error: `Hugging Face API error (${res.status}): ${t.slice(0, 200)}`, code: String(res.status) };
      }

      const data = await res.json();
      const text = Array.isArray(data) ? (data[0]?.generated_text || data[0]?.toString?.() || '') : (data?.generated_text || data?.toString?.() || '');
      if (!text) {
        return { success: false, error: 'Empty or unexpected response from Hugging Face.', code: 'EMPTY' };
      }

      const parsed = parseTestCasesJson(text);
      if (!parsed.ok) {
        return { success: false, error: `Could not parse test cases: ${parsed.error}. You can add test cases manually.`, code: 'PARSE_ERROR' };
      }
      return { success: true, testCases: parsed.testCases };
    } catch (err) {
      const msg = err.message || String(err);
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('ECONNREFUSED')) {
        return { success: false, error: 'Network error. Check your internet connection and try again.', code: 'NETWORK' };
      }
      return { success: false, error: msg, code: 'ERROR' };
    }
  }
}

module.exports = LLMTestCaseService;
module.exports.parseTestCasesJson = parseTestCasesJson;
module.exports.normalizeTestCase = normalizeTestCase;
module.exports.loadConfig = loadConfig;
