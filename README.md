# MediaMarkt Seller Scraper

Local CLI tool that scrapes MediaMarkt marketplace seller pages and saves structured data to CSV.

## Requirements

- Node.js >= 18

## Usage

```bash
# Scrape seller IDs 1–25000 (default range, resumes automatically)
node scrape.mjs

# Scrape a specific range
node scrape.mjs --from 500 --to 1000

# Custom delay between requests (default: 2000ms)
node scrape.mjs --from 500 --to 1000 --delay 3000
```

## Output

| File                    | Description                                      |
|-------------------------|--------------------------------------------------|
| `results/sellers.csv`   | All successfully scraped sellers                  |
| `results/progress.json` | Tracks which IDs have been processed (for resume) |

## CSV Columns

`sellerId`, `businessName`, `email`, `phone`, `rating`, `ratingOutOf`, `reviewCount`, `companyName`, `address`, `zipCode`, `city`, `kvkNumber`, `vatNumber`, `sellerDataSection`

## Resume Support

The scraper saves progress to `results/progress.json` after every 10 IDs. If interrupted, simply re-run the same command and it will skip already-processed IDs.
