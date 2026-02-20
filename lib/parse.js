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

export function parseSellerPage(html, sellerId) {
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
