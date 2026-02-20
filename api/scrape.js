/**
 * Vercel serverless function to scrape a single MediaMarkt seller page.
 *
 * Query params:
 *   sellerId  (required) - The seller ID to scrape
 *   country   (optional) - Country code, defaults to "NL"
 *   language  (optional) - Language code, defaults to "nl-NL"
 *
 * GET /api/scrape?sellerId=1000
 * GET /api/scrape?sellerId=1000&country=NL&language=nl-NL
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sellerId, country = 'NL', language = 'nl-NL' } = req.query;

  if (!sellerId) {
    return res.status(400).json({ error: 'sellerId query parameter is required' });
  }

  const id = parseInt(sellerId, 10);
  if (isNaN(id) || id < 1) {
    return res.status(400).json({ error: 'sellerId must be a positive integer' });
  }

  const baseUrl = 'https://www.mediamarkt.nl';
  const targetUrl = `${baseUrl}/nl/marketplace/seller/${id}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': `${language},${language.split('-')[0]};q=0.9,en-US;q=0.8,en;q=0.7`,
      },
      signal: AbortSignal.timeout(25000),
    });

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
  // --- Extract rating data from aria-label ---
  const ratingMatch = html.match(
    /aria-label="Beoordeling:\s*([\d.]+)\s*van de\s*([\d.]+)\s*sterren op basis van\s*(\d+)\s*recensies"/
  );
  const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
  const ratingOutOf = ratingMatch ? parseFloat(ratingMatch[2]) : null;
  const reviewCount = ratingMatch ? parseInt(ratingMatch[3]) : null;

  // --- Extract business name from h1 tag ---
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
  const businessName = h1Match ? cleanText(h1Match[1]) : '';

  // --- Extract phone from tel: href ---
  const phoneMatch = html.match(/href=["']tel:([^"']+)["']/);
  const phone = phoneMatch ? phoneMatch[1].trim() : '';

  // --- Extract all dt/dd pairs from seller data section ---
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

  // --- Extract specific fields from sellerDataSection ---
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

  // --- Extract email ---
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
