# Browser, Crawler & LLM Configuration

**Source**: https://docs.crawl4ai.com/core/browser-crawler-config  
**Scraped**: 2025-10-05

---

## Overview

Crawl4AI's flexibility stems from three key classes:

1. **`BrowserConfig`** – Dictates **how** the browser is launched and behaves (e.g., headless or visible, proxy, user agent).
2. **`CrawlerRunConfig`** – Dictates **how** each **crawl** operates (e.g., caching, extraction, timeouts, JavaScript code to run, etc.).
3. **`LLMConfig`** - Dictates **how** LLM providers are configured. (model, api token, base url, temperature etc.)

In most examples, you create **one** `BrowserConfig` for the entire crawler session, then pass a **fresh** or re-used `CrawlerRunConfig` whenever you call `arun()`.

## 1. BrowserConfig Essentials

```python
class BrowserConfig:
    def __init__(
        browser_type="chromium",
        headless=True,
        proxy_config=None,
        viewport_width=1080,
        viewport_height=600,
        verbose=True,
        use_persistent_context=False,
        user_data_dir=None,
        cookies=None,
        headers=None,
        user_agent=None,
        text_mode=False,
        light_mode=False,
        extra_args=None,
        enable_stealth=False,
        # ... other advanced parameters omitted here
    ):
        ...
```

### Key Fields

1. **`browser_type`**: Options: `"chromium"`, `"firefox"`, or `"webkit"`. Defaults to `"chromium"`.

2. **`headless`**: `True` runs invisible browser, `False` runs visible (helps debugging).

3. **`proxy_config`**: Dictionary with `server`, optional `username`/`password`.

4. **`viewport_width` & `viewport_height`**: Initial window size.

5. **`verbose`**: If `True`, prints extra logs.

6. **`use_persistent_context`**: If `True`, uses persistent browser profile. Set `user_data_dir` to point to a folder.

7. **`cookies`** & **`headers`**: Start with specific cookies or add universal HTTP headers.

8. **`user_agent`**: Custom User-Agent string.

9. **`text_mode`** & **`light_mode`**: Performance optimizations.

10. **`extra_args`**: Additional browser flags (e.g., `["--disable-extensions"]`).

11. **`enable_stealth`**: Enables stealth mode using playwright-stealth to avoid basic bot detection.

### Helper Methods

Both configuration classes provide a `clone()` method to create modified copies:

```python
# Create a base browser config
base_browser = BrowserConfig(
    browser_type="chromium",
    headless=True,
    text_mode=True
)

# Create a visible browser config for debugging
debug_browser = base_browser.clone(
    headless=False,
    verbose=True
)
```

## 2. CrawlerRunConfig Essentials

```python
class CrawlerRunConfig:
    def __init__(
        word_count_threshold=200,
        extraction_strategy=None,
        markdown_generator=None,
        cache_mode=None,
        js_code=None,
        wait_for=None,
        screenshot=False,
        pdf=False,
        capture_mhtml=False,
        # Location and Identity Parameters
        locale=None,            # e.g. "en-US", "fr-FR"
        timezone_id=None,       # e.g. "America/New_York"
        geolocation=None,       # GeolocationConfig object
        # Resource Management
        enable_rate_limiting=False,
        rate_limit_config=None,
        memory_threshold_percent=70.0,
        check_interval=1.0,
        max_session_permit=20,
        display_mode=None,
        verbose=True,
        stream=False,  # Enable streaming for arun_many()
        # ... other advanced parameters omitted
    ):
        ...
```

### Key Fields

1. **`word_count_threshold`**: Minimum word count before a block is considered.

2. **`extraction_strategy`**: Plug in JSON-based extraction (CSS, LLM, etc.).

3. **`markdown_generator`**: Control HTML→Markdown conversion.

4. **`cache_mode`**: Controls caching behavior (`ENABLED`, `BYPASS`, `DISABLED`).

5. **`js_code`**: String or list of JS strings to execute.

6. **`wait_for`**: CSS or JS expression to wait for before extracting content.

7. **`screenshot`, `pdf`, `capture_mhtml`**: Capture snapshots after page load.

8. **Location Parameters**: `locale`, `timezone_id`, `geolocation` for location-based crawling.

9. **`verbose`**: Logs additional runtime details.

10. **Resource Management**: `enable_rate_limiting`, `memory_threshold_percent`, `max_session_permit`.

11. **`url_matcher` & `match_mode`**: Enable URL-specific configurations for `arun_many()`.

12. **`display_mode`**: Display mode for progress information.

### Helper Methods

```python
# Create a base configuration
base_config = CrawlerRunConfig(
    cache_mode=CacheMode.ENABLED,
    word_count_threshold=200,
    wait_until="networkidle"
)

# Create variations for different use cases
stream_config = base_config.clone(
    stream=True,
    cache_mode=CacheMode.BYPASS
)

debug_config = base_config.clone(
    page_timeout=120000,
    verbose=True
)
```

## 3. LLMConfig Essentials

### Key Fields

1. **`provider`**: Which LLM provider to use. Examples: `"ollama/llama3"`, `"openai/gpt-4o-mini"`, `"anthropic/claude-3-sonnet"`, `"gemini/gemini-pro"`, `"deepseek/deepseek-chat"`

2. **`api_token`**: API token or use `"env:ENV_VAR_NAME"` to read from environment variables.

3. **`base_url`**: Custom endpoint if your provider has one.

```python
llm_config = LLMConfig(
    provider="openai/gpt-4o-mini",
    api_token=os.getenv("OPENAI_API_KEY")
)
```

## 4. Complete Example

```python
import asyncio
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode, LLMConfig, LLMContentFilter, DefaultMarkdownGenerator
from crawl4ai import JsonCssExtractionStrategy

async def main():
    # 1) Browser config
    browser_conf = BrowserConfig(
        headless=True,
        viewport_width=1280,
        viewport_height=720
    )

    # 2) Extraction strategy
    schema = {
        "name": "Articles",
        "baseSelector": "div.article",
        "fields": [
            {"name": "title", "selector": "h2", "type": "text"},
            {"name": "link", "selector": "a", "type": "attribute", "attribute": "href"}
        ]
    }
    extraction = JsonCssExtractionStrategy(schema)

    # 3) LLM content filtering
    gemini_config = LLMConfig(
        provider="gemini/gemini-1.5-pro",
        api_token="env:GEMINI_API_TOKEN"
    )

    filter = LLMContentFilter(
        llm_config=gemini_config,
        instruction="Focus on extracting core educational content...",
        chunk_token_threshold=500,
        verbose=True
    )

    md_generator = DefaultMarkdownGenerator(
        content_filter=filter,
        options={"ignore_links": True}
    )

    # 4) Crawler run config
    run_conf = CrawlerRunConfig(
        markdown_generator=md_generator,
        extraction_strategy=extraction,
        cache_mode=CacheMode.BYPASS,
    )

    async with AsyncWebCrawler(config=browser_conf) as crawler:
        result = await crawler.arun(url="https://example.com/news", config=run_conf)
        
        if result.success:
            print("Extracted content:", result.extracted_content)
        else:
            print("Error:", result.error_message)

if __name__ == "__main__":
    asyncio.run(main())
```

## Conclusion

**BrowserConfig**, **CrawlerRunConfig** and **LLMConfig** provide clear, maintainable ways to configure:
- Which browser to launch and how it should run
- How each crawl should behave
- Which LLM provider to use for extraction

For detailed parameter lists, see the [official API reference](https://docs.crawl4ai.com/api/parameters/).

