# Changelog

All notable changes to this project will be documented in this file.

## [4.0.0] - 2026-02-18

> **BREAKING CHANGE** — Complete rewrite targeting Crawl4AI v0.8.0. All field names, output shapes, and operation behaviour have changed. Existing workflows built on v3.x will require rebuilding.

### Breaking changes
- Targets Crawl4AI REST API v0.8.0; incompatible with v0.7.x server deployments
- All API field names are strict snake_case matching the upstream API — no legacy aliases or fallback handling
- Output shape standardised across all operations: `domain`, `fetchedAt`, `statusCode`, `content.*`, `extracted.*`, `metrics.*` at top level; prior nested structures removed
- `getJobStatus` result no longer nested under a `crawlResult` key — fields appear at top level, enabling direct field access after Submit → Poll chains
- `jsonExtractor` option renamed from `includeFullContent` to `includeFullText` (consistent with all other extractors)
- `seoExtractor` and `jsonExtractor` now emit the standard output shape instead of custom `{ seo: {...} }` / `{ data: {...} }` shapes

### New operations
- `crawlStream` (Basic Crawler) — streaming crawl; one output item per result chunk with individual `fetchedAt` timestamps
- `submitCrawlJob` (Basic Crawler) — submit async crawl job, returns `task_id`
- `getJobStatus` (Basic Crawler) — poll job by `task_id`; flat output compatible with downstream field references
- `healthCheck` (Basic Crawler) — verify server reachability
- `seoExtractor` (Content Extractor) — extract title, meta, OG tags, canonical URL, JSON-LD
- `submitLlmJob` (Content Extractor) — submit async LLM extraction job

### Added
- `initScripts` browser option added to all six Content Extractor operations (was BasicCrawler-only)
- `sessionOptions` (cookies, storageState, persistent context, managed browser) added to `jsonExtractor`, `regexExtractor`, `seoExtractor`
- `cleanText` option added to `llmExtractor`, `regexExtractor`, `cosineExtractor` to normalise whitespace in extracted values
- `cosineExtractor`: added `browserType`, `timeout`, `viewportWidth`, `viewportHeight` browser options
- `crawlMultipleUrls`: added `browserType` selector (chromium / firefox / webkit)
- `discoverLinks`: added `enableStealth`, `initScripts`, and `scoreLinks` toggle (previously always enabled)
- `regexExtractor`: custom patterns now validated client-side — invalid regex surfaces a clear error before the API call

### Fixed
- `javaScriptEnabled` browser toggle was silently ignored across all operations due to field name mismatch
- `cosineExtractor` `continueOnFail` error path now preserves the original input item per n8n conventions
- `crawlStream` was stamping all results with the same `fetchedAt`; each result now has its own timestamp
- Invalid `resumeState` JSON is now surfaced as a clear error instead of being silently dropped
- Action label typos in BasicCrawler: `'Crawl multiple ur ls'` and `'Crawl ur ls via streaming'` corrected
- `timeout` browser option silently had no effect in all Content Extractor operations — now correctly maps to `page_timeout` in API requests
- Structured cookies (fixedCollection format) were silently dropped in `cosineExtractor`, `jsonExtractor`, and `seoExtractor`; authenticated crawls now work correctly
- `api_token: null` was sent to the API for Ollama LLM extraction (no API key required) — now omitted when blank
- `seoExtractor` was missing `enableStealth` and `extraArgs` browser options present in all other operations

### Changed
- LLM config building centralised into `buildLlmConfig()` / `validateLlmCredentials()` utilities; inline provider switch-cases removed from `crawlSingleUrl`, `crawlMultipleUrls`, `llmExtractor`, `regexExtractor`
- `crawlMultipleUrls` internal `resultLimit` no longer smuggled via a magic `__resultLimit` property on the config object

---

## [3.0.0] - 2026-01-06

### Added

#### Basic Crawler Node
- **Link Discovery Operation**: Dedicated operation for extracting and filtering links from web pages
  - Filter by internal/external link types
  - Include/exclude URL patterns with wildcard support
  - Exclude social media domains and file types
  - Grouped or split output formats for workflow flexibility
  - Link deduplication and metadata extraction (text, title attributes)
- **Shallow Crawl with Extraction**: Extraction strategy support in discovery mode
  - Apply CSS selector or LLM extraction to each discovered page
  - Enables keyword-driven shallow crawling (depth 1-2) with structured data extraction
  - Supports both CSS schema and LLM-based extraction during recursive discovery

#### Content Extractor Node
- **SEO Metadata Extractor**: Comprehensive SEO metadata extraction operation
  - Basic meta tags (title, description, keywords, canonical URL, author, viewport)
  - Open Graph tags (OG title, description, image, type, URL, site name, locale)
  - Twitter Cards metadata
  - JSON-LD structured data extraction
  - Robots and indexing directives
  - Language and locale information (HTML lang, hreflang tags)
  - Optional raw HTML head section output
- **Regex Extractor Presets**: Quick-start presets for common extraction tasks
  - **Contact Info Preset**: Extracts emails, phone numbers (US & international), Twitter handles, and URLs
  - **Financial Data Preset**: Extracts currencies, credit cards, IBANs, percentages, and numbers

#### Core Infrastructure
- **Shared LLM Configuration Helpers**: Centralised LLM config building utilities
  - `buildLlmConfig()`: Unified LLM provider/API key configuration
  - `validateLlmCredentials()`: Credential validation with clear error messages
  - `createLlmExtractionStrategy()`: LLM extraction strategy builder
  - `createCssSelectorExtractionStrategy()`: CSS extraction strategy builder
  - `cleanExtractedData()`: Recursive data cleaning utility
  - Eliminates code duplication across operations

