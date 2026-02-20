import { fetch as undiciFetch, ProxyAgent } from 'undici';

/**
 * Fetch a MediaMarkt seller page, optionally through a proxy.
 *
 * Set the PROXY_URL environment variable in Vercel to route requests
 * through a residential/rotating proxy (e.g. http://user:pass@proxy:port).
 */
export async function fetchSellerPage(sellerId, { language = 'nl-NL', timeoutMs = 25000 } = {}) {
  const targetUrl = `https://www.mediamarkt.nl/nl/marketplace/seller/${sellerId}`;

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': `${language},${language.split('-')[0]};q=0.9,en-US;q=0.8,en;q=0.7`,
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

  const fetchOptions = {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  };

  const proxyUrl = process.env.PROXY_URL;
  if (proxyUrl) {
    fetchOptions.dispatcher = new ProxyAgent(proxyUrl);
  }

  return undiciFetch(targetUrl, fetchOptions);
}
