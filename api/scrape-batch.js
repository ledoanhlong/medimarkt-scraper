/**
 * Vercel serverless function to scrape multiple MediaMarkt sellers in one call.
 *
 * POST /api/scrape-batch
 * Body (JSON):
 *   {
 *     "sellerIds": [1000, 1001, 1002],   // required, max 5
 *     "country": "NL",                    // optional, defaults to "NL"
 *     "language": "nl-NL"                 // optional, defaults to "nl-NL"
 *   }
 */

import { fetchSellerPage } from '../lib/fetch.js';
import { parseSellerPage } from '../lib/parse.js';

const MAX_BATCH_SIZE = 5;
const DELAY_MS = 2000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { sellerIds, language = 'nl-NL' } = req.body || {};

  if (!Array.isArray(sellerIds) || sellerIds.length === 0) {
    return res
      .status(400)
      .json({ error: 'sellerIds must be a non-empty array of integers' });
  }

  if (sellerIds.length > MAX_BATCH_SIZE) {
    return res
      .status(400)
      .json({ error: `Maximum batch size is ${MAX_BATCH_SIZE}` });
  }

  const ids = sellerIds.map((id) => parseInt(id, 10));
  if (ids.some((id) => isNaN(id) || id < 1)) {
    return res.status(400).json({ error: 'All sellerIds must be positive integers' });
  }

  const results = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];

    try {
      const response = await fetchSellerPage(id, { language, timeoutMs: 10000 });

      if (!response.ok) {
        results.push({ sellerId: id, error: `HTTP ${response.status}` });
      } else {
        const html = await response.text();
        results.push(parseSellerPage(html, id));
      }
    } catch (err) {
      results.push({
        sellerId: id,
        error: err.name === 'TimeoutError' ? 'Timeout' : err.message,
      });
    }

    // Rate-limit delay between requests (skip after last one)
    if (i < ids.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  return res.status(200).json({ results });
}
