# Crawl4AI Plus for n8n

> **Enhanced fork** targeting Crawl4AI v0.8.0 with 8 Basic Crawler operations, 7 Content Extractor operations, streaming crawl, async job submission, and comprehensive browser/session/LLM configuration.

## Project History & Attribution

This is a maintained fork with enhanced features for Crawl4AI 0.8.0.

### Fork Chain
- **Original author**: [Heictor Hsiao](https://github.com/golfamigo) - [golfamigo/n8n-nodes-crawl4j](https://github.com/golfamigo/n8n-nodes-crawl4j)
- **First maintainer**: [Matias Lopez](https://github.com/qmatiaslopez) - [qmatiaslopez/n8n-nodes-crawl4j](https://github.com/qmatiaslopez/n8n-nodes-crawl4j)
- **Current maintainer**: [Max Soukhomlinov](https://github.com/msoukhomlinov) - [msoukhomlinov/n8n-nodes-crawl4ai-plus](https://github.com/msoukhomlinov/n8n-nodes-crawl4ai-plus)

All credit for the original implementation goes to **Heictor Hsiao** and **Matias Lopez**.

> **v4.0.0 is a breaking change** — all field names, output shapes, and operation behaviour have changed from v3.x. Existing workflows will need rebuilding. See [CHANGELOG.md](CHANGELOG.md) for full details.

---

## Features

### Basic Crawler Node (8 operations)

- **Crawl Single URL** — Extract content from a single page with full browser and crawler configuration
- **Crawl Multiple URLs** — Process multiple pages or use recursive keyword-driven discovery
  - **Manual list** — comma-separated URLs crawled in parallel
  - **Recursive Discovery** — BestFirst (recommended), BFS, or DFS strategies with seed URL and keyword query
- **Crawl Stream** — Stream crawl results one-item-at-a-time via `/crawl/stream`; each result has its own timestamp
- **Process Raw HTML** — Parse and extract content from raw HTML without a network request
- **Discover Links** — Extract, filter, and score all links from a page (internal/external, include/exclude patterns)
- **Submit Crawl Job** — Submit an async crawl job to `/crawl/job` and receive a `task_id` for large or long-running crawls; supports webhook callbacks
- **Get Job Status** — Poll `/job/{task_id}` to check status; returns full result data when complete
- **Health Check** — Query `/monitor/health` and `/monitor/endpoints/stats` to verify server reachability and resource usage

### Content Extractor Node (7 operations)

- **CSS Selector Extractor** — Structured extraction using `JsonCssExtractionStrategy` with field-level selectors and attribute extraction
- **LLM Extractor** — AI-powered structured extraction with schema support
  - Input formats: markdown (default), HTML, or fit_markdown
  - Schema modes: simple fields or advanced JSON schema
- **JSON Extractor** — Extract JSON from direct URLs, embedded `<script>` tags (CSS or XPath selector), or JSON-LD
- **Regex Extractor** — Pattern-based extraction with 21 built-in patterns, custom regex, LLM-generated patterns, or quick presets (Contact Info, Financial Data)
- **Cosine Similarity Extractor** — Semantic similarity clustering via `CosineStrategy`; requires `unclecode/crawl4ai:all` Docker image
- **SEO Metadata Extractor** — Extract title, meta tags, Open Graph, Twitter Cards, JSON-LD, robots directives, and hreflang tags
- **Submit LLM Job** — Submit an async LLM extraction job to `/llm/job` and receive a `task_id`

> **Table extraction** is available in the **Basic Crawler** node via the Table Extraction crawler option (LLM-based or default heuristics).

---

## Requirements

- **n8n**: 1.79.1 or higher
- **Crawl4AI Docker**: 0.8.0
  - Standard operations: `unclecode/crawl4ai:latest`
  - Cosine Similarity Extractor: `unclecode/crawl4ai:all` (includes sentence-transformers)

---

## Installation

```bash
# Install with pnpm (required — npm/yarn not supported)
pnpm install
pnpm build
```

Then restart your n8n instance. The nodes are declared in `package.json → "n8n" → "nodes"` and loaded from `dist/`.

---

## Setup

### Credentials

1. **Settings → Credentials → New → Crawl4AI API**
2. Configure:
   - **Docker URL** — URL of your Crawl4AI container (default: `http://crawl4ai:11235`)
   - **Authentication** — None, Bearer token, or Basic auth
   - **LLM Settings** — Enable and configure a provider for AI-powered operations:
     - OpenAI, Anthropic, Groq, Ollama, or custom LiteLLM endpoint

### Basic Crawler

1. Add **Crawl4AI Plus: Basic Crawler** to your workflow
2. Select an operation
3. Configure the required fields (shown at top level — no digging through collapsed options for required parameters)
4. Optional browser, crawler, and output options are in expandable collections

### Content Extractor

1. Add **Crawl4AI Plus: Content Extractor** to your workflow
2. Select an extraction strategy
3. Enter the URL and strategy-specific configuration
4. LLM-based strategies use the provider configured in credentials

---

## Configuration Reference

### Browser Options

| Option | Description |
|---|---|
| Browser Type | Chromium (default), Firefox, or Webkit |
| Headless Mode | Run browser without a visible window |
| Enable JavaScript | Enable JS execution (required for dynamic pages) |
| Enable Stealth Mode | Hides webdriver properties to bypass bot detection |
| Extra Browser Arguments | Command-line flags passed to the browser process |
| Init Scripts | JavaScript injected before page load (stealth setup) |
| Viewport Width / Height | Browser viewport dimensions |
| Timeout (MS) | Maximum page load wait time |
| User Agent | Override the browser user agent string |

### Session & Authentication

| Option | Description |
|---|---|
| Storage State (JSON) | Browser state (cookies, localStorage) as JSON — works on n8n Cloud |
| Cookies | Structured cookie entries for authentication |
| Session ID | Reuse a named browser context across requests |
| Use Managed Browser | Connect to an existing managed browser instance |
| Use Persistent Context | Persist browser profile to disk (self-hosted only) |
| User Data Directory | Path to the browser profile directory |

### Crawler Options

| Option | Description |
|---|---|
| Cache Mode | ENABLED, BYPASS, DISABLED, READ\_ONLY, or WRITE\_ONLY |
| CSS Selector | Pre-filter page content before extraction |
| JavaScript Code | Execute custom JS on the page before extracting |
| Wait For | CSS selector or JS expression to wait for before extracting |
| Check Robots.txt | Respect the site's robots.txt rules |
| Word Count Threshold | Minimum word count for a content block to be included |
| Exclude External Links | Strip external links from results |
| Preserve HTTPS for Internal Links | Normalise internal link protocols |

### Deep Crawl Options (Crawl Multiple URLs — Discover mode)

| Option | Description |
|---|---|
| Seed URL | Starting URL for recursive discovery |
| Discovery Query | Keywords that guide which links to follow (required for BestFirst) |
| Strategy | BestFirst (recommended), BFS, or DFS |
| Max Depth | Maximum link depth to follow |
| Max Pages | Maximum number of pages to crawl |
| Score Threshold | Minimum relevance score for BestFirst |

### Output Options

| Option | Description |
|---|---|
| Include HTML | Include raw HTML in `content.html` |
| Include Links | Include `links.internal` and `links.external` arrays |
| Include Media | Include images, videos, and audio metadata |
| Screenshot | Capture a screenshot (base64) |
| PDF | Generate a PDF (base64) |
| SSL Certificate | Extract SSL certificate details |

### Output Shape

All operations return a consistent output object:

```json
{
  "domain": "example.com",
  "url": "https://example.com/page",
  "fetchedAt": "2026-02-18T10:00:00.000Z",
  "success": true,
  "statusCode": 200,
  "content": {
    "markdownRaw": "...",
    "markdownFit": "..."
  },
  "extracted": {
    "strategy": "JsonCssExtractionStrategy",
    "json": { ... }
  },
  "links": {
    "internal": [{ "href": "...", "text": "..." }],
    "external": []
  },
  "metrics": {
    "durationMs": 1240
  }
}
```

### Async Job Workflow

For large or long-running crawls, use the async pattern:

1. **Submit Crawl Job** → returns `task_id`
2. **Get Job Status** (poll with task_id) → returns `status: pending | processing | completed | failed`
3. When `completed`, result fields are returned directly at top level alongside `task_id` and `status`

Webhook callbacks are supported in Submit Crawl Job for push-based notification when the job finishes.

---

## Project Structure

```
nodes/
  ├── Crawl4aiPlusBasicCrawler/
  │   ├── Crawl4aiPlusBasicCrawler.node.ts
  │   ├── crawl4aiplus.svg
  │   ├── actions/
  │   │   ├── operations.ts                   # Operation list and UI aggregation
  │   │   ├── router.ts                       # Dispatch to operation execute()
  │   │   ├── crawlSingleUrl.operation.ts
  │   │   ├── crawlMultipleUrls.operation.ts  # Manual list + recursive discovery
  │   │   ├── crawlStream.operation.ts        # Streaming crawl via /crawl/stream
  │   │   ├── processRawHtml.operation.ts
  │   │   ├── discoverLinks.operation.ts
  │   │   ├── submitCrawlJob.operation.ts     # Async job submission
  │   │   ├── getJobStatus.operation.ts       # Async job polling
  │   │   └── healthCheck.operation.ts
  │   └── helpers/
  │       ├── interfaces.ts
  │       ├── utils.ts                        # createBrowserConfig, createCrawlerRunConfig, buildLlmConfig, etc.
  │       ├── apiClient.ts                    # Crawl4aiClient — all HTTP calls
  │       └── formatters.ts                   # formatCrawlResult, formatExtractionResult
  │
  └── Crawl4aiPlusContentExtractor/
      ├── Crawl4aiPlusContentExtractor.node.ts
      ├── crawl4aiplus.svg
      ├── actions/
      │   ├── operations.ts
      │   ├── router.ts
      │   ├── cssExtractor.operation.ts
      │   ├── llmExtractor.operation.ts
      │   ├── jsonExtractor.operation.ts
      │   ├── regexExtractor.operation.ts
      │   ├── cosineExtractor.operation.ts
      │   ├── seoExtractor.operation.ts
      │   └── submitLlmJob.operation.ts       # Async LLM job submission
      └── helpers/
          ├── interfaces.ts
          └── utils.ts                        # Re-exports from BasicCrawler + extractor-specific helpers

credentials/
  └── Crawl4aiApi.credentials.ts             # Docker URL, auth, LLM provider config
```

---

## Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version history and breaking changes.

## License

MIT
