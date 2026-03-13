# Crawl4AI Plus — UI/UX Redesign Spec

**Date:** 2026-03-14
**Status:** Approved
**Approach:** Progressive Disclosure (Approach B)
**Breaking:** Yes — clean break, major version bump (v5.0.0)

---

## Overview

Redesign the n8n community node package from 3 nodes (BasicCrawler 8 ops, ContentExtractor 7 ops, SmartExtract 3 ops) into 2 nodes optimized for general n8n users:

1. **Crawl4AI Plus** (simple) — 4 operations covering 90% of use cases
2. **Crawl4AI Plus Advanced** (power) — 15 operations with full API control

Old nodes (BasicCrawler, ContentExtractor, SmartExtract) are removed entirely. This is a clean break — existing workflows using old node names (`crawl4aiPlusBasicCrawler`, `crawl4aiPlusContentExtractor`) will need to be rebuilt with the new nodes.

---

## Target Audience

General n8n users building automation workflows. Not scraping specialists. Prioritize simplicity, smart defaults, and progressive disclosure over exposing every API parameter.

---

## Node 1: Crawl4AI Plus (Simple)

### Identity

- **Name:** `crawl4aiPlus`
- **Display Name:** Crawl4AI Plus
- **Icon:** `crawl4aiplus.svg`
- **Credential:** `crawl4aiPlusApi`
- **Default operation:** `getPageContent`

### Operations

#### 1. Get Page Content

**Required fields:**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| URL | string | — | Single URL |
| Crawl Scope | options | Single Page | Single Page / Follow Links (depth 1) / Full Site (depth 3) |

**Options collection (all optional, flat):**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Cache Mode | options | Enabled | Enabled/Bypass/Disabled/Read Only/Write Only |
| Content Quality | options | Clean | Clean (Pruning filter) / Complete (raw) |
| CSS Selector | string | — | Scope to specific element |
| Exclude Patterns | string | — | Comma-separated URL patterns to skip |
| Include HTML | boolean | false | |
| Include Links | boolean | true | |
| Max Pages | number | 10 | Shown when scope != Single Page |
| Wait For | string | — | CSS selector or JS expression |

#### 2. Ask Question

**Required fields:**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| URL | string | — | |
| Question | string (textarea) | — | Natural language question |
| Crawl Scope | options | Single Page | Same as above |

**Options collection:**

| Field | Type | Default |
|-------|------|---------|
| Cache Mode | options | Enabled |
| Exclude Patterns | string | — |
| Max Pages | number | 10 |
| Wait For | string | — |

LLM settings use credential-configured provider with smart defaults (temp: 0, max tokens: 2000). No LLM options exposed in UI.

**Ask Question — LLM prompt template:**

The operation uses `LLMExtractionStrategy` with this system prompt:

```
Answer the user's question based on the page content. Return a JSON object with exactly these keys:
- "answer": A concise answer to the question (string)
- "details": An array of supporting details or facts (string[])
- "source_quotes": An array of direct quotes from the page that support the answer (string[])

If the page doesn't contain enough information to answer, set "answer" to "I couldn't find enough information on the page to answer this question." and leave details and source_quotes as empty arrays.
```

The user's question is appended as: `Question: {question}`. The fixed schema `{answer: string, details: string[], source_quotes: string[]}` is sent as the extraction schema. Response is parsed as JSON; if parsing fails, the raw text is placed in `answer` with empty arrays for `details` and `source_quotes`.

#### 3. Extract Data

**Required fields:**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| URL | string | — | |
| Extraction Type | options | — | Contact Info / Financial Data / Custom (LLM) |
| Extraction Instructions | string (textarea) | — | Required when type = Custom |
| Schema Fields | fixedCollection | — | Required when type = Custom. Fields: name, type (string/number/boolean/array), description |
| Crawl Scope | options | Single Page | Same as above |

**Options collection:**

