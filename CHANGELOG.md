# Changelog

All notable changes to this project will be documented in this file.

## [5.0.0] - 2026-03-15

### Breaking Changes

- **Two-node architecture**: Replaced 3 old nodes (`Crawl4aiPlusBasicCrawler`, `Crawl4aiPlusContentExtractor`, `Crawl4aiPlusSmartExtract`) with 2 new nodes:
  - **Crawl4AI Plus** (Simple) — 4 operations for general users (Get Page Content, Ask Question, Extract Data, CSS Extractor)
  - **Crawl4AI Plus Advanced** — 15 operations in 3 groups (Crawling, Extraction, Jobs & Monitoring)
- Old node names are not backward-compatible. Workflows using v4.x nodes must be reconfigured.
- Async job output fields use camelCase (`taskId`) instead of snake_case (`task_id`).

### Added

- Shared description factory functions (`getBrowserSessionFields`, `getCrawlSettingsFields`, `getOutputFilteringFields`) for consistent UI across Advanced operations.
- Progressive disclosure: Simple node hides browser complexity with smart defaults; Advanced node exposes full API control via 3 standardized collections.
- Deep crawl support in Simple node via Crawl Scope (Single Page / Follow Links / Full Site) with BFS strategy, same-domain filtering, and smart deduplication.
- 6 extraction operations in Advanced node: LLM, CSS, JSON, Regex, Cosine Similarity, SEO Metadata.
- Async job operations: Submit Crawl Job, Submit LLM Job, Get Job Status, Health Check.
- Streaming crawl support via `/crawl/stream` endpoint.
- `usableAsTool: true` on both nodes for n8n AI agent compatibility.
- pnpm enforcement via `preinstall` hook.

### Fixed

- **Browser config propagation**: Simple node defaults (`viewport: 1280x800`, `javaScriptEnabled: true`) were silently ignored because `getSimpleDefaults()` used camelCase flat keys that `formatBrowserConfig()` never reads. Now uses the correct field format.
- **Textarea fields silently dropped**: `extraArgs` and `initScripts` in Browser & Session collection are textarea inputs (strings), but `createBrowserConfig()` only checked `Array.isArray()`. Added string-to-array conversion (newline-split).
- **Duplicate `waitUntil` assignment**: `createCrawlerRunConfig()` set `waitUntil` twice due to copy-paste drift. Removed duplicate.
- **Silent item drop in Ask Question**: When crawl returned empty results, the operation produced no output item instead of throwing an error, violating n8n's item contract. Now throws `NodeOperationError`.
- **`streamUrls` field name**: Renamed to `urls` to follow the spec's consistent field naming rule.
- **Dead `formatJobSubmission` helper**: Job submission operations built output inline instead of using the shared formatter. Now both `submitCrawlJob` and `submitLlmJob` use `formatJobSubmission()`.
- **Spec defaults mismatches**: Viewport defaults `1024x768` -> `1280x800`, `maxRetries` `0` -> `3`, `includeTables` `false` -> `true`.
- **Extract Data description**: Changed from "using LLM" to "Extract emails, financial data, or custom structured data" since 2/3 presets are regex-based.
- **`prepublishOnly` script**: Used `npm run` instead of `pnpm run` and referenced non-existent `.eslintrc.prepublish.js`.
- **`getCrawl4aiClient` return type**: Changed from `Promise<any>` to `Promise<Crawl4aiClient>` for type safety.
- **7 browser config fields silently dropped**: `formatBrowserConfig()` was missing handling for `cookies`, `headers`, `storage_state`, `user_agent_mode`, `user_agent_generator_config`, `use_persistent_context`, and `user_data_dir`. These fields were set by `createBrowserConfig()` but never forwarded to the API. Now all are properly mapped with appropriate dict wrappers where needed.
- **`crawlStream()` missing error handling**: The streaming crawl method lacked try/catch around the initial POST request. HTTP errors (401, 429, connection refused) now get the same user-friendly error formatting as all other API methods.
- **Empty results violating n8n item contract**: `crawlMultipleUrls`, `crawlStream`, and `getJobStatus` could emit zero output items for an input item when the API returned empty results. Now all throw or emit a fallback item.
- **Missing LLM credential validation**: `submitLlmJob` and `regexExtractor` (LLM pattern mode) did not validate LLM credentials before making API calls, producing opaque errors on misconfigured credentials. Now both use `validateLlmCredentials()`.

### Fixed (pre-release sweep)

- **`BestFirstCrawlingStrategy` → `BestFirstCrawlStrategy`**: Wrong API type name in `crawlMultipleUrls` deep crawl strategy would cause silent API failures. Fixed all 3 occurrences.
- **`crawlMultipleUrls` spec defaults**: Strategy default changed from BestFirst to BFS, Max Depth from 2 to 3, Max Pages from 50 to 100 (all per spec).
- **Missing `maxLinksPerPage` field**: Added to `crawlMultipleUrls` Discovery Strategy collection (maps to `max_links`, default 50).
- **`metrics.durationMs` → `metrics.crawlTime`**: Simple node output metrics used milliseconds integer instead of spec's float seconds. Fixed across all 4 operations.
- **Cache Mode missing options**: All 4 Simple node operations were missing "Read Only" and "Write Only" cache mode options.
- **Missing `pageTimeout: 30000`** in Simple node `getSimpleDefaults()`. Crawls had no explicit timeout instead of spec's 30s.
- **`fullSite` default maxPages**: Was 50, spec says 10. Fixed.
- **Ask Question JSON fallback**: When LLM response couldn't be parsed as JSON, `answer` was set to empty string instead of the raw extracted text (per spec).
- **`extractData` field ordering**: Crawl Scope field was positioned before Custom-specific fields instead of after (per spec).
- **`getJobStatus` output field naming**: Used `task_id` (snake_case) inconsistent with CHANGELOG's declared `taskId` (camelCase). Standardized to `taskId`.
- **Operation display names**: "Cosine Similarity" → "Cosine Similarity Extractor", "SEO Metadata" → "SEO Metadata Extractor" (per spec).
- **`package.json` `files` array missing `index.js`**: Would cause npm publish to produce a broken package since the `main` entry point wouldn't be included.
- **LLM credential error message**: Updated to match spec: "This operation requires LLM features. Configure an LLM provider in your Crawl4AI Plus credentials."
- **Dead pipeline code removed**: `excludeSocialMediaLinks`, `excludeExternalImages` (no UI fields, not in spec), duplicate camelCase writes for `usePersistentContext`/`userDataDir`, unused `ignoreLinks`/`ignoreCache` in `createMarkdownGenerator()`.
- **Router dead code**: Both Simple and Advanced routers read `options` at item 0 (never used by operations). Removed.
- **Stale comment**: "ContentExtractor" reference in shared/utils.ts updated.
- **README**: Added end-user installation instructions, fixed `task_id` → `taskId` references.

### Removed

- Old v4.x node directories (`Crawl4aiPlusBasicCrawler`, `Crawl4aiPlusContentExtractor`, `Crawl4aiPlusSmartExtract`).
- Unused interfaces: `Crawl4aiOutput`, `LlmSchema`, `LlmSchemaField`.
- Unused devDependencies: `@types/express`, `@types/request`, `@types/request-promise-native`.

### Improved

- **Content filter boilerplate extracted**: ~55 lines of duplicated content filter / table extraction logic across `crawlUrl`, `crawlMultipleUrls`, and `processRawHtml` replaced with shared `applyOutputFilteringConfig()` helper.
- **README**: Updated project structure to reflect v5.0.0 two-node architecture.
