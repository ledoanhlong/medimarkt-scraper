#!/usr/bin/env node

/**
 * Local MediaMarkt seller scraper.
 *
 * Usage:
 *   node scrape.mjs                   # scrape IDs 1–15000 (resumes automatically)
 *   node scrape.mjs --from 500 --to 1000
 *   node scrape.mjs --from 500 --to 1000 --delay 3000
 *
 * Output:
 *   results/sellers.csv    — all successfully scraped sellers
 *   results/progress.json  — tracks which IDs have been processed (for resume)
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { parseSellerPage } from './lib/parse.js';

// --- Config ---
const args = parseArgs(process.argv.slice(2));
const FROM_ID = args.from ?? 1;
const TO_ID = args.to ?? 15000;
const DELAY_MS = args.delay ?? 2000;
const RESULTS_DIR = 'results';
const CSV_PATH = `${RESULTS_DIR}/sellers.csv`;
const PROGRESS_PATH = `${RESULTS_DIR}/progress.json`;
const MAX_RETRIES = 3;

const CSV_COLUMNS = [
  'sellerId',
  'businessName',
  'email',
  'phone',
  'rating',
  'ratingOutOf',
  'reviewCount',
  'companyName',
  'address',
  'zipCode',
  'city',
  'kvkNumber',
  'vatNumber',
  'sellerDataSection',
];

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="131", "Chromium";v="131"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

// --- Main ---
async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const progress = loadProgress();
  initCsv();

  const total = TO_ID - FROM_ID + 1;
  let scraped = 0;
  let found = 0;
  let errors = 0;

  console.log(`\nMediaMarkt Seller Scraper`);
  console.log(`Range: ${FROM_ID} – ${TO_ID} (${total} IDs)`);
  console.log(`Delay: ${DELAY_MS}ms between requests`);
  console.log(`Output: ${CSV_PATH}`);

  // Count already-done IDs in range
  const alreadyDone = Object.keys(progress)
    .map(Number)
    .filter((id) => id >= FROM_ID && id <= TO_ID).length;
  if (alreadyDone > 0) {
    console.log(`Resuming — ${alreadyDone} IDs already processed, skipping those`);
  }

  console.log('');

  for (let id = FROM_ID; id <= TO_ID; id++) {
    if (progress[id]) {
      continue; // already scraped
    }

    scraped++;
    const result = await scrapeSeller(id);

    if (result.error) {
      errors++;
      progress[id] = { status: 'error', error: result.error };
      logLine(id, `ERROR: ${result.error}`, total, scraped + alreadyDone, found);
    } else if (!result.businessName) {
      // Page loaded but no seller data (likely doesn't exist)
      progress[id] = { status: 'empty' };
      logLine(id, 'no seller found', total, scraped + alreadyDone, found);
    } else {
      found++;
      progress[id] = { status: 'ok' };
      appendCsvRow(result);
      logLine(id, `✓ ${result.businessName}`, total, scraped + alreadyDone, found);
    }

    // Save progress every 10 IDs
    if (scraped % 10 === 0) {
      saveProgress(progress);
    }

    // Delay before next request
    if (id < TO_ID) {
      await sleep(DELAY_MS);
    }
  }

  saveProgress(progress);

  console.log(`\n--- Done ---`);
  console.log(`Processed: ${scraped + alreadyDone} / ${total}`);
  console.log(`Sellers found: ${found}`);
  console.log(`Errors: ${errors}`);
  console.log(`Results saved to: ${CSV_PATH}`);
}

async function scrapeSeller(sellerId) {
  const url = `https://www.mediamarkt.nl/nl/marketplace/seller/${sellerId}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(30000),
      });

      if (response.status === 404) {
        return { sellerId, error: null, businessName: '' };
      }

      if (!response.ok) {
        if (attempt < MAX_RETRIES) {
          await sleep(5000 * attempt);
          continue;
        }
        return { sellerId, error: `HTTP ${response.status}` };
      }

      const html = await response.text();
      return parseSellerPage(html, sellerId);
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(5000 * attempt);
        continue;
      }
      return { sellerId, error: err.message };
    }
  }
}

// --- CSV helpers ---
function initCsv() {
  if (!existsSync(CSV_PATH)) {
    writeFileSync(CSV_PATH, CSV_COLUMNS.join(',') + '\n', 'utf-8');
  }
}

function appendCsvRow(data) {
  const row = CSV_COLUMNS.map((col) => {
    let val = data[col];
    if (val === null || val === undefined) val = '';
    if (typeof val === 'object') val = JSON.stringify(val);
    val = String(val);
    // Escape CSV: wrap in quotes if it contains comma, quote, or newline
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      val = '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  });
  appendFileSync(CSV_PATH, row.join(',') + '\n', 'utf-8');
}

// --- Progress helpers ---
function loadProgress() {
  if (existsSync(PROGRESS_PATH)) {
    return JSON.parse(readFileSync(PROGRESS_PATH, 'utf-8'));
  }
  return {};
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_PATH, JSON.stringify(progress), 'utf-8');
}

// --- Utilities ---
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logLine(id, message, total, done, found) {
  const pct = ((done / total) * 100).toFixed(1);
  process.stdout.write(`\r[${done}/${total} ${pct}%] ID ${id}: ${message}          \n`);
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from' && argv[i + 1]) result.from = parseInt(argv[i + 1], 10);
    if (argv[i] === '--to' && argv[i + 1]) result.to = parseInt(argv[i + 1], 10);
    if (argv[i] === '--delay' && argv[i + 1]) result.delay = parseInt(argv[i + 1], 10);
  }
  return result;
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
