# Changelog

## 5.1.2 (2026-04-30)

### Fixed
- LiteLLM/custom provider now auto-prefixes `openai/` when Base URL is set, matching OpenAI-compatible proxy protocol
- `llmExtractor` now surfaces LLM errors instead of silently returning error JSON as data
- Credentials "Custom Provider" field renamed to "Model ID" with description clarifying that Crawl4AI's LiteLLM SDK strips provider prefixes before calling the proxy

## 5.1.1 (2026-04-30)

### Fixed
- LLM operations crash with HTTP 500: `LLMConfig` rejects `api_base` — correct field is `base_url`. Affected `askQuestion`, `extractData`, `llmExtractor`, and LLM-backed extraction when using Ollama or custom provider.

## 5.1.0

See git history.