| Field | Type | Default |
|-------|------|---------|
| Cache Mode | options | Enabled |
| Exclude Patterns | string | — |
| Max Pages | number | 10 |
| Wait For | string | — |

**Extract Data preset definitions:**

Presets use **regex pattern matching** (no LLM required). Only "Custom (LLM)" requires LLM credentials.

**Contact Info** — regex patterns applied to page content:
- `emails`: RFC 5322 email pattern
- `phones`: US/international phone formats
- `socialMedia`: Twitter/X handles, LinkedIn URLs, Facebook URLs, Instagram handles
- `addresses`: US street address pattern (number + street + optional unit)

Output schema: `{ emails: string[], phones: string[], socialMedia: string[], addresses: string[] }`

**Financial Data** — regex patterns applied to page content:
- `currencies`: USD/EUR/GBP amounts (e.g., `$1,299.00`, `€500`)
- `creditCards`: Visa/MC/Amex patterns (masked in output)
- `ibans`: International Bank Account Numbers
- `percentages`: Percentage values (e.g., `45.5%`)
- `numbers`: Large formatted numbers (e.g., `1,234,567`)

Output schema: `{ currencies: string[], creditCards: string[], ibans: string[], percentages: string[], numbers: string[] }`

These reuse the existing regex pattern infrastructure from the current `regexExtractor` operation.

#### 4. Extract with CSS Selectors

**Required fields:**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| URL | string | — | |
| Base Selector | string | — | e.g. `div.product-item` |
| Fields | fixedCollection | — | name, CSS selector, type (text/html/attribute), attribute name (when type = attribute) |

**Options collection:**

| Field | Type | Default |
|-------|------|---------|
| Cache Mode | options | Enabled |
| Clean Text | boolean | true |
| Include Original Text | boolean | false |
| Wait For | string | — |

### What's Excluded from Simple Node

All handled by hardcoded smart defaults:
- Browser config (headless chromium, JS enabled, 1280x800, 30s timeout)
- Session/authentication (cookies, storage state, persistent context)
- Content filters (Pruning auto-applied via Content Quality toggle)
- Table extraction
- Anti-bot features, stealth mode
- Viewport customization
- Init scripts / JS injection

---

## Node 2: Crawl4AI Plus Advanced

### Identity

- **Name:** `crawl4aiPlusAdvanced`
- **Display Name:** Crawl4AI Plus Advanced
- **Icon:** `crawl4aiplus.svg`
- **Credential:** `crawl4aiPlusApi`
- **Default operation:** `crawlUrl`

### Operations (grouped in dropdown)

#### Group: Crawling

| Operation | Display Name | Purpose |
|-----------|-------------|---------|
| `crawlUrl` | Crawl URL | Single URL with full config |
| `crawlMultipleUrls` | Crawl Multiple URLs | Manual list or deep crawl discovery |
| `crawlStream` | Stream Crawl | Stream results for large URL sets |
| `processRawHtml` | Process Raw HTML | Process already-fetched HTML |
| `discoverLinks` | Discover Links | Extract and filter links |

#### Group: Extraction

| Operation | Display Name | Purpose |
|-----------|-------------|---------|
| `llmExtractor` | LLM Extractor | Full LLM extraction with schema, array handling, chunking |
| `cssExtractor` | CSS Extractor | CSS extraction with full browser/session control |
| `jsonExtractor` | JSON Extractor | JSON/JSON-LD/script tag extraction |
| `regexExtractor` | Regex Extractor | Regex with built-in, custom, or LLM-generated patterns |
| `cosineExtractor` | Cosine Similarity Extractor | Semantic clustering (requires crawl4ai:all image) |
| `seoExtractor` | SEO Metadata Extractor | Extract title, meta tags, OG tags, Twitter cards, JSON-LD |

#### Group: Jobs & Monitoring

