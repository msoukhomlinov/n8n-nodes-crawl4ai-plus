# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This project uses **pnpm** (enforced via `preinstall` hook — do not use npm or yarn).

```bash
pnpm install          # Install dependencies
pnpm build            # Full build: rimraf dist, tsc, then gulp build:icons
pnpm dev              # Watch mode (tsc --watch, no icon copy)
pnpm lint             # ESLint with auto-fix on nodes/**/*.ts and credentials/**/*.ts
pnpm format           # Prettier format on nodes/**/*.ts and credentials/**/*.ts
```

There are no tests in this codebase. The `prepublishOnly` script runs build + lint.

TypeScript compiles to `./dist/`. Icons are copied by the gulp step (`gulpfile.js`). n8n loads nodes from `dist/` as declared in `package.json` → `"n8n"` → `"nodes"`.

## Architecture

This is an **n8n community node package** exposing two n8n nodes that wrap the **Crawl4AI Docker REST API** (v0.7.4). The package targets the REST API exclusively — Python SDK-only features (hooks, dispatchers, chunking strategies, CrawlerMonitor) cannot be implemented here.

### Two nodes

**`Crawl4aiPlusBasicCrawler`** — General crawling operations:
- `crawlSingleUrl` — Crawl one URL
- `crawlMultipleUrls` — Crawl many URLs (supports deep/recursive crawl via `BFSDeepCrawlStrategy`, `BestFirstCrawlStrategy`, `DFSDeepCrawlStrategy`)
- `processRawHtml` — Process already-fetched HTML using the `raw:` URL prefix
- `discoverLinks` — Extract and filter links from a page

**`Crawl4aiPlusContentExtractor`** — Extraction-strategy operations:
- `cssExtractor` — CSS selector extraction
- `llmExtractor` — LLM-based structured extraction
- `jsonExtractor` — JSON data extraction
- `regexExtractor` — Regex extraction (supports LLM-assisted `generate_pattern()` via `/generate_pattern` endpoint)
- `cosineExtractor` — Semantic similarity clustering (requires `unclecode/crawl4ai:all` Docker image, not `latest`)
- `seoExtractor` — SEO metadata (title, meta, OG tags, JSON-LD)

### Execution flow

Each node follows this pattern:
1. **Node class** (`*.node.ts`) — holds `INodeTypeDescription` and delegates `execute()` to `router`
2. **Router** (`actions/router.ts`) — reads `operation` parameter, dispatches to the correct operation's `execute()` function from `operations.ts`
3. **Operations** (`actions/operations.ts`) — aggregates all operation `description[]` arrays (for n8n UI properties) and the `operations` dispatch map
4. **Operation files** (`actions/*.operation.ts`) — each exports `description: INodeProperties[]` (UI schema) and `execute()` (business logic)

### API client and helpers

**`helpers/apiClient.ts`** (`Crawl4aiClient` class) — all HTTP communication via axios:
- `crawlUrl()` / `crawlMultipleUrls()` — POST to `/crawl`
- `arun()` — alias for `crawlUrl()`, used by Content Extractor operations
- `processRawHtml()` — POST to `/crawl` with `raw:<html>` URL prefix
- `generateRegexPattern()` — POST to `/generate_pattern`
- `formatBrowserConfig()` / `formatCrawlerConfig()` — **critical**: uses flat dict for simple params, but wraps in `{type: "CrawlerRunConfig", params: {...}}` when `extractionStrategy`, `deepCrawlStrategy`, or `tableExtraction` is present. Nested dicts (viewport, headers) need `{type: 'dict', value: {}}` wrapper.

**`helpers/utils.ts`** — helper factories:
- `getCrawl4aiClient()` — retrieves credentials and returns `Crawl4aiClient` instance
- `createBrowserConfig()` — maps n8n `options` object → `BrowserConfig` (includes session fields: `storage_state`, `user_data_dir`, `use_persistent_context`, `use_managed_browser`)
- `createCrawlerRunConfig()` — maps n8n `options` → `CrawlerRunConfig`
- `createMarkdownGenerator()` — builds markdown generator config (supports Pruning, BM25, LLMContentFilter)
- `createTableExtractionStrategy()` — builds table extraction config

**`helpers/interfaces.ts`** — `BrowserConfig`, `CrawlerRunConfig`, `CrawlResult`, `TableResult`, `Crawl4aiApiCredentials`, `Crawl4aiNodeOptions`

**`helpers/formatters.ts`** — `formatCrawlResult()` maps raw API results into n8n output data objects

### Credentials (`credentials/Crawl4aiApi.credentials.ts`)

Single credential type `crawl4aiPlusApi` covering:
- Docker server URL (default `http://crawl4ai:11235`)
- Authentication: none / Bearer token / Basic auth
- LLM provider settings (OpenAI, Anthropic, Groq, Ollama, LiteLLM/custom) — used by LLM extraction and LLMContentFilter features

### Critical API rules (from `.cursorrules`)

- **v1.0 — no backward compatibility**: Use only official Crawl4AI 0.7.4 field names. No fallback chains, no dual field handling, no legacy comments.
- API field names are **snake_case** throughout (e.g., `status_code`, `page_timeout`, `css_selector`).
- Empty configs send `{}`. Never send `null` values.
- Throw errors using n8n types: `NodeApiError` or `NodeOperationError`.
- Rate limit detection uses HTTP 429 status, not message string matching.
- When forking/renaming: update node `name`, `displayName`, credential `name`, and all `getCredentials()` calls — duplicates cause n8n load errors.
