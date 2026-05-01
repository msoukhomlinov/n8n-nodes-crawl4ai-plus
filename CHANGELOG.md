# Changelog

## 5.1.5 (2026-05-01)

### Fixed
- `extractData` Locations & Addresses: LLM few-shot example for "no phone found" case now omits the phone field entirely — previously used `"(not stated)"` as the value, teaching the model to output that literal string
- `extractData` Contact Info: LLM validation notice now clearly states the feature is optional (only needed when LLM Validation option is enabled)
- `cssExtractor`: renamed internal variable `items_extracted` to camelCase `itemsExtracted`; fixed 4-space/tab indentation inconsistency in location helper functions
- All four simple node operations (`Get Page Content`, `Ask Question`, `Extract Data`, `Extract with CSS Selectors`): `metrics.cacheStatus` replaced by `metrics.cacheHits` / `metrics.cacheMisses` — aggregated across all crawled pages so multi-page runs show accurate cache hit/miss counts instead of only page 1's status
- All four simple node operations: `statusCode` field added to output (HTTP status of the primary URL); previously absent from all simple node outputs despite being present in the advanced node

### Added
- All four simple node operations (`Get Page Content`, `Ask Question`, `Extract Data`, `Extract with CSS Selectors`) now expose **Avoid Ads** and **Avoid CSS** options (Crawl4AI v0.8.5 `CrawlerRunConfig` params) — block ad-related and CSS network requests during crawl for faster, cleaner text extraction

## 5.1.4 (2026-04-30)

### Changed
- **Crawl4AI v0.8.5 compatibility**: `BestFirstCrawlStrategy` renamed to `BestFirstCrawlingStrategy` — Crawl4AI 0.8.5 introduced a deserialization allowlist (security fix for RCE vector); the old name is now explicitly rejected; this fix applies to both the Simple node locations extraction and the Advanced node deep crawl strategy picker
- **New options (Advanced node Crawl Settings)**: `Avoid Ads` and `Avoid CSS` — new `CrawlerRunConfig` params introduced in v0.8.5 to block ad-related and CSS network requests during crawl; improves speed and reduces noise for text-only extraction use cases
- Package description updated to reference Crawl4AI v0.8.5

### Fixed
- `extractData` Locations & Addresses: structured address output — `address` field replaced with `address1` (street number + name), `address2` (unit/level/floor/suite), `city`, `state`, `postcode`, `country`, and `additionalNotes`; JSON-LD extraction splits `streetAddress` into `address1`/`address2` automatically; LLM schema and instruction updated with examples using new fields
- `extractData` Locations & Addresses: multi-page crawls now use `BestFirstCrawlStrategy` with `KeywordRelevanceScorer` instead of `BFSDeepCrawlStrategy` — Crawl4AI ranks and prioritises location-relevant pages during the crawl itself using 44 expanded location keywords; eliminates the need for post-crawl page scoring
- `extractData` Locations & Addresses: location keyword list expanded to 44 terms covering branch types, address components, and find-us phrases (`stockist`, `distributor`, `pharmacy`, `showroom`, `warehouse`, `impressum`, `imprint`, `find us`, `get in touch`, `where to buy`, `zip code`, etc.)
- `extractData` Locations & Addresses: duplicate location deduplication using Union-Find fingerprinting — addresses referring to the same building (e.g. "Level 2/343 Lt Collins St", "Level 2, Suites 214/215, 343 Little Collins Street", "Level 2, 343 Little Collins Street") now collapse to a single best-quality result; fingerprint uses postcode + street number as primary key, city + street number as secondary, with transitivity so partial addresses (no postcode) still merge with full entries sharing the same city and street number; when merging, highest-confidence json-ld entry wins, phone numbers are inherited from any group member

## 5.1.3 (2026-04-30)

