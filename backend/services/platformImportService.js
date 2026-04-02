/**
 * Platform Import Service - Fetches problems from Codeforces, AtCoder, HackerRank
 * Strict difficulty caps for AI compatibility
 * No external API keys needed (all platforms have free public APIs)
 */

const cheerio = require('cheerio');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanHtml(html) {
  if (!html) return '';
  try {
    const $ = cheerio.load(html);
    // Remove script and style tags
    $('script').remove();
    $('style').remove();
    // Replace <br> tags with newline
    $('br').replaceWith('\n');
    // Get text and normalize whitespace
    let text = $.text()
      .replace(/\r\n/g, '\n')
      .replace(/\n\s*\n/g, '\n'); // Multiple newlines to single
    // Normalize multiple spaces
    text = text.split('\n')
      .map(line => line.replace(/  +/g, ' ').trim())
      .filter(line => line.length > 0)
      .join('\n');
    return text.trim();
  } catch (err) {
    console.warn('[PlatformImport:cleanHtml]', err.message);
    return '';
  }
}

// In-memory cache for Codeforces problems list
let cfCache = { data: null, timestamp: 0 };
const CF_CACHE_TTL = 3600000; // 1 hour

/**
 * Fetch problems from Codeforces with STRICT difficulty cap
 * HARD FILTERS (always enforced, non-negotiable):
 *   - rating <= 1000 NEVER ABOVE
 *   - ONLY tags: implementation, arrays, strings, math, brute force, sortings
 *   - EXCLUDE: dp, graphs, trees, dfs and similar, bfs, flows, fft, number theory, geometry, interactive
 */
