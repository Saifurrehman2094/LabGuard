# Iteration 3 Testing

This folder holds test materials and instructions for verifying the **LabGuard Code Evaluation Module** (Phases 1–9). Use it to confirm each phase works before moving on.

---

## Phase 2: PDF text extraction

Phase 2 adds **extracting text from exam PDFs** and **splitting into candidate questions** (e.g. "Q1:", "Question 2"). You can verify it in two ways: an **automated script** and a **manual run in the app**.

### Option A – Automated verification (recommended first)

This runs the extractor on a small sample PDF and prints what was extracted.

1. **From the project root**, run:
   ```bash
   npx electron Iteration3Testing/phase2-verify.js
   ```
2. **What to expect:**
   - A file `Iteration3Testing/sample-questions.pdf` is created (with 2 sample questions).
   - Console output shows:
     - **Full text** extracted from the PDF.
     - **Number of pages** (should be 1).
     - **Candidate questions** after the heuristic split (title + description for each).
   - Script exits with code 0 and the message: `Phase 2 verification done.`

3. **If something is wrong:**
   - “PDF file not found” → run from the **project root** (where `package.json` is).
   - “Invalid PDF” / “Cannot read” → ensure `pdf-parse` is installed (`npm install --legacy-peer-deps` if needed).

### Option B – Manual test in the app

This checks the full path: **upload PDF → Extract questions** via the UI (when the teacher flow is wired in) or via DevTools.

1. Start the app:
   ```bash
   npm run start:dev
   ```
2. Log in as **admin** or **teacher**.
3. Create an exam (or pick an existing one) and **upload a PDF** for it (exam edit → upload PDF).
4. When the **Code Questions** UI is available (Phase 5), use **“Extract from PDF”** and you should see candidate questions listed.
5. **Without a PDF:** for an exam with no PDF, the app should show a clear message like *“No PDF uploaded for this exam. You can add questions manually.”* and still allow adding questions by hand.

**What to expect:**
- With PDF: list of questions with **tempId**, **title**, **description**, and optional **page**.
- Without PDF: **success: false** and an error message that mentions adding questions manually.

**Quick check via DevTools (if the UI is not ready yet):**
- Open DevTools (Ctrl+Shift+I) and run:
  ```javascript
  window.electronAPI.extractQuestions('YOUR_EXAM_ID').then(console.log)
  ```
- For an exam **with** a PDF: you should see `{ success: true, questions: [...] }`.
- For an exam **without** a PDF: you should see `{ success: false, error: "No PDF uploaded..." }`.

---

## Phase 3: LLM test-case generation

Phase 3 uses an **LLM** to suggest **test cases** for C++ questions (stdin/stdout). The app does **not** assume any LLM is set up: you must configure an API key before using this feature.

### Which LLM we use

| Provider | Role   | Model / API | Free tier |
|----------|--------|-------------|-----------|
| **Google Gemini** | Primary | Gemini 1.5 Flash via Google AI Studio | Yes – no credit card; daily/minute limits apply. |
| **Hugging Face**  | Fallback | Serverless Inference API (e.g. Llama-3.2-3B-Instruct) | Yes – free tier with rate limits. |

We use **Gemini** by default because it is strong at structured JSON and code-related tasks. **Hugging Face** is available as a fallback (e.g. if you don’t want to use Google or hit Gemini limits).

### How to set up the LLM (required before Phase 3 works)

You must provide at least one of the following. The app reads keys in this order: **environment variables** first, then **config file**.

#### Option 1 – Environment variables (recommended)

- **Gemini (primary)**  
  - Name: `GEMINI_API_KEY` (or `GOOGLE_API_KEY`).  
  - Where to get it: **[Google AI Studio](https://aistudio.google.com/app/apikey)** → sign in with Google → “Create API key” (or “Get API key”) → copy the key (starts with `AIza...`).  
  - No credit card needed for the free tier.  
  - Example (PowerShell): `$env:GEMINI_API_KEY = "AIza..."`
- **Hugging Face (fallback)**  
  - Name: `HUGGINGFACE_TOKEN` (or `HF_TOKEN`).  
  - Where to get it: **[Hugging Face → Settings → Access Tokens](https://huggingface.co/settings/tokens)** → “New token” → create a token with “Read” (or inference) permission → copy.  
  - Free tier has limited requests.  
  - Example (PowerShell): `$env:HUGGINGFACE_TOKEN = "hf_..."`

#### Option 2 – Config file (alternative)

1. Copy the example file:
   ```bash
   copy backend\data\llm-config.example.json backend\data\llm-config.json
   ```
2. Edit `backend/data/llm-config.json` and replace placeholders with your real values:
   ```json
   {
     "geminiApiKey": "AIza...",
     "huggingfaceToken": "hf_..."
   }
   ```
3. **Important:** `llm-config.json` is in `.gitignore`. Never commit real API keys.

If **no** key is set for the chosen provider, the app will return a clear error telling you to set `GEMINI_API_KEY` (or the HF token) and will point you to this README.

### Option A – Automated verification (T6: mock + parse)

This checks **prompt + JSON parsing** with a **saved sample response** (no real API call).

1. From the **project root**, run:
   ```bash
   npx electron Iteration3Testing/phase3-verify.js
   ```
2. **What to expect:**
   - Script runs the **mock test** first: it feeds a sample LLM-like JSON string into the parser and checks that test case shape (name, input, expectedOutput, isHidden, etc.) is correct.
   - Console shows “T6 (mock): parsed test case shape OK” and “Phase 3 verification (mock) done.”
   - If you have **no** API key, the script may then report that the real-API test was skipped (expected).

### Option B – Real API test (T7)

This calls the **real** Gemini (or HF) API once and checks that you get back an array of test cases (or a clear error).

1. Set an API key (env or `backend/data/llm-config.json`) as above.
2. From the **project root**, run:
   ```bash
   npx electron Iteration3Testing/phase3-verify.js --live
   ```
   Or run the same script and use the prompt it prints to call the app’s IPC (see below).
3. **What to expect:**
   - **With valid key:** `success: true` and `testCases` as an array of objects (each with `name`, `description`, `input`, `expectedOutput`, `isHidden`, `isEdgeCase`, `timeLimitMs`, `notes`). Console shows count and a short preview.
   - **With invalid/missing key:** `success: false` and an error like “Invalid Gemini API key” or “Gemini API key not configured” (and you can continue with manual test case entry).
   - **Rate limit (429):** “Rate limit reached” message; you can wait and retry or add test cases manually.

### Quick check via DevTools (T7 from the app)

1. Start the app and log in as **admin** or **teacher**.
2. Ensure you have at least one **exam** and one **code question** (Phase 1/2/4). Note the `examId` and `questionId` (e.g. from DB or from the UI when it exists).
3. Open DevTools (Ctrl+Shift+I) and run:
   ```javascript
   window.electronAPI.generateTestCases('EXAM_ID', 'QUESTION_ID', 'gemini').then(console.log)
   ```
4. **With key:** you should see `{ success: true, testCases: [...] }`.
5. **Without key or bad key:** you should see `{ success: false, error: "...", code: "NO_API_KEY" }` or similar – the UI should still allow adding test cases manually.

---

## Future phases

This folder will be extended with:

- **Phase 4+:** Test data and scripts for persistence, Code Eval service, teacher UI, etc.

Keep all phase-related test assets and instructions here so the main project stays clean.
