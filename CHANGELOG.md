# Changelog

## 5.1.1 (2026-04-30)

### Fixed
- LLM operations crash with HTTP 500: `LLMConfig` rejects `api_base` — correct field is `base_url`. Affected `askQuestion`, `extractData`, `llmExtractor`, and LLM-backed extraction when using Ollama or custom provider.

## 5.1.0

See git history.