async function fetchCodeforcesProblems({ minRating = 800, maxRating = 1000, count = 5, tags = [] } = {}) {
  console.log('[PlatformImport:CF] Fetching:', { minRating, maxRating, count });

  // HARD CAP: Never exceed 1000 regardless of input
  const safeMaxRating = Math.min(maxRating, 1000);
  const safeMinRating = Math.min(minRating, safeMaxRating);

  const allowedTags = new Set([
    'implementation', 'arrays', 'strings', 'math', 'brute force', 'sortings'
  ]);

  const forbiddenTags = new Set([
    'dp', 'dynamic programming', 'graphs', 'trees', 'dfs', 'dfs and similar',
    'bfs', 'flows', 'fft', 'number theory', 'geometry', 'interactive',
    'greedy', 'data structures', 'divide and conquer', 'two pointers', 'binary search'
  ]);

  try {
    // Check cache
    const now = Date.now();
    let problemsData = null;

    if (cfCache.data && (now - cfCache.timestamp) < CF_CACHE_TTL) {
      console.log('[PlatformImport:CF] Using cached problems list');
      problemsData = cfCache.data;
    } else {
      console.log('[PlatformImport:CF] Fetching fresh problems list from API');
      const response = await fetch('https://codeforces.com/api/problemset.problems', {
        timeout: 10000,
        headers: { 'User-Agent': 'LabGuard-Academic-Tool/1.0' }
      });

      if (!response.ok) {
        throw new Error(`CF API status ${response.status}`);
      }

      const json = await response.json();
      if (!json.result || !Array.isArray(json.result.problems)) {
        throw new Error('Invalid CF API response');
      }

      problemsData = json.result.problems;
      cfCache = { data: problemsData, timestamp: now };
      console.log('[PlatformImport:CF] Cached', problemsData.length, 'problems');
    }

    // Filter problems with HARD FILTERS
    const filtered = problemsData.filter(p => {
      // Rating check (HARD CAP)
      if (p.rating < safeMinRating || p.rating > safeMaxRating) return false;
      if (p.rating > 1000) return false; // EXPLICIT HARD CAP

      // Type check
      if (p.type !== 'PROGRAMMING') return false;

      // Tags check
      const pTags = (p.tags || []).map(t => t.toLowerCase());

      // Must have at least one allowed tag
      const hasAllowedTag = pTags.some(t => allowedTags.has(t));
      if (!hasAllowedTag) return false;

      // Must NOT have any forbidden tag (except: keep two pointers/binary search if rating <= 900)
      const hasForbidden = pTags.some(t => {
        if (t === 'two pointers' || t === 'binary search') {
          return p.rating > 900; // Allow only if rating <= 900
        }
        return forbiddenTags.has(t);
      });
      if (hasForbidden) return false;

      // Check interactive
      if (pTags.includes('interactive')) return false;

      return true;
    });

    console.log('[PlatformImport:CF] Filtered down to', filtered.length, 'problems');

    // Shuffle and take candidates
    const shuffled = filtered.sort(() => Math.random() - 0.5);
    const candidates = shuffled.slice(0, Math.min(count * 3, filtered.length));

    const results = [];
    for (let i = 0; i < candidates.length && results.length < count; i++) {
      const problem = candidates[i];
      await sleep(1000); // Rate limit: 1 request per second

      try {
        console.log('[PlatformImport:CF] Fetching HTML:', problem.contestId, problem.index);
        const url = `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`;
        const htmlResponse = await fetch(url, {
          timeout: 10000,
          headers: { 'User-Agent': 'LabGuard-Academic-Tool/1.0' }
        });

        if (!htmlResponse.ok) {
          console.warn('[PlatformImport:CF] HTTP', htmlResponse.status, 'for', problem.index);
          continue;
        }

        const html = await htmlResponse.text();
        const $ = cheerio.load(html);

        // Extract problem statement
        const statement = $('.problem-statement').html() || '';
        if (!statement || statement.trim().length < 20) {
          console.warn('[PlatformImport:CF] Empty statement for', problem.index);
          continue;
        }

        // Extract sections
        const title = problem.name || 'Unknown';
        const inputSpec = cleanHtml($('.input-specification').html() || '');
        const outputSpec = cleanHtml($('.output-specification').html() || '');

        // Extract sample I/O
        const sampleInputs = [];
        const sampleOutputs = [];
        const sampleTest = $('.sample-test');

        sampleTest.find('.input').each((i, el) => {
          const text = cheerio.load(el).text().trim();
          if (text.length > 0) sampleInputs.push(text);
        });

        sampleTest.find('.output').each((i, el) => {
          const text = cheerio.load(el).text().trim();
          if (text.length > 0) sampleOutputs.push(text);
        });

        if (sampleInputs.length === 0) {
          console.warn('[PlatformImport:CF] No sample inputs for', problem.index);
          continue;
        }

        // Extract constraints
        const constraintText = cleanHtml($('.input-specification').text() || '');

        results.push({
          sourceId: `cf_${problem.contestId}_${problem.index}`,
          sourcePlatform: 'codeforces',
          sourceUrl: `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`,
          originalTitle: title,
          originalStatement: cleanHtml(statement),
          inputFormat: inputSpec,
          outputFormat: outputSpec,
          sampleInputs,
          sampleOutputs,
          difficulty: minRating <= 800 ? 'easy' : 'medium',
          tags: problem.tags.map(t => t.toLowerCase()),
          constraints: constraintText,
          rating: problem.rating
        });

        console.log('[PlatformImport:CF] ✓ Added', title, '(rating:', problem.rating + ')');
      } catch (err) {
        console.warn('[PlatformImport:CF] Problem fetch failed:', err.message);
      }
    }

    return results;
  } catch (err) {
    console.error('[PlatformImport:CF] Fatal:', err.message);
    throw err;
  }
}

/**
 * Fetch problems from AtCoder with STRICT filters
 * HARD FILTERS:
 *   - difficulty <= 400 (from kenkoooo difficulty estimate)
 *   - ONLY ABC contests
 *   - ONLY tasks A and B NEVER C or above
 */
