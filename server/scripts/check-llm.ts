/**
 * Verifies a real Gemini key end to end.
 *
 * Run after adding GEMINI_API_KEY to .env:
 *
 *   npm run llm:check
 *
 * It makes two live calls — one Pro extraction and one Flash normalisation —
 * against inputs this product actually has to handle, and reports latency and
 * token usage. Cheaper and far faster than discovering a bad key or a wrong
 * model id through a failing request in the app.
 */
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

import {
  buildExtractionPrompt,
  EXTRACTION_SCHEMA,
} from '../src/infra/llm/prompts/extraction.prompt';

const CASES = [
  '300 रुपये किराने पे खर्च किए',
  'petrol bharwaya 1200 hdfc card',
  'groceries 300, uber 640, and bijli ka bill 2400',
];

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error(
      '✗ GEMINI_API_KEY is not set.\n' +
        '  Add it to server/.env, then run this again.\n' +
        '  Until then the app uses the deterministic fake adapter.',
    );
    process.exitCode = 1;
    return;
  }

  const proModel = process.env.GEMINI_MODEL_PRO ?? 'gemini-2.5-pro';
  const flashModel = process.env.GEMINI_MODEL_FLASH ?? 'gemini-2.5-flash';
  const client = new GoogleGenAI({ apiKey });

  console.log(`Checking Gemini…\n  pro   ${proModel}\n  flash ${flashModel}\n`);

  const context = {
    categories: [
      'Groceries',
      'Eating out',
      'Travel',
      'Fuel',
      'Utilities',
      'Income',
    ],
    accounts: ['SBI Savings', 'HDFC Millennia', 'Cash'],
    knownMerchants: ['Swiggy', 'DMart', 'Uber'],
    today: new Date(),
    timezone: 'Asia/Kolkata',
  };

  let failures = 0;

  for (const text of CASES) {
    const startedAt = Date.now();

    try {
      const response = await client.models.generateContent({
        model: proModel,
        contents: [{ role: 'user', parts: [{ text }] }],
        config: {
          systemInstruction: buildExtractionPrompt(context),
          responseMimeType: 'application/json',
          responseSchema: EXTRACTION_SCHEMA as unknown as object,
          temperature: 0,
          thinkingConfig: {
            thinkingBudget: Number(process.env.GEMINI_THINKING_BUDGET ?? 0),
          },
        },
      });

      const parsed = JSON.parse(response.text ?? '{}') as {
        detectedLanguage?: string;
        candidates?: {
          amountMinor?: number;
          category?: string;
          account?: string;
          confidence?: number;
        }[];
      };

      const elapsed = Date.now() - startedAt;
      const usage = response.usageMetadata;

      console.log(`✓ "${text}"`);
      console.log(
        `    ${elapsed}ms · ${usage?.promptTokenCount ?? '?'} in / ` +
          `${usage?.candidatesTokenCount ?? '?'} out · ` +
          `language ${parsed.detectedLanguage ?? '?'}`,
      );

      for (const candidate of parsed.candidates ?? []) {
        const rupees =
          candidate.amountMinor === undefined
            ? '?'
            : (candidate.amountMinor / 100).toLocaleString('en-IN');
        console.log(
          `    → ₹${rupees}  ${candidate.category ?? '—'}  ` +
            `${candidate.account ?? '—'}  (${candidate.confidence ?? '?'})`,
        );
      }
      console.log();
    } catch (error) {
      failures += 1;
      console.error(`✗ "${text}"`);
      console.error(`    ${describe(error)}\n`);
    }
  }

  // Flash tier, exercised separately so a model-id mistake in either one is
  // visible on its own rather than as a single opaque failure.
  try {
    const startedAt = Date.now();
    const response = await client.models.generateContent({
      model: flashModel,
      contents: [{ role: 'user', parts: [{ text: 'SWIGGY*BLR9284' }] }],
      config: {
        systemInstruction:
          'Return the clean business name from this payment descriptor. ' +
          'Reply with the name and nothing else.',
        temperature: 0,
        // Matches the adapter: thinking tokens come out of this same budget,
        // and 32 with thinking on returns an empty string.
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 64,
      },
    });

    console.log(
      `✓ flash: "SWIGGY*BLR9284" → "${(response.text ?? '').trim()}" ` +
        `(${Date.now() - startedAt}ms)`,
    );
  } catch (error) {
    failures += 1;
    console.error(`✗ flash tier: ${describe(error)}`);
  }

  console.log(
    failures === 0
      ? '\nAll checks passed. Remove LLM_DRIVER=fake from .env to use Gemini.'
      : `\n${failures} check(s) failed.`,
  );

  if (failures > 0) process.exitCode = 1;
}

/**
 * Turns Google's wall of JSON into the one sentence that matters.
 *
 * Quota errors are the common case and the raw message buries the useful part
 * — the actual limit — under several hundred characters of links and metadata.
 */
function describe(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  const limit =
    /"quotaValue":\s*"(\d+)"/.exec(raw)?.[1] ?? /limit: (\d+)/.exec(raw)?.[1];
  const perDay = /PerDay/i.test(raw);

  if (/RESOURCE_EXHAUSTED|429/.test(raw)) {
    if (limit === '0') {
      return (
        'Quota is zero for this model — it is not available on the free tier. ' +
        'Enable billing on the Google Cloud project, or point ' +
        'GEMINI_MODEL_PRO at gemini-2.5-flash.'
      );
    }
    return (
      `Quota exhausted${limit ? ` (limit ${limit}${perDay ? '/day' : '/min'})` : ''}. ` +
      'The free tier allows very few requests per day — enable billing for ' +
      'real development, or set LLM_DRIVER=fake to work offline.'
    );
  }

  if (/API key not valid|API_KEY_INVALID|401|403/.test(raw)) {
    return 'The API key was rejected. Check GEMINI_API_KEY in server/.env.';
  }

  if (/not found|404/i.test(raw)) {
    return 'Model not found — check GEMINI_MODEL_PRO / GEMINI_MODEL_FLASH.';
  }

  return raw.slice(0, 300);
}

void main();