| Operation | Display Name | Purpose |
|-----------|-------------|---------|
| `submitCrawlJob` | Submit Crawl Job | Async crawl, returns task_id |
| `submitLlmJob` | Submit LLM Job | Async LLM extraction, returns task_id |
| `getJobStatus` | Get Job Status | Poll async job result |
| `healthCheck` | Health Check | Check API availability |

### Standardized Collections (3 max per operation)

#### Browser & Session

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Browser Type | options | chromium | chromium/firefox/webkit |
| Headless Mode | boolean | true | |
| Enable JavaScript | boolean | true | |
| Enable Stealth Mode | boolean | false | |
| User Agent | string | — | |
| Viewport Width | number | 1280 | |
| Viewport Height | number | 800 | |
| Timeout | number | 30000 | Maps to `page_timeout` in CrawlerRunConfig. Same value also sent as browser `timeout`. Replaces 3 separate timeouts — single value for simplicity. |
| Extra Browser Args | string (textarea) | — | One argument per line (simplified from fixedCollection). Textarea avoids comma-parsing issues with args like `--disable-features=x,y`. |
| Init Scripts | string (textarea) | — | One per line (simplified from fixedCollection) |
| Cookies | json | — | JSON array (standardized across all operations) |
| Storage State | json | — | |
| Session ID | string | — | |
| Use Persistent Context | boolean | false | |
| User Data Dir | string | — | Shown when persistent context = true |
| Use Managed Browser | boolean | false | Shown when persistent context = true |

#### Crawl Settings

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Cache Mode | options | Enabled | |
| CSS Selector | string | — | |
| Wait For | string | — | CSS selector or JS expression |
| JavaScript Code | string (textarea) | — | Execute JS before extraction |
| JS Only Mode | boolean | false | |
| Word Count Threshold | number | 0 | |
| Excluded Tags | string | — | Comma-separated |
| Exclude External Links | boolean | false | |
| Preserve HTTPS | boolean | false | Keep HTTPS scheme for internal links (maps to `preserve_https_for_internal_links`) |
| Check Robots.txt | boolean | false | |
| Max Retries | number | 3 | |
| Delay Before Return | number | 0 | ms |
| Wait Until | options | load | load/domcontentloaded/networkidle/networkidle2 |
| Anti-Bot: Magic Mode | boolean | false | |
| Anti-Bot: Simulate User | boolean | false | |
| Anti-Bot: Override Navigator | boolean | false | |

#### Output & Filtering

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Markdown Output | options | raw | raw/fit/both |
| Include Links | boolean | true | |
| Include Media | boolean | false | |
| Include Tables | boolean | true | |
| Capture Screenshot | boolean | false | |
| Generate PDF | boolean | false | |
| Fetch SSL Certificate | boolean | false | |
| Verbose Response | boolean | false | |
| Content Filter | options | none | none/pruning/bm25/llm |
| *(pruning)* | | | threshold, threshold type, min word threshold |
| *(bm25)* | | | user query, bm25 threshold |
| *(llm)* | | | instruction, chunk threshold, verbose |
| Table Extraction | options | none | none/default/llm |
| *(default)* | | | score threshold, verbose |
| *(llm)* | | | css selector, chunking, max tries, verbose |

### Content Filter Sub-Fields (fully specified)

**Pruning filter** (shown when Content Filter = pruning):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Threshold | number | 0.48 | Pruning aggressiveness (0-1) |
| Threshold Type | options | fixed | `fixed` or `dynamic` |
| Min Word Threshold | number | 0 | Minimum words per block to keep |

**BM25 filter** (shown when Content Filter = bm25):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| User Query | string | — | Search query for relevance scoring |
| BM25 Threshold | number | 1.0 | Minimum BM25 score to keep |

**LLM filter** (shown when Content Filter = llm):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| LLM Instruction | string (textarea, 8 rows) | — | Required. Instructions for LLM content filtering |
| Chunk Token Threshold | number | 500 | Max tokens per chunk sent to LLM |
| LLM Verbose | boolean | false | Log LLM filter decisions |