async function fetchAtCoderProblems({ maxDifficulty = 400, count = 5 } = {}) {
  console.log('[PlatformImport:AC] Fetching:', { maxDifficulty, count });

  // HARD CAP: Never exceed 400 for medium, 200 for easy
  const safeMaxDifficulty = Math.min(maxDifficulty, 400);

  try {
    // Fetch problems list
    console.log('[PlatformImport:AC] Fetching problems list');
    const problemsResp = await fetch('https://kenkoooo.com/atcoder/resources/problems.json', {
      timeout: 10000,
      headers: { 'User-Agent': 'LabGuard-Academic-Tool/1.0' }
    });

    if (!problemsResp.ok) throw new Error(`Problems API status ${problemsResp.status}`);
    const problems = await problemsResp.json();

    // Fetch difficulty models
    console.log('[PlatformImport:AC] Fetching difficulty models');
    const modelsResp = await fetch('https://kenkoooo.com/atcoder/resources/problem-models.json', {
      timeout: 10000,
      headers: { 'User-Agent': 'LabGuard-Academic-Tool/1.0' }
    });

    if (!modelsResp.ok) throw new Error(`Models API status ${modelsResp.status}`);
    const models = await modelsResp.json();

    // Filter problems
    const filtered = problems.filter(p => {
      if (!p.contest_id.startsWith('abc')) return false;
      if (!p.id.endsWith('_a') && !p.id.endsWith('_b')) return false;
      const difficulty = models[p.id]?.difficulty;
      if (difficulty === undefined || difficulty > safeMaxDifficulty) return false;
      return true;
    });

    console.log('[PlatformImport:AC] Filtered down to', filtered.length, 'problems');

    // Shuffle and take candidates
    const shuffled = filtered.sort(() => Math.random() - 0.5);
    const candidates = shuffled.slice(0, Math.min(count * 3, filtered.length));

    const results = [];
    for (let i = 0; i < candidates.length && results.length < count; i++) {
      const problem = candidates[i];
      await sleep(1000);

      try {
        console.log('[PlatformImport:AC] Fetching:', problem.id);
        const url = `https://atcoder.jp/contests/${problem.contest_id}/tasks/${problem.id}`;
        const response = await fetch(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'LabGuard-Academic-Tool/1.0',
            'Cookie': 'language=en'
          }
        });

        if (!response.ok) {
          console.warn('[PlatformImport:AC] HTTP', response.status, 'for', problem.id);
          continue;
        }

        const html = await response.text();

        // Check for Japanese characters
        if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(html)) {
          console.warn('[PlatformImport:AC] Japanese text detected in', problem.id, '- skipping');
          continue;
        }

        const $ = cheerio.load(html);

        // Extract statement
        const statement = $('#task-statement').html() || '';
        if (!statement || statement.trim().length < 20) {
          console.warn('[PlatformImport:AC] Empty statement for', problem.id);
          continue;
        }

        // Extract sections
        const sections = [];
        $('#task-statement .part h3').each((i, el) => {
          sections.push(cheerio.load(el).text().trim());
        });

        // Extract samples
        const sampleInputs = [];
        const sampleOutputs = [];
        $('#task-statement .part').each((i, el) => {
          const $part = cheerio.load(el);
          const heading = $part('h3').text();
          if (heading.includes('Input') || heading.includes('入力')) {
            $part('pre.prettyprint').each((j, pre) => {
              const text = cheerio.load(pre).text().trim();
              if (text.length > 0) sampleInputs.push(text);
            });
          } else if (heading.includes('Output') || heading.includes('出力')) {
            $part('pre.prettyprint').each((j, pre) => {
              const text = cheerio.load(pre).text().trim();
              if (text.length > 0) sampleOutputs.push(text);
            });
          }
        });

        if (sampleInputs.length === 0) {
          console.warn('[PlatformImport:AC] No samples for', problem.id);
          continue;
        }

        const difficulty = models[problem.id]?.difficulty || safeMaxDifficulty;

        results.push({
          sourceId: `ac_${problem.id}`,
          sourcePlatform: 'atcoder',
          sourceUrl: `https://atcoder.jp/contests/${problem.contest_id}/tasks/${problem.id}`,
          originalTitle: problem.title || problem.id,
          originalStatement: cleanHtml(statement),
          inputFormat: 'See problem statement',
          outputFormat: 'See problem statement',
          sampleInputs,
          sampleOutputs,
          difficulty: maxDifficulty <= 200 ? 'easy' : 'medium',
          tags: [],
          constraints: `AtCoder ${problem.contest_id} ${problem.id}`,
          difficulty: difficulty
        });

        console.log('[PlatformImport:AC] ✓ Added', problem.title, '(difficulty:', difficulty + ')');
      } catch (err) {
        console.warn('[PlatformImport:AC] Problem fetch failed:', err.message);
      }
    }

    return results;
  } catch (err) {
    console.error('[PlatformImport:AC] Fatal:', err.message);
    throw err;
  }
}

