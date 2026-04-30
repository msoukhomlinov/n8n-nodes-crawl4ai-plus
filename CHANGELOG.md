# Changelog

## 5.1.2 (2026-04-30)

### Fixed
- LiteLLM/custom provider now auto-prefixes `openai/` when Base URL is set, matching OpenAI-compatible proxy protocol
- `llmExtractor` now surfaces LLM errors instead of silently returning error JSON as data
- Credentials "Custom Provider" field renamed to "Model ID" with description clarifying that Crawl4AI's LiteLLM SDK strips provider prefixes before calling the proxy
- `askQuestion` answer field no longer returns LLM fallback message when later page chunks found the answer
- `metrics.crawlTime` now populated — was always null because `server_processing_time_s` lives on the API response wrapper, not per-result; now promoted onto each result before returning
- `metrics` no longer emits null-valued keys
- New fields surfaced across all nodes: `metrics.cacheStatus`, `metrics.memoryDeltaMb`, `metrics.peakMemoryMb`, `redirectedUrl` (conditional), `jsExecutionResult` (conditional), `downloadedFiles` (conditional)
- `extractData` Contact Info: replaced phone regex with `libphonenumber-js` for accurate detection and E.164 deduplication; removed social media (noise); tightened address regex to require state code + postcode; Default Country Code option (default AU) for local number parsing; optional LLM Validation pass to clean false positives using the configured LLM

## 5.1.1 (2026-04-30)

### Fixed
- LLM operations crash with HTTP 500: `LLMConfig` rejects `api_base` — correct field is `base_url`. Affected `askQuestion`, `extractData`, `llmExtractor`, and LLM-backed extraction when using Ollama or custom provider.

## 5.1.0

See git history.