### Changed

#### Documentation
- **README Updates**: Corrected extraction strategy count and operation listings
  - Removed "Table Extractor" from Content Extractor operations list (it's a Basic Crawler option)
  - Updated extraction strategy count to reflect new SEO Metadata Extractor
  - Added documentation for new operations and presets

#### Code Quality
- **Refactoring**: Extracted duplicated LLM configuration logic to shared helpers
  - Reduced code duplication in `crawlSingleUrl`, `crawlMultipleUrls`, `llmExtractor`, and `regexExtractor` operations
  - Improved maintainability and consistency across operations

### Fixed

- **Documentation Accuracy**: Fixed README to accurately reflect that table extraction is a Basic Crawler option, not a standalone Content Extractor operation

---

## [2.1.0] - 2026-01-06

### Added

#### Core Infrastructure
- **Unified API Client**: Standardized all operations to use `crawlUrl()` method for consistency
- **Enhanced Error Handling**: Comprehensive error parsing with actionable messages for network, HTTP, and API errors
- **Standardized Configuration**: Unified config building pattern using `createCrawlerRunConfig()` across all operations

#### Basic Crawler Node
- **Recursive Deep Crawling**: Keyword-driven recursive crawling with multiple strategies (BestFirst, BFS, DFS)
  - Seed URL and query-based discovery
  - Configurable depth and page limits
  - Domain and URL pattern filtering
  - Keyword relevance scoring
- **Output Formats**: Screenshot, PDF, and SSL certificate extraction
- **Content Filtering**: Pruning and BM25 content filters with configurable thresholds
- **Structured Output Options**: Raw/fit markdown variants and structured link extraction
- **Anti-Bot Features**: Magic mode, user simulation, and navigator override
- **Link/Media Filtering**: Exclude social media links and external images
- **Timing Controls**: Delay before return HTML and wait_until options
- **Session & Authentication**: Browser storage state, cookies, and persistent contexts
  - Storage state (JSON) for n8n Cloud compatibility
  - User data directory for self-hosted deployments
  - Managed browser mode support

#### Content Extractor Node
- **Cosine Similarity Extractor**: Semantic similarity-based content extraction with clustering
  - Configurable linkage methods (ward, complete, average, single)
  - Custom embedding model support
  - Similarity thresholds and distance limits
- **Table Extraction**: LLM-based and default table extraction strategies
  - Support for complex table structures
  - Chunking for large tables
- **LLM Content Filter**: Intelligent markdown generation using LLM
  - Configurable chunking thresholds
  - Cache control options
  - Custom instruction support
- **LLM Pattern Generation**: Natural language to regex pattern conversion
  - Automatic sample URL analysis
  - LLM-assisted pattern generation
- **Extraction Input Formats**: Support for markdown, HTML, and fit_markdown input formats for LLM extraction
- **Session & Authentication**: Full session management support across all extractors

### Changed

#### Breaking Changes
- **Removed "Direct" Connection Mode**: Credentials now support Docker REST API only (removed unimplemented direct mode)
- **API Field Names**: All API interactions now use official Crawl4AI 0.7.4 snake_case field names exclusively
  - `status_code` (not `statusCode`)
  - `pageTimeout` (not `timeout`)
- **No Backward Compatibility**: v1.0 release - removed all legacy field handling and fallback logic

#### Improvements
- **Error Messages**: More specific and actionable error messages with suggested fixes
- **Code Organization**: Standardized config building and API client usage across all operations
- **Type Safety**: Improved TypeScript interfaces and type definitions
- **Documentation**: Enhanced field descriptions with examples and use cases

### Fixed

- **Raw HTML Processing**: Fixed `raw://` URL scheme to use correct `raw:` prefix per official SDK
- **Config Building**: Removed duplicate config building logic, unified through helpers
- **Error Handling**: Fixed generic error messages to provide specific API error details
- **Import Cleanup**: Removed unused `createBrowserConfig` imports from extractor operations

### Technical Details

#### API Client Improvements
- Unified `crawlUrl()` and `arun()` methods (arun now delegates to crawlUrl)
- Comprehensive error parsing for Axios errors and API responses
- Dynamic timeout calculation based on operation type (5 minutes for deep crawl, 2 minutes default)
- Proper handling of API response structures

#### Configuration Standardization
- All operations now use `createCrawlerRunConfig()` helper
- Browser and session options merged consistently
- Extraction strategies passed via standardized config structure
- Type/params wrapper only used when extraction strategies present

#### Feature Coverage
- **95%+ API Coverage**: Comprehensive support for Crawl4AI 0.7.4 REST API features
- **All Extraction Strategies**: CSS, LLM, JSON, Regex, Cosine, Table extraction fully supported
- **All Content Filters**: Pruning, BM25, LLM content filters implemented
- **All Output Formats**: Screenshot, PDF, SSL certificate, markdown variants supported

### Known Limitations

- **Streaming Support**: `/crawl/stream` endpoint flag is set but full NDJSON streaming response handling not yet implemented (n8n output model expects complete results)
- **CosineStrategy Requirements**: Requires `unclecode/crawl4ai:all` Docker image (includes torch + transformers dependencies)
- **SDK-Only Features**: Hooks, dispatchers, and chunking strategies are Python SDK-only and not available via REST API

---

## Previous Versions

For versions prior to 2.1.0, please refer to the git history.
