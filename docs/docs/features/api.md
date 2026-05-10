---
sidebar_position: 4
---

# API Reference

All API routes are Next.js App Router route handlers under `src/app/api/`.

## Common Formats

### Error Response

```json
{ "error": "Description of what went wrong" }
```

HTTP status codes follow REST conventions: `400` for bad input, `404` for not found, `409` for conflicts (e.g., scrape already running), `500` for server errors.

### Pagination Response

```json
{
  "data": [...],
  "total": 142,
  "page": 1,
  "limit": 24
}
```

---

## Listings

### `GET /api/listings`

Returns a paginated, filtered list of listings.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | string | Filter by source: `kbb`, `autotrader`, `facebook`, `cars.com` |
| `priceMin` | number | Minimum price in dollars |
| `priceMax` | number | Maximum price in dollars |
| `mileageMax` | number | Maximum mileage |
| `yearMin` | number | Minimum model year |
| `yearMax` | number | Maximum model year |
| `scoreMin` | number | Minimum deal score (0–10) |
| `viewStatus` | string | `new` or `seen` |
| `isFavorited` | boolean | `true` to show only favorites |
| `isDismissed` | boolean | `true` to include dismissed listings |
| `sortBy` | string | `dealScore`, `price`, `mileage`, `year`, `firstSeenAt` |
| `sortDir` | string | `asc` or `desc` |
| `page` | number | Page number (1-based, default: 1) |
| `limit` | number | Results per page (default: 24, max: 100) |

**Response:** `PaginatedResponse<Listing>`

---

### `GET /api/listings/[id]`

Returns a single listing with its full price history and notes.

**Response:**

```json
{
  "id": 42,
  "vin": "1TMAZ5CN0HZ...",
  "source": "kbb",
  "year": 2018,
  "make": "Toyota",
  "model": "Tacoma",
  "trim": "SR5 Double Cab",
  "price": 1295000,
  "mileage": 87000,
  "dealScore": 7.8,
  "priceHistory": [
    { "id": 1, "price": 1350000, "observedAt": "2025-01-15T10:30:00Z" }
  ],
  "notes": [
    { "id": 1, "listingId": 42, "type": "call", "content": "Called — firm on price", "createdAt": "2025-01-16T..." }
  ]
}
```

Note: `price` and `priceHistory[].price` are in **cents**. Divide by 100 for dollars.

---

### `PATCH /api/listings/[id]`

Update a listing's status fields.

**Request Body (any combination):**

```json
{
  "viewStatus": "seen",
  "isFavorited": true,
  "isDismissed": false
}
```

**Response:** The updated listing object.

---

### `GET /api/listings/[id]/notes`

Returns all notes for a listing, ordered by `createdAt` ascending.

**Response:** Array of `NoteEntry` objects.

---

### `POST /api/listings/[id]/notes`

Add a new note to a listing.

**Request Body:**

```json
{
  "type": "note",
  "content": "Interior is in great shape, minor scratch on rear bumper"
}
```

`type` must be one of `note`, `call`, or `system`. Validated with Zod.

**Response:** The created note object with `201 Created`.

---

### `GET /api/listings/[id]/comps`

Returns market comparison data for a listing — comparable listings, median price, price position, mileage comparison, and verdict.

**Response:**

```json
{
  "count": 18,
  "medianPrice": 1450000,
  "avgPrice": 1487000,
  "medianMileage": 95000,
  "priceDelta": 0.14,
  "mileageDelta": 0.08,
  "verdict": "Great Deal",
  "percentile": 82
}
```

Returns `null` if fewer than 3 comparable listings exist in the database.

---

## Config

### `GET /api/config`

Returns the current search configuration.

**Response:**

```json
{
  "id": 1,
  "zip": "92648",
  "radiusMiles": 150,
  "priceMax": 1500000,
  "mileageMax": 200000,
  "yearMin": 2005,
  "yearMax": 2025,
  "makesModels": "[\"Toyota Tacoma\",\"Toyota 4Runner\"]",
  "cronInterval": 30,
  "fbEnabled": false,
  "lastViewedAt": null
}
```

---

### `PUT /api/config`

Update the search configuration. If `priceMax` changes, all non-dismissed listing scores are recomputed immediately.

**Request Body (any fields from SearchConfig):**

```json
{
  "priceMax": 1200000,
  "cronInterval": 60,
  "fbEnabled": true
}
```

**Response:** The updated config object.

---

## Stats

### `GET /api/stats`

Returns dashboard summary statistics.

**Response:**

```json
{
  "totalListings": 142,
  "newCount": 23,
  "favoritesCount": 7,
  "avgDealScore": 5.4,
  "lastScrapeAt": "2025-01-16T14:30:00Z",
  "sourceBreakdown": [
    { "source": "kbb", "count": 61 },
    { "source": "autotrader", "count": 54 },
    { "source": "facebook", "count": 27 }
  ]
}
```

---

## Scrape

### `POST /api/scrape`

Trigger an immediate scrape run outside the normal cron schedule.

**Response:**
- `202 Accepted` — scrape started successfully
- `409 Conflict` — a scrape is already running

```json
{ "message": "Scrape started" }
```

---

### `GET /api/scrape/status`

Returns the most recent scrape run.

**Response:**

```json
{
  "id": 99,
  "source": "all",
  "status": "completed",
  "newCount": 12,
  "updatedCount": 5,
  "error": null,
  "startedAt": "2025-01-16T14:30:00Z",
  "completedAt": "2025-01-16T14:31:45Z"
}
```

Returns `null` if no scrape has ever run.

---

### `POST /api/scrape/clear`

Clears any stuck `running` scrape runs. Use this if the app crashed mid-scrape and the mutex is permanently locked.

**Response:**

```json
{ "cleared": 1 }
```