### Table Extraction Sub-Fields (fully specified)

**Default strategy** (shown when Table Extraction = default):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Table Score Threshold | number | 0.5 | Minimum confidence score (0-1) |
| Verbose | boolean | false | |

**LLM strategy** (shown when Table Extraction = llm):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| CSS Selector | string | — | Scope to specific table(s) |
| Enable Chunking | boolean | false | Split large tables into chunks |
| Max Parallel Chunks | number | 3 | Shown when chunking = true |
| Min Rows Per Chunk | number | 5 | Shown when chunking = true |
| Chunk Token Threshold | number | 500 | Shown when chunking = true |
| Max Tries | number | 3 | LLM retry attempts |
| Verbose | boolean | false | |

### Crawl Multiple URLs — Deep Crawl Configuration

The `crawlMultipleUrls` operation supports two modes via a **Crawl Mode** field:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Crawl Mode | options | manual | `manual` (URL list) / `discover` (deep crawl from seed) |
| URLs | string (textarea) | — | Required when mode = manual. One URL per line |
| Seed URL | string | — | Required when mode = discover |

**Discovery Strategy** (collection, shown when mode = discover):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Strategy Type | options | BFS | `BFS` (BFSDeepCrawlStrategy) / `DFS` (DFSDeepCrawlStrategy) / `BestFirst` (BestFirstCrawlStrategy) |
| Max Depth | number | 3 | Maximum crawl depth |
| Max Pages | number | 100 | Total page limit |
| Max Links Per Page | number | 50 | Links to follow per page. Maps to `max_links` in the deep crawl strategy config. |
| Exclude Patterns | string | — | Comma-separated URL patterns to skip |
| Include Patterns | string | — | Comma-separated URL patterns to include |
| Query Terms | string | — | Comma-separated terms for BestFirst strategy relevance scoring |

Strategy maps to API field names: `BFSDeepCrawlStrategy`, `DFSDeepCrawlStrategy`, `BestFirstCrawlStrategy`. Filter patterns are sent via `FilterChain`. Query terms configure `KeywordRelevanceScorer` for the BestFirst strategy.

### Simple Node — Crawl Scope Deep Crawl Mapping

| Crawl Scope | Strategy | Depth | Default Max Pages | Domain Filter |
|-------------|----------|-------|-------------------|---------------|
| Single Page | None | — | 1 | — |
| Follow Links | BFSDeepCrawlStrategy | 1 | 10 | Same domain only |
| Full Site | BFSDeepCrawlStrategy | 3 | 10 | Same domain only |

FilterChain includes default smart dedup (strips utm, fbclid, gclid, sort, order params and URL fragments for normalization).

### Operation Grouping in n8n Dropdown

n8n supports `INodePropertyOptions` groups natively (since n8n 0.200+). Operation options use the `groupName` property:

```typescript
{ name: 'Crawl URL', value: 'crawlUrl', description: '...', groupName: 'Crawling' },
{ name: 'Stream Crawl', value: 'crawlStream', description: '...', groupName: 'Crawling' },
// etc.
```

If `groupName` is not supported in the target n8n version, fall back to description prefixes: `"[Crawling] Crawl URL"`.

### Key Design Rules

- **Max nesting: 2 levels** — operation -> collection -> field (conditional visibility for sub-fields, no nested collections)
- **Consistent field names** — `url` everywhere (no `streamUrls`, `jobUrls`, `llmJobUrl` prefixes)
- **Not every operation gets all 3 collections** — healthCheck gets none, getJobStatus just needs task ID, processRawHtml skips Browser & Session

---

## Shared Architecture

### Directory Structure

