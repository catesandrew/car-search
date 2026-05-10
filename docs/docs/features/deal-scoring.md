---
sidebar_position: 1
---

# Deal Scoring Algorithm

Every listing is assigned a deal score from **0 to 10** using a two-layer algorithm implemented in `src/lib/scoring.ts`. Scores are computed when listings are first ingested and recomputed whenever the search config changes (e.g., you update `priceMax`).

## Score Color Coding

| Range | Color | Meaning |
|-------|-------|---------|
| ≥ 7.0 | Green | Good deal |
| 4.0 – 6.9 | Yellow | Fair |
| < 4.0 | Red | Overpriced or risky |

## Layer 1 — Absolute Scoring

The baseline score starts at **5.0** and is adjusted based on the listing's own attributes.

### Price vs Budget

Compares the listing price against your configured `priceMax`.

| Price Ratio (price / priceMax) | Adjustment |
|-------------------------------|-----------|
| < 60% of budget | +1.5 |
| 60–80% of budget | +0.5 |
| > 95% of budget | −0.5 |

### Miles Per Year

Divides the listing's mileage by the vehicle's age (current year minus model year) to get an annualized mileage figure.

| Miles per Year | Adjustment |
|---------------|-----------|
| < 10,000 | +0.5 |
| 10,000–12,000 | +0.25 |
| 15,001–20,000 | −0.25 |
| > 20,000 | −0.75 |

### Vehicle History Flags

These come from the listing data returned by KBB and Autotrader.

| Flag | Adjustment |
|------|-----------|
| One owner | +0.5 |
| No accidents | +0.5 |
| Personal use | +0.25 |

### Seller Type

| Dealer Type | Adjustment |
|-------------|-----------|
| Private party | +0.25 |

### Source Deal Rating

KBB provides its own deal rating for each listing.

| KBB Rating | Adjustment |
|-----------|-----------|
| "Great Deal" or "Great" | +0.5 |
| "Good Deal" or "Good" | +0.25 |

## Layer 2 — Relative Scoring (Market Comparison)

Layer 2 activates when there are at least **3 comparable listings** in the database. It compares the listing's price and mileage against the median of those comps.

### Finding Comparables

Comparables are found by:

1. Normalizing the model to a base keyword: `tacoma`, `4runner`, or `tundra`
2. Filtering to listings within **±3 model years** of the current listing
3. Excluding dismissed listings and listings with price < $1,000 (likely data errors)
4. Requiring at least 3 matches to activate Layer 2

If fewer than 3 comps are found, Layer 2 is skipped and the score is based on Layer 1 alone.

### Price vs Market Median

| Price Delta (median − price) / median | Meaning | Adjustment |
|--------------------------------------|---------|-----------|
| > 20% below median | Great deal | +2.0 |
| 10–20% below median | Well below market | +1.5 |
| 5–10% below median | Below market | +0.75 |
| 0–5% below median | Slightly below | +0.25 |
| 5–10% above median | Slightly above | −0.5 |
| 10–15% above median | Above market | −1.0 |
| > 15% above median | Overpriced | −1.5 |

### Mileage vs Peers

| Mileage Delta (median − mileage) / median | Adjustment |
|------------------------------------------|-----------|
| 20%+ fewer miles than peers | +0.75 |
| 10–20% fewer miles than peers | +0.5 |
| 20%+ more miles than peers | −0.5 |

## Score Clamping

The final score is clamped to **0–10** and rounded to one decimal place:

```typescript
return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
```

## Market Analysis on the Detail Page

When you click on a listing, the detail page shows a **Market Analysis** panel (when comps are available):

- **Verdict** — Great Deal / Good Deal / Fair / Above Market
- **% below or above median** — e.g., "18% below market"
- **Visual price range bar** showing where this listing sits among comps
- **Median price** and **average price** of comparable listings
- **Median mileage** of comparable listings
- **Mileage vs peers** — e.g., "12% fewer miles than similar vehicles"
- **Price rank percentile** — e.g., "Cheaper than 78% of comparable listings"
- **Number of comparable listings found**

The comps data is fetched from `GET /api/listings/[id]/comps` — see [API Reference](./api.md).

## Score Recomputation

Scores are recomputed in two situations:

1. **After a scrape** — new listings are scored with market comps from the current database
2. **When `priceMax` changes** in Settings — `recomputeAllScores()` is called for all non-dismissed listings, since the budget ratio changes

The `recomputeAllScores()` function in `src/lib/scoring.ts` iterates all non-dismissed listings, recomputes each score, and updates only the rows where the score changed.
