// backend/src/tests/audit/llm-notes-only-test.ts

import * as dotenv from 'dotenv';
dotenv.config();

import OpenAI from 'openai';
import { generateEmbedding } from '../../classifier/attribute-extractor';
import { globalSemanticSearch, getChapterNotes } from '../../database/hs-codes';
import testData from '../test-data/comprehensive-test-set.json';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function classifyWithNotesOnly(query: string): Promise<{ chapter: string; reasoning: string }> {
  // Step 1: Semantic search to find candidate chapters
  const embedding = await generateEmbedding(query);
  const candidates = await globalSemanticSearch(embedding, 30);

  // Step 2: Get unique chapters
  const candidateChapters = [...new Set(candidates.map((c: any) => c.code.substring(0, 2)))].slice(0, 5);

  // Step 3: Get FULL notes for these chapters
  const chapterNotes = await getChapterNotes(candidateChapters as string[]);

  // Step 4: Build context with notes
  let notesContext = '';
  for (const chapter of candidateChapters) {
    const data = chapterNotes.get(chapter);
    if (data) {
      notesContext += `\n\n=== CHAPTER ${chapter}: ${data.description} ===\n`;
      if (data.notes?.chapterNotes && data.notes.chapterNotes.length > 0) {
        notesContext += `CHAPTER NOTES:\n`;
        data.notes.chapterNotes.slice(0, 5).forEach((note: string, i: number) => {
          notesContext += `${i + 1}. ${note}\n`;
        });
      }
      if (data.notes?.sectionNotes && data.notes.sectionNotes.length > 0) {
        notesContext += `SECTION NOTES:\n`;
        data.notes.sectionNotes.slice(0, 3).forEach((note: string, i: number) => {
          notesContext += `${i + 1}. ${note}\n`;
        });
      }
    }
  }

  // Step 5: LLM decides based on notes
  const prompt = `You are an HS Code classification expert. Classify this product into the correct CHAPTER.

PRODUCT TO CLASSIFY:
"${query}"

CANDIDATE CHAPTERS AND THEIR OFFICIAL NOTES:
${notesContext}

CLASSIFICATION RULES:
1. READ the chapter notes carefully - they contain EXCLUSIONS and INCLUSIONS
2. If a chapter note says "This chapter does not cover X", then X cannot be in that chapter
3. Apply GIR 1: Classification is determined by the terms of headings AND chapter notes
4. Apply GIR 3(a): Most specific description prevails
5. Parts for specific machines are classified with those machines (function over material)

Based on the chapter notes, which chapter is CORRECT for this product?

Respond with JSON only:
{
  "chapter": "XX",
  "reasoning": "Brief explanation citing relevant chapter notes"
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  });

  const choice = response.choices[0];
  if (!choice || !choice.message.content) throw new Error('Empty response');

  return JSON.parse(choice.message.content);
}

async function auditLLMNotesOnly() {
  console.log('='.repeat(60));
  console.log('AUDIT: LLM + Notes Only (No Hard-Coded Rules)');
  console.log('='.repeat(60));

  const cases = (testData as any).testCases
    .filter((tc: any) => tc.tier === 1)
    .slice(0, 50);

  console.log(`\nTesting ${cases.length} Tier 1 cases\n`);

  let correct = 0;
  const failures: any[] = [];

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    try {
      const result = await classifyWithNotesOnly(testCase.query);
      const isCorrect = result.chapter === testCase.expectedChapter;

      if (isCorrect) {
        correct++;
        console.log(`[${i + 1}/${cases.length}] \u2713 "${testCase.query.substring(0, 40)}..." -> Ch.${result.chapter}`);
      } else {
        console.log(`[${i + 1}/${cases.length}] \u2717 "${testCase.query.substring(0, 40)}..." -> Ch.${result.chapter} (expected Ch.${testCase.expectedChapter})`);
        failures.push({
          query: testCase.query,
          expected: testCase.expectedChapter,
          got: result.chapter,
          reasoning: result.reasoning
        });
      }
    } catch (error) {
      console.log(`[${i + 1}/${cases.length}] ERROR: "${testCase.query.substring(0, 40)}..." - ${error}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n' + '='.repeat(60));
  console.log('### LLM + NOTES ONLY ACCURACY ###');
  console.log('='.repeat(60));
  console.log(`Correct: ${correct}/${cases.length} (${(correct/cases.length*100).toFixed(1)}%)`);

  console.log('\n### SAMPLE FAILURES ###');
  failures.slice(0, 5).forEach(f => {
    console.log(`\nQuery: "${f.query}"`);
    console.log(`Expected: Ch.${f.expected}, Got: Ch.${f.got}`);
    console.log(`LLM Reasoning: ${f.reasoning}`);
  });

  // Group failures by expected chapter
  console.log('\n### FAILURES BY EXPECTED CHAPTER ###');
  const failuresByChapter = new Map<string, number>();
  for (const f of failures) {
    failuresByChapter.set(f.expected, (failuresByChapter.get(f.expected) || 0) + 1);
  }

  const sortedFailures = [...failuresByChapter.entries()].sort((a, b) => b[1] - a[1]);
  for (const [chapter, count] of sortedFailures) {
    console.log(`Chapter ${chapter}: ${count} failures`);
  }

  // Common misclassifications
  console.log('\n### COMMON MISCLASSIFICATION PATTERNS ###');
  const confusionMatrix = new Map<string, Map<string, number>>();
  for (const f of failures) {
    if (!confusionMatrix.has(f.expected)) {
      confusionMatrix.set(f.expected, new Map());
    }
    const inner = confusionMatrix.get(f.expected)!;
    inner.set(f.got, (inner.get(f.got) || 0) + 1);
  }

  for (const [expected, gotMap] of confusionMatrix.entries()) {
    for (const [got, count] of gotMap.entries()) {
      if (count >= 2) {
        console.log(`Ch.${expected} -> Ch.${got}: ${count} times`);
      }
    }
  }

  console.log('\n### INTERPRETATION ###');
  const accuracy = correct / cases.length;
  if (accuracy >= 0.85) {
    console.log('\u2713 LLM + Notes achieves 85%+. Consider making it PRIMARY, rules as boost.');
  } else if (accuracy >= 0.70) {
    console.log('\u26A0 LLM + Notes achieves 70-85%. Can work but needs improvement.');
  } else {
    console.log('\u2717 LLM + Notes below 70%. Notes may be incomplete or LLM not reading them correctly.');
  }

  console.log('\n### RECOMMENDATIONS ###');
  if (accuracy >= 0.80) {
    console.log('1. LLM + Notes can be primary approach');
    console.log('2. Add hard-coded rules only for speed optimization on common cases');
    console.log('3. Focus on improving notes for failing chapters');
  } else if (accuracy >= 0.60) {
    console.log('1. Current hybrid approach (rules + LLM) is justified');
    console.log('2. Improve notes quality for failing chapters');
    console.log('3. Consider adding more rules for common misclassifications');
  } else {
    console.log('1. Notes-based approach needs significant work');
    console.log('2. Check if notes are being retrieved correctly');
    console.log('3. Consider improving prompt engineering');
  }
}

auditLLMNotesOnly().catch(console.error);