```
credentials/
  └── Crawl4aiApi.credentials.ts
nodes/
  ├── shared/
  │   ├── apiClient.ts
  │   ├── interfaces.ts
  │   ├── formatters.ts
  │   ├── utils.ts
  │   └── descriptions/                    # Shared UI field definitions
  │       ├── browserSession.fields.ts
  │       ├── crawlSettings.fields.ts
  │       ├── outputFiltering.fields.ts
  │       └── common.fields.ts
  ├── Crawl4aiPlus/
  │   ├── Crawl4aiPlus.node.ts
  │   ├── crawl4aiplus.svg
  │   ├── actions/
  │   │   ├── router.ts
  │   │   ├── operations.ts
  │   │   ├── getPageContent.operation.ts
  │   │   ├── askQuestion.operation.ts
  │   │   ├── extractData.operation.ts
  │   │   └── cssExtractor.operation.ts
  │   └── helpers/
  │       ├── utils.ts
  │       └── formatters.ts
  ├── Crawl4aiPlusAdvanced/
  │   ├── Crawl4aiPlusAdvanced.node.ts
  │   ├── crawl4aiplus.svg
  │   ├── actions/
  │   │   ├── router.ts
  │   │   ├── operations.ts
  │   │   ├── crawlUrl.operation.ts
  │   │   ├── crawlMultipleUrls.operation.ts
  │   │   ├── crawlStream.operation.ts
  │   │   ├── processRawHtml.operation.ts
  │   │   ├── discoverLinks.operation.ts
  │   │   ├── llmExtractor.operation.ts
  │   │   ├── cssExtractor.operation.ts
  │   │   ├── jsonExtractor.operation.ts
  │   │   ├── regexExtractor.operation.ts
  │   │   ├── cosineExtractor.operation.ts
  │   │   ├── seoExtractor.operation.ts
  │   │   ├── submitCrawlJob.operation.ts
  │   │   ├── submitLlmJob.operation.ts
  │   │   ├── getJobStatus.operation.ts
  │   │   └── healthCheck.operation.ts
  │   └── helpers/
  │       └── formatters.ts
index.js
```

### Shared Descriptions

- `browserSession.fields.ts` — Browser & Session collection, imported by advanced operations that need it
- `crawlSettings.fields.ts` — Crawl Settings collection
- `outputFiltering.fields.ts` — Output & Filtering collection with Content Filter and Table Extraction sub-fields
- `common.fields.ts` — Atomic reusable fields: url, urls, cacheMode, waitFor, crawlScope

Operations use `displayOptions` to show/hide collections per operation.

### Deleted Directories

- `nodes/Crawl4aiPlusBasicCrawler/` — removed
- `nodes/Crawl4aiPlusContentExtractor/` — removed
- `nodes/Crawl4aiPlusSmartExtract/` — replaced by `nodes/Crawl4aiPlus/`

### Node Registration

n8n discovers nodes via `package.json` → `"n8n"` → `"nodes"` array. Update to:

```json
{
  "n8n": {
    "nodes": [
      "dist/nodes/Crawl4aiPlus/Crawl4aiPlus.node.js",
      "dist/nodes/Crawl4aiPlusAdvanced/Crawl4aiPlusAdvanced.node.js"
    ],
    "credentials": [
      "dist/credentials/Crawl4aiApi.credentials.js"
    ]
  }
}
```

The `index.js` file serves as a secondary loader for some n8n hosting environments. Update it to match:

```javascript
module.exports = {
  nodeTypes: {
    crawl4aiPlus: require('./dist/nodes/Crawl4aiPlus/Crawl4aiPlus.node.js').Crawl4aiPlus,
    crawl4aiPlusAdvanced: require('./dist/nodes/Crawl4aiPlusAdvanced/Crawl4aiPlusAdvanced.node.js').Crawl4aiPlusAdvanced,
  },
  credentialTypes: {
    crawl4aiPlusApi: require('./dist/credentials/Crawl4aiApi.credentials.js').Crawl4aiApi,
  },
};
```