/**
 * Fetch problems from HackerRank with STRICT filters
 * HARD FILTERS:
 *   - difficulty: 'easy' ONLY (never medium or hard)
 *   - max_score <= 20
 *   - subdomains: arrays, strings, sorting, implementation ONLY
 */
async function fetchHackerRankProblems({ subdomain = 'arrays', count = 5 } = {}) {
  console.log('[PlatformImport:HR] Fetching:', { subdomain, count });

  // Difficulty is ALWAYS 'easy' - hardcoded, never changes
  const allowedSubdomains = new Set(['arrays', 'strings', 'sorting', 'implementation']);
  if (!allowedSubdomains.has(subdomain)) {
    console.warn('[PlatformImport:HR] Subdomain not in allowed list:', subdomain);
    return [];
  }

  try {
    console.log('[PlatformImport:HR] Fetching challenges');
    const response = await fetch(
      `https://www.hackerrank.com/rest/contests/master/challenges?offset=0&limit=50&filters[difficulty][]=easy&filters[subdomains][]=${subdomain}`,
      {
        timeout: 10000,
        headers: { 'User-Agent': 'LabGuard-Academic-Tool/1.0' }
      }
    );

    if (!response.ok) throw new Error(`HR API status ${response.status}`);
    const json = await response.json();

    if (!Array.isArray(json.challenges)) {
      throw new Error('Invalid HR API response');
    }

    // Filter by max_score <= 20 (HARD FILTER)
    const filtered = json.challenges.filter(c => (c.max_score || 0) <= 20);

    console.log('[PlatformImport:HR] Filtered down to', filtered.length, 'challenges');

    // Shuffle and take candidates
    const shuffled = filtered.sort(() => Math.random() - 0.5);
    const candidates = shuffled.slice(0, Math.min(count * 2, filtered.length));

    const results = [];
    for (let i = 0; i < candidates.length && results.length < count; i++) {
      const challenge = candidates[i];
      await sleep(1000);

      try {
        console.log('[PlatformImport:HR] Fetching:', challenge.slug);
        const detailResp = await fetch(
          `https://www.hackerrank.com/rest/contests/master/challenges/${challenge.slug}`,
          {
            timeout: 10000,
            headers: { 'User-Agent': 'LabGuard-Academic-Tool/1.0' }
          }
        );

        if (!detailResp.ok) {
          console.warn('[PlatformImport:HR] HTTP', detailResp.status, 'for', challenge.slug);
          continue;
        }

        const detail = await detailResp.json();
        const $ = cheerio.load(detail.body_html || '');

        // Clean statement
        const statement = cleanHtml(detail.body_html || '');
        if (!statement || statement.length < 20) {
          console.warn('[PlatformImport:HR] Empty statement for', challenge.slug);
          continue;
        }

        // Extract samples
        const sampleInputs = [];
        const sampleOutputs = [];

        if (detail.sample_test_cases && Array.isArray(detail.sample_test_cases)) {
          for (const sample of detail.sample_test_cases) {
            if (sample.input) sampleInputs.push(sample.input);
            if (sample.output) sampleOutputs.push(sample.output);
          }
        }

        if (sampleInputs.length === 0) {
          console.warn('[PlatformImport:HR] No samples for', challenge.slug);
          continue;
        }

        results.push({
          sourceId: `hr_${challenge.slug}`,
          sourcePlatform: 'hackerrank',
          sourceUrl: `https://www.hackerrank.com/challenges/${challenge.slug}`,
          originalTitle: challenge.name || challenge.slug,
          originalStatement: statement,
          inputFormat: 'See problem statement',
          outputFormat: 'See problem statement',
          sampleInputs,
          sampleOutputs,
          difficulty: 'easy',
          tags: [subdomain],
          constraints: `HackerRank - ${challenge.difficulty_name} - ${challenge.max_score}pt`,
          maxScore: challenge.max_score
        });

        console.log('[PlatformImport:HR] ✓ Added', challenge.name);
      } catch (err) {
        console.warn('[PlatformImport:HR] Challenge fetch failed:', err.message);
      }
    }

    return results;
  } catch (err) {
    console.error('[PlatformImport:HR] Fatal:', err.message);
    throw err;
  }
}

module.exports = {
  fetchCodeforcesProblems,
  fetchAtCoderProblems,
  fetchHackerRankProblems,
  cleanHtml,
  sleep
};
