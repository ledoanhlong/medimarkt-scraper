# MediaMarkt Seller Scraper

Vercel serverless API that scrapes MediaMarkt marketplace seller pages and returns structured JSON data. Designed to be called from n8n (or any HTTP client).

## Endpoints

### `GET /api/scrape`

Scrape a single seller.

| Param      | Required | Default  | Description                  |
|------------|----------|----------|------------------------------|
| `sellerId` | Yes      | -        | Seller ID (positive integer) |
| `country`  | No       | `NL`     | Country code                 |
| `language` | No       | `nl-NL`  | Language code                |

**Example:**

```
GET /api/scrape?sellerId=1000
```

**Response:**

```json
{
  "sellerId": 1000,
  "rating": 4.5,
  "ratingOutOf": 5,
  "reviewCount": 123,
  "businessName": "Example Store",
  "email": "info@example.com",
  "phone": "+31612345678",
  "companyName": "Example B.V.",
  "address": "Straat 1",
  "zipCode": "1234 AB",
  "city": "Amsterdam",
  "kvkNumber": "12345678",
  "vatNumber": "NL123456789B01",
  "sellerDataSection": { ... }
}
```

### `POST /api/scrape-batch`

Scrape up to 5 sellers in one call (includes a 2s delay between requests).

**Request body (JSON):**

```json
{
  "sellerIds": [1000, 1001, 1002],
  "country": "NL",
  "language": "nl-NL"
}
```

**Response:**

```json
{
  "results": [
    { "sellerId": 1000, "businessName": "...", ... },
    { "sellerId": 1001, "error": "HTTP 404" },
    { "sellerId": 1002, "businessName": "...", ... }
  ]
}
```

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com), import the repo
3. Add the `PROXY_URL` environment variable (see below)
4. Deploy — no build settings needed, Vercel auto-detects the `api/` directory

Your API will be live at `https://your-project.vercel.app/api/scrape`.

## Proxy Setup (Required)

MediaMarkt blocks requests from datacenter IPs (like Vercel's). You need a residential proxy.

In your Vercel project, go to **Settings > Environment Variables** and add:

| Name        | Value                                      |
|-------------|--------------------------------------------|
| `PROXY_URL` | `http://username:password@proxy-host:port`  |

Affordable residential proxy providers:
- **Webshare** — rotating residential proxies, free tier available
- **Bright Data** — residential proxies with pay-as-you-go
- **SmartProxy** — residential rotating proxies

The proxy URL format depends on the provider, but is typically `http://user:pass@host:port`.

## Using with n8n

In n8n, replace the heavy scraping workflow with a simple HTTP Request node:

1. **Generate Seller IDs** — same as before, loop from 1 to 15000
2. **HTTP Request node** — `GET https://your-project.vercel.app/api/scrape?sellerId={{ $json.sellerId }}`
3. **Google Sheets node** — write the JSON response fields to your sheet

n8n handles the batching/pacing, and the Vercel function handles the fetch + parse.