### Fixed
- `extractData` Locations & Addresses: three-layer extraction pipeline — JSON-LD/schema.org structured data extracted first (zero LLM cost, deterministic) from `LocalBusiness`, `Organization`, `Place`, and nested `PostalAddress` schema types; LLM extraction runs per-page as fallback/supplement on location-relevant pages only; results merged with JSON-LD winning on conflict
- `extractData` Locations & Addresses: smart page scoring selects which pages to send to LLM — URL keywords (`contact`, `locations`, `where-to-buy`, `offices`, `worldwide`, `impressum`, etc.) and content keywords (`street`, `branch`, `postcode`, etc.) rank pages by location likelihood; top 8 sent, up to 5 more in fallback pass — eliminates empty results when 2 relevant pages are diluted among 30 product pages
- `extractData` Locations & Addresses: LLM instruction includes source page URL as context (e.g. "where-to-buy" pages now correctly yield distributor addresses) plus two few-shot examples and a confidence rubric for higher extraction accuracy
- `extractData` Locations & Addresses: `sourceSnippet` field added to LLM schema — each extracted location must provide the verbatim text it was drawn from; snippet is verified against page content to catch and discard hallucinated addresses; locations with no snippet are rejected outright
- `extractData` Locations & Addresses: address canonicalization before dedup expands abbreviations (`St`→`Street`, `Rd`→`Road`, `Ave`→`Avenue`, etc.) so variants of the same address are correctly merged; `confidence` and `source` (`json-ld` or `llm`) fields now included in each location result
- `extractData` Locations & Addresses: JSON-LD walker now traverses `hasPOS`/`location`/`containsPlace` as both arrays and single objects (schema.org emits both); top-level array-form JSON-LD script blocks are now correctly unwrapped before processing
- **Note:** this approach makes up to 8+5 LLM calls per operation on multi-page crawls (one per relevant page). Expect higher LLM usage vs. the previous single-blob approach, in exchange for substantially better recall and no hallucinations

## 5.1.2 (2026-04-30)

### Fixed
- LiteLLM/custom provider now auto-prefixes `openai/` when Base URL is set, matching OpenAI-compatible proxy protocol
- `llmExtractor` now surfaces LLM errors instead of silently returning error JSON as data
- Credentials "Custom Provider" field renamed to "Model ID" with description clarifying that Crawl4AI's LiteLLM SDK strips provider prefixes before calling the proxy
- `askQuestion` answer field no longer returns LLM fallback message when later page chunks found the answer
- `metrics.crawlTime` now populated — was always null because `server_processing_time_s` lives on the API response wrapper, not per-result; now promoted onto each result before returning
- `metrics` no longer emits null-valued keys
- New fields surfaced across all nodes: `metrics.cacheStatus`, `metrics.memoryDeltaMb`, `metrics.peakMemoryMb`, `redirectedUrl` (conditional), `jsExecutionResult` (conditional), `downloadedFiles` (conditional)
- `extractData` Contact Info: replaced phone regex with `libphonenumber-js` for accurate detection and E.164 deduplication; removed social media (noise); removed address detection (now handled by Locations & Addresses type); Default Country Code option (default AU) for local number parsing; optional LLM Validation pass to clean false positives using the configured LLM
- `extractData` Locations & Addresses: new LLM-based extraction type that identifies all physical locations (offices, branches, stores) with unique names, full addresses, city, country, and optional per-location phone numbers; deduplicates across multi-page crawls by normalised address
- Crawl Scope tooltips (Follow Links / Full Site) now explicitly state that only same-domain pages are crawled; external links are always excluded
- URL validation now fails fast at node level for empty, malformed, or non-http/https URLs (e.g. `thttps://`) with a clear error message before any crawl is attempted; applies to all four simple node operations
- Failed crawl results now include `errorMessage` from Crawl4AI in all simple node operations (`getPageContent`, `askQuestion`, `extractData`, `cssExtractor`)
- `errorMessage` on failure is now cleaned of Python tracebacks, code context blocks, and Playwright call logs — only the meaningful error reason is shown
- All four simple node operations now have a **Bypass Bot Detection** option (Options → Bypass Bot Detection) that enables all four Crawl4AI anti-bot flags (`enable_stealth`, `magic`, `simulate_user`, `override_navigator`); use when a site returns 403 or blocks headless Chrome
- All four simple node operations now have a **Browser Type** option (Options → Browser Type) to switch between Chromium, Firefox, and WebKit; Firefox has a different TLS fingerprint to Chromium and bypasses bot-detection systems that block headless Chrome
- All four simple node operations now have a **Browser Profile** option (Options → Browser Profile) with 10 real-browser presets (Chrome Windows/macOS/Android/Linux, Edge Windows, Firefox Windows/macOS, Safari macOS/iOS, Googlebot) plus a Custom option that reveals a `Key: Value` textarea; Advanced node gains the same picker in Browser & Session; profile headers are merged with any explicit headers (explicit values override profile)

## 5.1.1 (2026-04-30)

### Fixed
- LLM operations crash with HTTP 500: `LLMConfig` rejects `api_base` — correct field is `base_url`. Affected `askQuestion`, `extractData`, `llmExtractor`, and LLM-backed extraction when using Ollama or custom provider.

## 5.1.0

See git history.
