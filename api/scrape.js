/**
 * Vercel serverless function to scrape a single MediaMarkt seller page.
 *
 * Query params:
 *   sellerId  (required) - The seller ID to scrape
 *   country   (optional) - Country code, defaults to "NL"
 *   language  (optional) - Language code, defaults to "nl-NL"
 *
 * GET /api/scrape?sellerId=1000
 */

import { fetchSellerPage } from '../lib/fetch.js';
import { parseSellerPage } from '../lib/parse.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sellerId, language = 'nl-NL' } = req.query;

  if (!sellerId) {
    return res.status(400).json({ error: 'sellerId query parameter is required' });
  }

  const id = parseInt(sellerId, 10);
  if (isNaN(id) || id < 1) {
    return res.status(400).json({ error: 'sellerId must be a positive integer' });
  }

  try {
    const response = await fetchSellerPage(id, { language });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `MediaMarkt returned HTTP ${response.status}`,
        sellerId: id,
      });
    }

    const html = await response.text();
    const data = parseSellerPage(html, id);

    return res.status(200).json(data);
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Request to MediaMarkt timed out', sellerId: id });
    }
    return res.status(500).json({ error: err.message, sellerId: id });
  }
}
