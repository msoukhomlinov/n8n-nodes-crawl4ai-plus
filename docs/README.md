# Crawl4AI 0.7.x Documentation

**Collection Date**: 2025-10-05  
**Official Documentation**: https://docs.crawl4ai.com/

---

## Overview

This directory contains scraped and organized documentation from Crawl4AI 0.7.x for reference during n8n node development. Each document includes the source URL and comprehensive examples.

## Documentation Index

### Core Concepts

1. **[Browser, Crawler & LLM Configuration](./crawl4ai-browser-crawler-config.md)**
   - BrowserConfig essentials (browser types, headless, proxy, stealth)
   - CrawlerRunConfig essentials (cache modes, extraction strategies, JS execution)
   - LLMConfig essentials (provider configuration, API tokens)
   - Complete examples with all three configs

2. **[Simple Crawling](./crawl4ai-simple-crawling.md)**
   - Basic usage patterns
   - Understanding CrawlResult response
   - Adding basic options
   - Error handling
   - Complete working examples

### Extraction Strategies

3. **[Extracting JSON (No LLM)](./crawl4ai-extraction-no-llm.md)**
   - **JsonCssExtractionStrategy** - CSS selector-based extraction
   - **JsonXPathExtractionStrategy** - XPath selector-based extraction
   - **RegexExtractionStrategy** - NEW in 0.7.x, pattern-based extraction
   - Schema-based extraction with nested structures
   - Built-in regex patterns (email, phone, URL, etc.)
   - LLM-assisted pattern generation (use once, reuse forever)
   - Schema generation utility

4. **[Extracting JSON (LLM)](./crawl4ai-extraction-llm.md)**
   - **LLMExtractionStrategy** - AI-powered extraction
   - Provider-agnostic via LiteLLM
   - Chunking for large content
   - Multiple input formats (markdown, html, fit_markdown)
   - Token usage monitoring
   - Knowledge graph example
   - All supported LLM providers

### Advanced Features

5. **[Advanced Features Overview](./crawl4ai-advanced-features.md)**
   - Proxy usage (IP rotation, geo-testing)
   - PDF & Screenshot capture
   - SSL certificate handling
   - Custom headers
   - Session persistence & storage state
   - Robots.txt compliance
   - **Anti-bot features** (Stealth mode, Undetected browser)
   - Complete combined example

6. **[Adaptive Crawling](./crawl4ai-adaptive-crawling.md)** ⭐ **NEW in 0.7.x**
   - Intelligent query-driven crawling
   - Statistical strategy (fast, term-based)
   - Embedding strategy (semantic understanding)
   - Confidence-based stopping
   - Query expansion and validation
   - Persistence and resumption
   - Knowledge base export/import
   - Complete examples

## Quick Reference

### Key New Features in 0.7.x

1. **Adaptive Crawling** 🆕 - Intelligent stopping when sufficient info gathered
2. **RegexExtractionStrategy** 🆕 - Fast pattern-based extraction
3. **Stealth Mode** 🆕 - Anti-bot detection features
4. **Undetected Browser** 🆕 - Advanced bot evasion

### Browser Types

- `chromium` (default)
- `firefox`
- `webkit`

### Extraction Strategies

| Strategy | Type | Use Case |
|----------|------|----------|
| JsonCssExtractionStrategy | No LLM | Structured data, CSS selectors |
| JsonXPathExtractionStrategy | No LLM | Structured data, XPath selectors |
| RegexExtractionStrategy | No LLM | Pattern matching (emails, URLs, etc.) |
| LLMExtractionStrategy | LLM | Unstructured data, semantic extraction |

### Cache Modes

- `ENABLED` - Use cache if available, save new results
- `BYPASS` - Always fetch fresh content
- `DISABLED` - No caching
- `ONLY` - Only use cache, don't make new requests

### LLM Providers (via LiteLLM)

- OpenAI: `openai/gpt-4o`, `openai/gpt-4o-mini`
- Anthropic: `anthropic/claude-3-sonnet`, `anthropic/claude-3-opus`
- Google: `gemini/gemini-pro`, `gemini/gemini-1.5-pro`
- Groq: `groq/llama3-70b-8192`, `groq/llama3-8b-8192`
- Ollama: `ollama/llama3`, `ollama/llama2`
- DeepSeek: `deepseek/deepseek-chat`
- And 100+ more via LiteLLM

## Usage in n8n Node Development

These documents serve as reference for:

1. **API compatibility verification** - Ensure REST API matches official behaviour
2. **Feature coverage analysis** - Identify missing/partial implementations
3. **Parameter mapping** - Map Python API to n8n node parameters
4. **Error handling** - Understand expected errors and status codes
5. **Example workflows** - Create n8n workflow examples

## Priority Implementation Areas

Based on analysis (see `.cursorrules` scratchpad):

### Priority 1 - Critical
1. Verify API compatibility
2. Add RegexExtractionStrategy
3. Add Adaptive Crawling
4. Expand LLM providers
5. Add browser type selection
6. Add wait_for conditions
7. Improve error handling

### Priority 2 - Important
1. Add XPathExtractionStrategy
2. Add screenshot/PDF capture
3. Add storage state persistence
4. Improve LLM config options
5. Add content filters
6. Add fit_markdown support

## Notes

- All documentation scraped from official source: https://docs.crawl4ai.com/
- Covers Crawl4AI version 0.7.x
- Python examples provided; adapt for REST API in n8n implementation
- Some features may require Docker deployment verification

---

**Last Updated**: 2025-10-05

