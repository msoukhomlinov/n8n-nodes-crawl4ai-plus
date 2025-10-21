# Recursive Discovery Execution Mapping

This document maps UI fields to the actual Crawl4AI REST API deep crawl execution payload. Verified against Crawl4AI 0.7.4 Docker documentation.

## 1. Crawl Mode Control

| UI/Config | Execution Target | Validation / Notes |
|-----------|------------------|--------------------|
| `Crawl Mode` (Manual vs Discover) | Controls branching inside execute: `manual` continues current behaviour; `discover` builds deep crawl payload before making API call | Always available; no feature flag gating. |

## 2. Deep Crawl Inputs (Discovery Mode)

| UI Field | Parameter Path | Validation |
|----------|-----------------|------------|
| `Seed URL` | Stored as `seedUrl`; passed to API as initial `urls: [seedUrl]` | Must pass `isValidUrl`. Required when discovery mode active. |
| `Discovery Query` | Parsed into keywords array → `deepCrawlStrategy.params.url_scorer.params.keywords` via KeywordRelevanceScorer | Required non-empty string; split by space or "OR". |
| `Maximum Depth` | `deepCrawlStrategy.params.max_depth` | Default `2`; clamp to `[1,5]`. Error if user exceeds range. |
| `Maximum Pages` | `deepCrawlStrategy.params.max_pages` | Default `50`; clamp `[1,200]`. |
| `Include External Domains` | `deepCrawlStrategy.params.include_external` (boolean) | Default false. |

## 3. Filtering Options (via FilterChain)

| UI Field | Parameter Path | Validation |
|----------|----------------|------------|
| `Include Patterns` | → `filter_chain.params.filters[]` as URLPatternFilter with `reverse: false` | Split comma/array; create one filter per pattern. |
| `Exclude Patterns` | → `filter_chain.params.filters[]` as URLPatternFilter with `reverse: true` | Split comma/array; create one filter per pattern. |
| `Exclude Domains` | → `filter_chain.params.filters[]` as DomainFilter with `blocked_domains` | Split comma/array into blocked_domains list. |
| `Respect robots.txt` | Maps to `crawlerOptions.checkRobotsTxt` (NOT in strategy) | Default `true`. Goes in CrawlerRunConfig, not deep_crawl_strategy. |

## 4. Output Controls

| UI Field | Execution Behaviour |
|----------|--------------------|
| `Limit Returned Results` | Apply post-processing slice on results array after crawl completes. |

**Note**: URL Seeding (AsyncUrlSeeder with sitemap/Common Crawl sources) is Python SDK only and NOT available via REST API. Deep crawl with KeywordRelevanceScorer provides query-driven discovery instead.

## 5. Integration Points

1. **Parameter Definition**
   - Add new fields under `crawlerOptions` or `discoveryOptions` collection in the node description.
   - Ensure defaults align with mapping table above.

2. **Execution Flow (`crawlMultipleUrls.operation.ts`)**
   - Detect crawl mode (manual vs discover).
   - Build `deepCrawlStrategy` object with FilterChain and KeywordRelevanceScorer:
     ```ts
     const deepCrawlStrategy = {
       type: 'BFSDeepCrawlStrategy',
       params: {
         max_depth,
         max_pages,
         include_external,
         filter_chain: {
           type: 'FilterChain',
           params: {
             filters: [
               { type: 'DomainFilter', params: { blocked_domains: [...] } },
               { type: 'URLPatternFilter', params: { patterns: [...], reverse: true } }
             ]
           }
         },
         url_scorer: {
           type: 'KeywordRelevanceScorer',
           params: {
             keywords: query.split(/\s+OR\s+|\s+/),
             weight: 1.0
           }
         }
       },
     };
     ```
   - Pass through `createCrawlerRunConfig` via `crawlerOptions`.

3. **API Client (`formatCrawlerConfig`)**
   - Already updated to forward `deep_crawl_strategy` when present using type/params wrapper.

4. **Validation Errors**
   - Use `NodeOperationError` with `itemIndex` referencing the input item.
   - Provide actionable messages (e.g. "Maximum Depth must be between 1 and 5").

## 6. Implementation Status
- ✅ UI schema updated with crawl mode selector and discovery options
- ✅ Execution logic branches on mode and builds proper FilterChain/KeywordRelevanceScorer structures
- ✅ Legacy manual URL list flow preserved unchanged
- ✅ All parameters verified against Crawl4AI 0.7.4 REST API documentation
