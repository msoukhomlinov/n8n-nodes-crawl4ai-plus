# Advanced Features Overview

**Source**: https://docs.crawl4ai.com/advanced/advanced-features  
**Scraped**: 2025-10-05

---

## Overview

Crawl4AI offers multiple power-user features beyond simple crawling:

1. Proxy Usage
2. Capturing PDFs & Screenshots
3. Handling SSL Certificates
4. Custom Headers
5. Session Persistence & Local Storage
6. Robots.txt Compliance
7. Anti-Bot Features (Stealth Mode & Undetected Browser)

## 1. Proxy Usage

Route crawl traffic through a proxy for IP rotation, geo-testing, or privacy:

```python
import asyncio
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

async def main():
    browser_cfg = BrowserConfig(
        proxy_config={
            "server": "http://proxy.example.com:8080",
            "username": "myuser",
            "password": "mypass",
        },
        headless=True
    )
    crawler_cfg = CrawlerRunConfig(verbose=True)

    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        result = await crawler.arun(
            url="https://www.whatismyip.com/",
            config=crawler_cfg
        )
        if result.success:
            print("[OK] Page fetched via proxy")
            print("Page HTML snippet:", result.html[:200])
        else:
            print("[ERROR]", result.error_message)

if __name__ == "__main__":
    asyncio.run(main())
```

**Key Points**:
- `proxy_config` requires `server` and optional auth credentials
- Omit `username`/`password` if proxy doesn't need auth

## 2. Capturing PDFs & Screenshots

Capture visual records or PDF "printouts":

```python
import os, asyncio
from base64 import b64decode
from crawl4ai import AsyncWebCrawler, CacheMode, CrawlerRunConfig

async def main():
    run_config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        screenshot=True,
        pdf=True
    )

    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(
            url="https://en.wikipedia.org/wiki/List_of_common_misconceptions",
            config=run_config
        )
        if result.success:
            if result.screenshot:
                print(f"[OK] Screenshot captured, size: {len(result.screenshot)} bytes")
                with open("wikipedia_screenshot.png", "wb") as f:
                    f.write(b64decode(result.screenshot))
            
            if result.pdf:
                print(f"[OK] PDF captured, size: {len(result.pdf)} bytes")
                with open("wikipedia_page.pdf", "wb") as f:
                    f.write(result.pdf)
        else:
            print("[ERROR]", result.error_message)
```

**Why PDF + Screenshot?**
- PDFs are more reliable for very long pages
- Screenshots provide visual verification
- Both can be captured in one pass

## 3. Handling SSL Certificates

Fetch and export SSL certificates for compliance or debugging:

```python
import asyncio, os
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode

async def main():
    tmp_dir = os.path.join(os.getcwd(), "tmp")
    os.makedirs(tmp_dir, exist_ok=True)

    config = CrawlerRunConfig(
        fetch_ssl_certificate=True,
        cache_mode=CacheMode.BYPASS
    )

    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url="https://example.com", config=config)

        if result.success and result.ssl_certificate:
            cert = result.ssl_certificate
            print("\nCertificate Information:")
            print(f"Issuer (CN): {cert.issuer.get('CN', '')}")
            print(f"Valid until: {cert.valid_until}")
            print(f"Fingerprint: {cert.fingerprint}")

            # Export in multiple formats
            cert.to_json(os.path.join(tmp_dir, "certificate.json"))
            cert.to_pem(os.path.join(tmp_dir, "certificate.pem"))
            cert.to_der(os.path.join(tmp_dir, "certificate.der"))

            print("\nCertificate exported to JSON/PEM/DER")
        else:
            print("[ERROR] No certificate or crawl failed")
```

## 4. Custom Headers

Set custom headers for language preferences, authentication, or user agents:

```python
import asyncio
from crawl4ai import AsyncWebCrawler

async def main():
    # Option 1: Set at crawler strategy level
    crawler1 = AsyncWebCrawler()
    crawler1.crawler_strategy.update_user_agent("MyCustomUA/1.0")
    crawler1.crawler_strategy.set_custom_headers({
        "Accept-Language": "fr-FR,fr;q=0.9"
    })
    result1 = await crawler1.arun("https://www.example.com")

    # Option 2: Pass headers directly to arun()
    crawler2 = AsyncWebCrawler()
    result2 = await crawler2.arun(
        url="https://www.example.com",
        headers={"Accept-Language": "es-ES,es;q=0.9"}
    )
```

## 5. Session Persistence & Local Storage

Preserve cookies and localStorage to continue where you left off:

