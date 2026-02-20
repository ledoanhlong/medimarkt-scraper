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
    .replace(/\\u002F/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract the seller JSON object from window.__PRELOADED_STATE__ in the HTML.
 * The seller data is nested under a GraphqlMarketplaceSeller typename.
 */
function extractSellerJson(html) {
  // Match the seller object from the preloaded state
  const sellerMatch = html.match(
    /"__typename"\s*:\s*"GraphqlMarketplaceSeller"\s*,\s*"id"\s*:\s*"(\d+)"\s*,\s*"name"\s*:\s*"([^"]*)"(.*?)(?="optimizelyDataFile"|"__typename"\s*:\s*"(?!Graphql))/s
  );

  if (!sellerMatch) return null;

  // Build a valid JSON string from the matched content
  const jsonStr = `{"__typename":"GraphqlMarketplaceSeller","id":"${sellerMatch[1]}","name":"${sellerMatch[2]}"${sellerMatch[3]}`;

  // Find the end of the seller object by counting braces
  let depth = 0;
  let end = -1;
  for (let i = 0; i < jsonStr.length; i++) {
    if (jsonStr[i] === '{') depth++;
    else if (jsonStr[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end === -1) return null;

  try {
    return JSON.parse(jsonStr.substring(0, end));
  } catch {
    return null;
  }
}

/**
 * Parse the imprint field which may contain structured company info as HTML/text.
 * Common format: lines with company name, address, registration numbers, etc.
 */
function parseImprint(imprint) {
  if (!imprint) return {};

  const text = cleanText(imprint);
  const result = {};

  // Try to extract KvK/Chamber of Commerce number
  const kvkMatch = text.match(/(?:KvK|Kamer van Koophandel|Chamber of Commerce|Handelsregister)[:\s]*([A-Z0-9-]+)/i);
  if (kvkMatch) result.kvkNumber = kvkMatch[1].trim();

  // Try to extract VAT/BTW number
  const vatMatch = text.match(/(?:BTW|VAT|USt-IdNr|Umsatzsteuer)[:\s-]*([A-Z]{2}[A-Z0-9]+)/i);
  if (vatMatch) result.vatNumber = vatMatch[1].trim();

  // Store the full imprint text
  result.imprintText = text;

  return result;
}

export function parseSellerPage(html, sellerId) {
  // --- Try to extract seller data from embedded JSON ---
  const sellerJson = extractSellerJson(html);

  // --- Extract rating from aria-label (most reliable) ---
  const ratingMatch = html.match(
    /aria-label="Beoordeling:\s*([\d.]+)\s*van de\s*([\d.]+)\s*sterren op basis van\s*(\d+)\s*recensies"/
  );
  const rating = ratingMatch ? parseFloat(ratingMatch[1]) : (sellerJson?.rating ?? null);
  const ratingOutOf = ratingMatch ? parseFloat(ratingMatch[2]) : (sellerJson ? 5 : null);
  const reviewCount = ratingMatch ? parseInt(ratingMatch[3]) : (sellerJson?.visibleReviewsCount ?? null);

  // --- Business name: from JSON first, then h1 fallback ---
  let businessName = sellerJson?.name || '';
  if (!businessName) {
    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
    businessName = h1Match ? cleanText(h1Match[1]) : '';
  }

  // --- Contact info from JSON ---
  const contactInfo = sellerJson?.contactInfoForCustomers || {};
  let email = contactInfo.email || '';
  let phone = contactInfo.phone || '';

  // --- Phone fallback: extract from tel: href, but filter out "undefined" ---
  if (!phone) {
    const phoneMatch = html.match(/href=["']tel:([^"']+)["']/);
    if (phoneMatch) {
      const extracted = phoneMatch[1].trim();
      if (extracted && extracted !== 'undefined' && extracted !== 'null') {
        phone = extracted;
      }
    }
  }

  // --- Email fallback: from dt/dd pairs, then regex scan ---
  if (!email) {
    // Try dt/dd pairs
    const dtDdPattern = /<dt[^>]*>(.*?)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/gis;
    let match;
    const emailLabels = ['E-mailadres', 'Email address', 'E-Mail-Adresse', 'Email', 'E-mail'];
    while ((match = dtDdPattern.exec(html)) !== null) {
      const key = cleanText(match[1]);
      if (emailLabels.some((label) => key.includes(label))) {
        const val = cleanText(match[2]);
        if (val && val.includes('@')) {
          email = val;
          break;
        }
      }
    }
  }

  if (!email) {
    // Regex scan as last resort
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
      'mediamarkt.nl',
      'mediamarkt.de',
      'mediamarkt.at',
      'mediamarkt.es',
      'mediamarkt.it',
      'mediamarkt.be',
      'mediamarkt.com',
      'placeholder',
      'example.com',
      'jan.janssen',
    ];

    const filteredEmails = emailMatches.filter((emailAddr) => {
      const lower = emailAddr.toLowerCase();
      return !excludePatterns.some((p) => lower.includes(p)) && !/^\\u/.test(emailAddr);
    });

    email = filteredEmails.length > 0 ? filteredEmails[0] : '';
  }

  // --- Extract all dt/dd pairs (some pages may use them) ---
  const sellerDataSection = {};
  const dtDdPattern2 = /<dt[^>]*>(.*?)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/gis;
  let ddMatch;
  while ((ddMatch = dtDdPattern2.exec(html)) !== null) {
    const key = cleanText(ddMatch[1]);
    const value = cleanText(ddMatch[2]);
    if (key && value) {
      sellerDataSection[key] = value;
    }
  }

  // --- Extract fields from dt/dd pairs ---
  function findValue(patterns) {
    for (const pattern of patterns) {
      if (sellerDataSection[pattern]) return sellerDataSection[pattern];
    }
    return '';
  }

  let companyName = findValue([
    'Officiële bedrijfsnaam', 'Official company name',
    'Offizieller Firmenname', 'Firmenname',
  ]);
  let address = findValue(['Kantooradres', 'Office address', 'Geschäftsadresse', 'Adresse']);
  let zipCode = findValue(['Postcode', 'ZIP code', 'Postleitzahl', 'PLZ']);
  let city = findValue(['Plaats', 'City', 'Stadt', 'Ort']);
  let kvkNumber = findValue([
    'Kamer van Koophandel nummer', 'Chamber of Commerce number', 'Handelskammernummer',
  ]);
  let vatNumber = findValue([
    'BTW-nummer', 'VAT number', 'USt-IdNr', 'Umsatzsteuer-Identifikationsnummer',
  ]);

  // --- Parse imprint from JSON for additional company info ---
  const legalInfo = sellerJson?.legalInformation || {};
  const imprintData = parseImprint(legalInfo.imprint);

  if (!kvkNumber && imprintData.kvkNumber) kvkNumber = imprintData.kvkNumber;
  if (!vatNumber && imprintData.vatNumber) vatNumber = imprintData.vatNumber;

  // --- Additional fields from JSON ---
  const sellerState = sellerJson?.state || '';
  const fax = sellerJson?.contactInformation?.fax || '';
  const serviceHours = contactInfo.serviceHours || '';
  const generalTermsUrl = legalInfo.generalBusinessTermsUrl || '';
  const imprintText = imprintData.imprintText || '';

  // --- Add JSON-sourced data into sellerDataSection for transparency ---
  if (sellerJson) {
    if (sellerState) sellerDataSection['Seller State'] = sellerState;
    if (fax) sellerDataSection['Fax'] = fax;
    if (serviceHours) sellerDataSection['Service Hours'] = serviceHours;
    if (generalTermsUrl) sellerDataSection['General Terms URL'] = generalTermsUrl;
    if (imprintText) sellerDataSection['Imprint'] = imprintText;
    if (sellerJson.dsaConsent != null) sellerDataSection['DSA Consent'] = String(sellerJson.dsaConsent);
    if (sellerJson.dataProtectionInformation) {
      sellerDataSection['Data Protection'] = String(sellerJson.dataProtectionInformation);
    }

    // Add shipping details
    const shipping = sellerJson.sellerShippingDetails;
    if (shipping && shipping.length > 0) {
      const shippingInfo = shipping.map((s) => {
        const parts = [s.shippingCountry, s.shippingType];
        if (s.freeShippingThreshold) {
          parts.push(`free above ${s.freeShippingThreshold.amount} ${s.freeShippingThreshold.currency}`);
        }
        return parts.filter(Boolean).join(' - ');
      });
      sellerDataSection['Shipping'] = shippingInfo.join('; ');
    }
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
