/**
 * Phase 3 verification: LLM test-case generation – prompt/parse (T6) and optional live API (T7).
 * Run from project root:
 *   npx electron Iteration3Testing/phase3-verify.js        # T6 only (mock + parse)
 *   npx electron Iteration3Testing/phase3-verify.js --live # T6 + T7 (real API if key set)
 *
 * Requires no API key for T6. For T7 set GEMINI_API_KEY (or backend/data/llm-config.json).
 */
const { app } = require('electron');
const path = require('path');

const SAMPLE_LLM_RESPONSE = `[
  {"name": "sample", "description": "Two positive numbers", "input": "2 3", "expectedOutput": "5", "isHidden": false, "isEdgeCase": false, "timeLimitMs": 2000, "notes": ""},
  {"name": "zeros", "description": "Both zero", "input": "0 0", "expectedOutput": "0", "isHidden": false, "isEdgeCase": true, "timeLimitMs": 2000, "notes": "edge"},
  {"name": "hidden_large", "description": "Large values", "input": "1000000 1000000", "expectedOutput": "2000000", "isHidden": true, "isEdgeCase": false, "timeLimitMs": 3000, "notes": ""}
]`;

const SAMPLE_LLM_RESPONSE_WITH_MARKDOWN = `\`\`\`json
${SAMPLE_LLM_RESPONSE}
\`\`\``;

function run() {
  const projectRoot = path.join(__dirname, '..');
  const backendDir = path.join(projectRoot, 'backend');
  const { parseTestCasesJson, normalizeTestCase } = require(path.join(backendDir, 'services', 'llmTestCaseService'));

  console.log('--- Phase 3: LLM test-case generation verification ---\n');

  // T6: Mock LLM – test prompt + JSON parsing with saved sample response
  const parsed1 = parseTestCasesJson(SAMPLE_LLM_RESPONSE);
  if (!parsed1.ok || !Array.isArray(parsed1.testCases)) {
    throw new Error(`T6 (mock): expected parsed test cases, got: ${JSON.stringify(parsed1)}`);
  }
  if (parsed1.testCases.length < 2) {
    throw new Error(`T6 (mock): expected at least 2 test cases, got ${parsed1.testCases.length}`);
  }
  const first = parsed1.testCases[0];
  const required = ['name', 'description', 'input', 'expectedOutput', 'isHidden', 'isEdgeCase', 'timeLimitMs', 'notes'];
  for (const key of required) {
    if (!(key in first)) {
      throw new Error(`T6 (mock): parsed test case missing field "${key}"`);
    }
  }
  if (first.name !== 'sample' || first.input !== '2 3' || first.expectedOutput !== '5') {
    throw new Error(`T6 (mock): parsed values don't match sample: ${JSON.stringify(first)}`);
  }
  console.log('T6 (mock): parsed test case shape OK. Count:', parsed1.testCases.length);

  const parsed2 = parseTestCasesJson(SAMPLE_LLM_RESPONSE_WITH_MARKDOWN);
  if (!parsed2.ok || parsed2.testCases.length !== parsed1.testCases.length) {
    throw new Error(`T6 (mock): markdown-wrapped JSON should parse same: ${JSON.stringify(parsed2)}`);
  }
  console.log('T6 (mock): markdown code-fence stripping OK.\n');

  const runLive = process.argv.includes('--live') || process.env.RUN_LIVE_LLM === '1';
  if (!runLive) {
    console.log('Phase 3 verification (mock) done. Run with --live to call real API (T7).');
    return;
  }

  // T7: Real API (optional)
  const LLMTestCaseService = require(path.join(backendDir, 'services', 'llmTestCaseService'));
  const service = new LLMTestCaseService();
  const provider = 'gemini';
  if (!service.hasProvider(provider)) {
    console.log('T7 (live): Skipped – no Gemini API key. Set GEMINI_API_KEY or add backend/data/llm-config.json.');
    console.log('\nPhase 3 verification (mock + live skip) done.');
    return;
  }

  return service
    .generateTestCases('Write a C++ program that reads two integers and prints their sum.', { provider })
    .then((result) => {
      if (result.success && Array.isArray(result.testCases)) {
        console.log('T7 (live): success. Test cases count:', result.testCases.length);
        if (result.testCases.length > 0) {
          const t = result.testCases[0];
          console.log('  First:', t.name, '| input:', (t.input || '').slice(0, 30), '| expectedOutput:', (t.expectedOutput || '').slice(0, 30));
        }
      } else {
        console.log('T7 (live):', result.error || 'No test cases', '| code:', result.code);
      }
      console.log('\nPhase 3 verification (mock + live) done.');
    })
    .catch((err) => {
      console.error('T7 (live) error:', err);
    });
}

app.whenReady().then(() => {
  Promise.resolve()
    .then(run)
    .then(() => app.exit(0))
    .catch((err) => {
      console.error(err);
      app.exit(1);
    });
});
