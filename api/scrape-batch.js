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
 *
 * Returns an array of results, one per seller ID.
 * Each result includes either the parsed data or an error.
 */

const MAX_BATCH_SIZE = 5;
const DELAY_MS = 2000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { sellerIds, country = 'NL', language = 'nl-NL' } = req.body || {};

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

  const baseUrl = 'https://www.mediamarkt.nl';
  const results = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const targetUrl = `${baseUrl}/nl/marketplace/seller/${id}`;

    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': `${language},${language.split('-')[0]};q=0.9,en-US;q=0.8,en;q=0.7`,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        results.push({
          sellerId: id,
          error: `HTTP ${response.status}`,
        });
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

function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSellerPage(html, sellerId) {
  const ratingMatch = html.match(
    /aria-label="Beoordeling:\s*([\d.]+)\s*van de\s*([\d.]+)\s*sterren op basis van\s*(\d+)\s*recensies"/
  );
  const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
  const ratingOutOf = ratingMatch ? parseFloat(ratingMatch[2]) : null;
  const reviewCount = ratingMatch ? parseInt(ratingMatch[3]) : null;

  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
  const businessName = h1Match ? cleanText(h1Match[1]) : '';

  const phoneMatch = html.match(/href=["']tel:([^"']+)["']/);
  const phone = phoneMatch ? phoneMatch[1].trim() : '';

  const sellerDataSection = {};
  const dtDdPattern = /<dt[^>]*>(.*?)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/gis;
  let match;
  while ((match = dtDdPattern.exec(html)) !== null) {
    const key = cleanText(match[1]);
    const value = cleanText(match[2]);
    if (key && value) {
      sellerDataSection[key] = value;
    }
  }

  const companyNamePatterns = [
    'Officiële bedrijfsnaam',
    'Official company name',
    'Offizieller Firmenname',
    'Firmenname',
  ];
  const addressPatterns = ['Kantooradres', 'Office address', 'Geschäftsadresse', 'Adresse'];
  const zipCodePatterns = ['Postcode', 'ZIP code', 'Postleitzahl', 'PLZ'];
  const cityPatterns = ['Plaats', 'City', 'Stadt', 'Ort'];
  const kvkPatterns = [
    'Kamer van Koophandel nummer',
    'Chamber of Commerce number',
    'Handelskammernummer',
  ];
  const vatPatterns = [
    'BTW-nummer',
    'VAT number',
    'USt-IdNr',
    'Umsatzsteuer-Identifikationsnummer',
  ];
  const emailPatterns = ['E-mailadres', 'Email address', 'E-Mail-Adresse', 'Email', 'E-mail'];

  function findValue(patterns) {
    for (const pattern of patterns) {
      if (sellerDataSection[pattern]) {
        return sellerDataSection[pattern];
      }
    }
    return '';
  }

  const companyName = findValue(companyNamePatterns);
  const address = findValue(addressPatterns);
  const zipCode = findValue(zipCodePatterns);
  const city = findValue(cityPatterns);
  const kvkNumber = findValue(kvkPatterns);
  const vatNumber = findValue(vatPatterns);

  let email = '';
  const sellerEmail = findValue(emailPatterns);

  if (sellerEmail) {
    email = sellerEmail;
  } else {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailMatches = html.match(emailRegex) || [];

    const excludePatterns = [
      'sentry.io',
      'analytics',
      'tracking',
      'monitoring',
      'noreply',
      'no-reply',
      'donotreply',
      'privacy@',
      'info@mediamarkt',
      'support@mediamarkt',
      'contact@mediamarkt',
      'service@mediamarkt',
      'help@mediamarkt',
      'customerservice@mediamarkt',
      'klantenservice@mediamarkt',
    ];

    const filteredEmails = emailMatches.filter((emailAddr) => {
      const lowerEmail = emailAddr.toLowerCase();
      const hasExcludedPattern = excludePatterns.some((pattern) =>
        lowerEmail.includes(pattern.toLowerCase())
      );
      const startsWithUnicode = /^\\u/.test(emailAddr);
      return !hasExcludedPattern && !startsWithUnicode;
    });

    email = filteredEmails.length > 0 ? filteredEmails[0] : '';
  }

  return {
    sellerId,
    rating,
    ratingOutOf,
    reviewCount,
    businessName,
    email,
    phone,
    companyName,
    address,
    zipCode,
    city,
    kvkNumber,
    vatNumber,
    sellerDataSection,
  };
}