Both `package.json` `"n8n"` section and `index.js` must be updated. Remove old node paths from both.

---

## Output Formatting

### Simple Node Output Shapes

**Field conventions:**
- `url` — the primary/seed URL that was crawled
- `urls` — all URLs that were actually crawled (only present when Crawl Scope != Single Page). When scope is Single Page, this field is omitted.
- `markdown` — merged content from all crawled pages (concatenated with `\n\n---\n\n` separator for multi-page)

**Get Page Content:**
```json
{
  "domain": "example.com",
  "url": "https://example.com/page",
  "urls": ["https://..."],
  "markdown": "# Page Title\n...merged content from all pages...",
  "links": { "internal": [], "external": [] },
  "success": true,
  "pagesScanned": 1,
  "fetchedAt": "2026-03-14T12:00:00Z",
  "metrics": { "crawlTime": 1.2 }
}
```

**Ask Question:**
```json
{
  "domain": "example.com",
  "url": "https://example.com/page",
  "question": "What is the pricing?",
  "answer": "The basic plan costs...",
  "details": ["..."],
  "sourceQuotes": ["..."],
  "success": true,
  "pagesScanned": 1,
  "fetchedAt": "...",
  "metrics": { "crawlTime": 1.2 }
}
```

**Extract Data:**
```json
{
  "domain": "example.com",
  "url": "https://example.com/page",
  "extractionType": "contactInfo",
  "data": { "emails": [], "phones": [] },
  "success": true,
  "pagesScanned": 1,
  "fetchedAt": "...",
  "metrics": { "crawlTime": 1.2 }
}
```

**CSS Extractor:**
```json
{
  "domain": "example.com",
  "url": "https://example.com/products",
  "items": [{ "title": "...", "price": "..." }],
  "itemCount": 24,
  "success": true,
  "fetchedAt": "...",
  "metrics": { "crawlTime": 1.2 }
}
```

### Advanced Node Output

Same base shape, extended with optional fields based on operation settings (html, markdownFit, media, tables, screenshot, pdf, sslCertificate, extractedContent, statusCode).

### Async Job Output

**Submit:** `{ taskId, status: "pending", submittedAt }`
**Poll:** `{ taskId, status: "processing|completed|failed", ...full result when completed }`

---

## Error Handling

| HTTP Status | Error Type | User Message |
|-------------|-----------|--------------|
| 400 | NodeApiError | "Invalid request: {detail}" |
| 401 | NodeApiError | "Authentication failed — check credentials" |
| 403 | NodeApiError | "Access forbidden — check API token permissions" |
| 404 | NodeApiError | "Endpoint not found — check Docker server URL" |
| 422 | NodeApiError | "Validation error: {detail}" |
| 429 | NodeApiError | "Rate limited — reduce request frequency" |
| 5xx | NodeApiError | "Server error: {detail}" |
| Network | NodeApiError | "Cannot connect to Crawl4AI server at {url}" |
| Bad config | NodeOperationError | Specific message about what's wrong |

Simple node early validation: If LLM credentials aren't configured and user picks "Ask Question" or "Custom (LLM)" extraction, throw immediately with: "This operation requires LLM features. Configure an LLM provider in your Crawl4AI Plus credentials."

---

## Summary of UX Improvements

1. **3 nodes → 2 nodes** — cleaner palette, clear simple/advanced split
2. **18 operations → 4 simple + 15 advanced** — general users see only what they need
3. **7 collections per operation → 1 Options bag (simple) or 3 flat collections (advanced)**
4. **5 levels of nesting → 2 levels max**
5. **3 timeouts → 1 timeout**
6. **Inconsistent field names → standardized everywhere**
7. **Duplicated UI definitions → shared descriptions**
8. **fixedCollection complexity → simplified types** (comma-separated strings, textarea, JSON)
9. **Smart defaults** — browser config, content filtering handled automatically in simple node
10. **Early LLM credential validation** — clear error before execution
