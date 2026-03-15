/**
 * PDFTextExtractor – extract text from exam PDFs for question extraction.
 * Uses pdf-parse (PDFParse) for full text and per-page text.
 */
const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

class PDFTextExtractor {
  /**
   * Extract full text and optionally per-page text from a PDF file.
   * @param {string} pdfFilePath - Absolute path to the PDF file
   * @returns {Promise<{ fullText: string, numPages: number, pageTexts?: string[] }>}
   */
  async extract(pdfFilePath) {
    if (!pdfFilePath || typeof pdfFilePath !== 'string') {
      throw new Error('PDF file path is required');
    }
    const resolved = path.resolve(pdfFilePath);
    if (!fs.existsSync(resolved)) {
      throw new Error('PDF file not found');
    }
    const buffer = fs.readFileSync(resolved);
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      await parser.destroy();
      const fullText = result.text || '';
      const numPages = result.total || 0;
      const pageTexts = (result.pages && result.pages.length > 0)
        ? result.pages
            .sort((a, b) => (a.num || 0) - (b.num || 0))
            .map((p) => p.text || '')
        : undefined;
      return {
        fullText,
        numPages,
        pageTexts
      };
    } catch (err) {
      await parser.destroy().catch(() => {});
      throw err;
    }
  }

  /**
   * Split full text into candidate questions using heuristic patterns.
   * Looks for "Q1:", "Question 1", "1.", and similar numbered headings.
   * @param {string} fullText - Full extracted text
   * @param {string[]} [pageTexts] - Optional per-page text (for page attribution)
   * @returns {Array<{ title: string, description: string, page?: number }>}
   */
  splitCandidateQuestions(fullText, pageTexts) {
    if (!fullText || typeof fullText !== 'string') {
      return [];
    }
    const text = fullText.trim();
    if (!text) return [];

    // Patterns: Q1:, Q 1:, Question 1, Question 1., 1. Title, etc.
    const questionStartRegex = /(?:\n|^)\s*(?:Q\s*\d+|Question\s+\d+|\d+\.)\s*[.:)\-]\s*/gi;
    const parts = text.split(questionStartRegex).map((s) => s.trim()).filter(Boolean);

    // First segment might be preamble (before first question); rest are question 1, 2, ...
    const matches = [...text.matchAll(questionStartRegex)];
    const questions = [];
    let pageIndex = 0;
    if (parts.length === 0) {
      questions.push({
        title: 'Question 1',
        description: text,
        page: pageTexts && pageTexts.length > 0 ? 1 : undefined
      });
      return questions;
    }

    // If we have matches, first part is often preamble; align parts with question numbers
    const hasNumberedStarts = matches.length > 0;
    const startIndices = [];
    let lastIndex = 0;
    for (const m of matches) {
      startIndices.push(m.index);
    }

    if (hasNumberedStarts && startIndices.length > 0) {
      for (let i = 0; i < startIndices.length; i++) {
        const start = startIndices[i];
        const end = i + 1 < startIndices.length ? startIndices[i + 1] : text.length;
        const raw = text.slice(start, end);
        const description = raw.replace(/^[\s\n]*(?:Q\s*\d+|Question\s+\d+|\d+\.)\s*[.:)\-]\s*/i, '').trim();
        const num = i + 1;
        questions.push({
          title: `Question ${num}`,
          description: description || '(No content)',
          page: pageTexts && pageTexts.length > 0 ? inferPageForOffset(text, start, pageTexts) : undefined
        });
      }
    } else {
      parts.forEach((desc, i) => {
        questions.push({
          title: `Question ${i + 1}`,
          description: desc,
          page: pageTexts && pageTexts.length > 0 ? Math.min(i + 1, pageTexts.length) : undefined
        });
      });
    }

    return questions;
  }

  /**
   * Extract text and split into candidate questions in one call.
   * @param {string} pdfFilePath - Path to PDF
   * @returns {Promise<{ fullText: string, numPages: number, questions: Array<{ title: string, description: string, page?: number }> }>}
   */
  async extractAndSplit(pdfFilePath) {
    const { fullText, numPages, pageTexts } = await this.extract(pdfFilePath);
    const questions = this.splitCandidateQuestions(fullText, pageTexts);
    return { fullText, numPages, questions };
  }
}

function inferPageForOffset(fullText, offset, pageTexts) {
  let cum = 0;
  for (let p = 0; p < pageTexts.length; p++) {
    cum += pageTexts[p].length;
    if (offset < cum) return p + 1;
  }
  return pageTexts.length;
}

module.exports = PDFTextExtractor;