```python
import asyncio
from crawl4ai import AsyncWebCrawler

async def main():
    storage_dict = {
        "cookies": [
            {
                "name": "session",
                "value": "abcd1234",
                "domain": "example.com",
                "path": "/",
                "expires": 1699999999.0,
                "httpOnly": False,
                "secure": False,
                "sameSite": "None"
            }
        ],
        "origins": [
            {
                "origin": "https://example.com",
                "localStorage": [
                    {"name": "token", "value": "my_auth_token"}
                ]
            }
        ]
    }

    async with AsyncWebCrawler(
        headless=True,
        storage_state=storage_dict
    ) as crawler:
        result = await crawler.arun("https://example.com/protected")
        if result.success:
            print("Protected page content length:", len(result.html))
```

### Exporting & Reusing State

```python
# Export state after login
await context.storage_state(path="my_storage.json")

# Reuse on subsequent runs
crawler = AsyncWebCrawler(storage_state="my_storage.json")
```

## 6. Robots.txt Compliance

Respect robots.txt rules with efficient caching:

```python
import asyncio
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig

async def main():
    config = CrawlerRunConfig(
        check_robots_txt=True  # Check and respect robots.txt
    )

    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(
            "https://example.com",
            config=config
        )

        if not result.success and result.status_code == 403:
            print("Access denied by robots.txt")
```

**Key Points**:
- Robots.txt files cached locally for efficiency
- Cache stored in `~/.crawl4ai/robots/robots_cache.db`
- Default TTL: 7 days
- Returns 403 if URL is disallowed

## 7. Anti-Bot Features

### Stealth Mode

Uses playwright-stealth to modify browser fingerprints:

```python
browser_config = BrowserConfig(
    enable_stealth=True,  # Activates stealth mode
    headless=False
)
```

**When to use**: Sites with basic bot detection (navigator.webdriver checks)

### Undetected Browser

For advanced bot detection:

```python
from crawl4ai import UndetectedAdapter
from crawl4ai.async_crawler_strategy import AsyncPlaywrightCrawlerStrategy

adapter = UndetectedAdapter()
strategy = AsyncPlaywrightCrawlerStrategy(
    browser_config=browser_config,
    browser_adapter=adapter
)

async with AsyncWebCrawler(crawler_strategy=strategy, config=browser_config) as crawler:
    # Your crawling code
```

**When to use**: Sophisticated bot detection (Cloudflare, DataDome, etc.)

### Combining Both

For maximum evasion:

```python
browser_config = BrowserConfig(
    enable_stealth=True,  # Enable stealth
    headless=False
)

adapter = UndetectedAdapter()  # Use undetected browser
```

### Choosing the Right Approach

| Detection Level | Recommended Approach |
|----------------|---------------------|
| No protection | Regular browser |
| Basic checks | Regular + Stealth mode |
| Advanced protection | Undetected browser |
| Maximum evasion | Undetected + Stealth mode |

## Complete Example

Combining multiple advanced features:

```python
import os, asyncio
from base64 import b64decode
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

async def main():
    # Browser config with proxy + headless
    browser_cfg = BrowserConfig(
        proxy_config={
            "server": "http://proxy.example.com:8080",
            "username": "myuser",
            "password": "mypass",
        },
        headless=True,
    )

    # Crawler config with PDF, screenshot, SSL, custom headers
    crawler_cfg = CrawlerRunConfig(
        pdf=True,
        screenshot=True,
        fetch_ssl_certificate=True,
        cache_mode=CacheMode.BYPASS,
        headers={"Accept-Language": "en-US,en;q=0.8"},
        storage_state="my_storage.json",  # Reuse session
        verbose=True,
    )

    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        result = await crawler.arun(
            url="https://secure.example.com/protected",
            config=crawler_cfg
        )

        if result.success:
            print("[OK] Crawled secure page")
            
            # Save PDF & screenshot
            if result.pdf:
                with open("result.pdf", "wb") as f:
                    f.write(b64decode(result.pdf))
            if result.screenshot:
                with open("result.png", "wb") as f:
                    f.write(b64decode(result.screenshot))
            
            # Check SSL cert
            if result.ssl_certificate:
                print("SSL Issuer CN:", result.ssl_certificate.issuer.get("CN", ""))
        else:
            print("[ERROR]", result.error_message)
```

## Conclusion

Advanced features covered:
- ✅ Proxy usage for IP rotation
- ✅ PDF & Screenshot capture
- ✅ SSL certificate retrieval
- ✅ Custom headers
- ✅ Session persistence
- ✅ Robots.txt compliance
- ✅ Anti-bot features (Stealth & Undetected Browser)

These tools enable robust scraping workflows that mimic real user behavior and bypass bot detection.

