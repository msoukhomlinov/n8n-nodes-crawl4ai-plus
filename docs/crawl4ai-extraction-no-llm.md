# Extracting JSON (No LLM)

**Source**: https://docs.crawl4ai.com/extraction/no-llm-strategies  
**Scraped**: 2025-10-05

---

## Overview

One of Crawl4AI's most powerful features is extracting structured JSON from websites **without** relying on large language models. Crawl4AI offers several strategies for LLM-free extraction:

1. **Schema-based extraction** with CSS or XPath selectors via `JsonCssExtractionStrategy` and `JsonXPathExtractionStrategy`
2. **Regular expression extraction** with `RegexExtractionStrategy` for fast pattern matching

**Why avoid LLM for basic extractions?**

1. **Faster & Cheaper**: No API calls or GPU overhead
2. **Lower Carbon Footprint**: LLM inference can be energy-intensive
3. **Precise & Repeatable**: CSS/XPath selectors and regex do exactly what you specify
4. **Scales Readily**: For thousands of pages, pattern-based extraction runs quickly

## 1. Schema-Based Extraction

A schema defines:
1. A **base selector** that identifies each "container" element
2. **Fields** describing which CSS/XPath selectors to use for each piece of data
3. **Nested** or **list** types for repeated or hierarchical structures

### Simple Example: Crypto Prices

```python
import json
import asyncio
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode
from crawl4ai import JsonCssExtractionStrategy

async def extract_crypto_prices():
    # 1. Define extraction schema
    schema = {
        "name": "Crypto Prices",
        "baseSelector": "div.crypto-row",
        "fields": [
            {
                "name": "coin_name",
                "selector": "h2.coin-name",
                "type": "text"
            },
            {
                "name": "price",
                "selector": "span.coin-price",
                "type": "text"
            }
        ]
    }

    # 2. Create extraction strategy
    extraction_strategy = JsonCssExtractionStrategy(schema, verbose=True)

    # 3. Set up crawler config
    config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        extraction_strategy=extraction_strategy,
    )

    async with AsyncWebCrawler(verbose=True) as crawler:
        result = await crawler.arun(
            url="https://example.com/crypto-prices",
            config=config
        )

        if result.success:
            data = json.loads(result.extracted_content)
            print(f"Extracted {len(data)} coin entries")
            print(json.dumps(data[0], indent=2) if data else "No data found")

asyncio.run(extract_crypto_prices())
```

### XPath Example

```python
from crawl4ai import JsonXPathExtractionStrategy

schema = {
    "name": "Crypto Prices via XPath",
    "baseSelector": "//div[@class='crypto-row']",
    "fields": [
        {
            "name": "coin_name",
            "selector": ".//h2[@class='coin-name']",
            "type": "text"
        },
        {
            "name": "price",
            "selector": ".//span[@class='coin-price']",
            "type": "text"
        }
    ]
}

config = CrawlerRunConfig(
    extraction_strategy=JsonXPathExtractionStrategy(schema, verbose=True)
)
```

## 2. Advanced Schema & Nested Structures

### E-Commerce Example

```python
schema = {
    "name": "E-commerce Product Catalog",
    "baseSelector": "div.category",
    "baseFields": [
        {"name": "data_cat_id", "type": "attribute", "attribute": "data-cat-id"}
    ],
    "fields": [
        {
            "name": "category_name",
            "selector": "h2.category-name",
            "type": "text"
        },
        {
            "name": "products",
            "selector": "div.product",
            "type": "nested_list",
            "fields": [
                {
                    "name": "name",
                    "selector": "h3.product-name",
                    "type": "text"
                },
                {
                    "name": "price",
                    "selector": "p.product-price",
                    "type": "text"
                },
                {
                    "name": "details",
                    "selector": "div.product-details",
                    "type": "nested",
                    "fields": [
                        {"name": "brand", "selector": "span.brand", "type": "text"},
                        {"name": "model", "selector": "span.model", "type": "text"}
                    ]
                },
                {
                    "name": "features",
                    "selector": "ul.product-features li",
                    "type": "list",
                    "fields": [
                        {"name": "feature", "type": "text"}
                    ]
                },
                {
                    "name": "reviews",
                    "selector": "div.review",
                    "type": "nested_list",
                    "fields": [
                        {"name": "reviewer", "selector": "span.reviewer", "type": "text"},
                        {"name": "rating", "selector": "span.rating", "type": "text"},
                        {"name": "comment", "selector": "p.review-text", "type": "text"}
                    ]
                }
            ]
        }
    ]
}
```

**Key Takeaways**:
- **`type: "nested"`**: Single sub-object
- **`type: "list"`**: Multiple simple items
- **`type: "nested_list"`**: Repeated complex objects
- **Base Fields**: Extract attributes from container element

## 3. RegexExtractionStrategy (NEW in 0.7.x)

Fast pattern-based extraction using pre-compiled regular expressions.

### Key Features

- **Zero LLM Dependency**: No AI model calls
- **Blazing Fast**: Pre-compiled regex patterns
- **Built-in Patterns**: Common data types ready to use
- **Custom Patterns**: Add your own regex
- **LLM-Assisted Pattern Generation**: Use LLM once to generate patterns, then reuse

### Simple Example

```python
from crawl4ai import RegexExtractionStrategy

# Use built-in patterns
strategy = RegexExtractionStrategy(
    pattern=RegexExtractionStrategy.Url | RegexExtractionStrategy.Currency
)

config = CrawlerRunConfig(extraction_strategy=strategy)

async with AsyncWebCrawler() as crawler:
    result = await crawler.arun(
        url="https://example.com",
        config=config
    )
    
    if result.success:
        data = json.loads(result.extracted_content)
        for item in data[:5]:
            print(f"{item['label']}: {item['value']}")
```

### Available Built-in Patterns

- `Email` - Email addresses
- `PhoneIntl` / `PhoneUS` - Phone numbers
- `Url` - HTTP/HTTPS URLs
- `IPv4` / `IPv6` - IP addresses
- `Uuid` - UUIDs
- `Currency` - Currency values
- `Percentage` - Percentage values
- `Number` - Numeric values
- `DateIso` / `DateUS` - Date formats
- `Time24h` - 24-hour time
- `PostalUS` / `PostalUK` - Postal codes
- `HexColor` - HTML hex colors
- `TwitterHandle` - Twitter handles
- `Hashtag` - Hashtags
- `MacAddr` - MAC addresses
- `Iban` - Bank account numbers
- `CreditCard` - Credit card numbers

### Custom Pattern Example

```python
# Define custom pattern for USD prices
price_pattern = {"usd_price": r"\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?"}

strategy = RegexExtractionStrategy(custom=price_pattern)
config = CrawlerRunConfig(extraction_strategy=strategy)
```

### LLM-Assisted Pattern Generation

```python
from pathlib import Path
from crawl4ai import LLMConfig

cache_dir = Path("./pattern_cache")
pattern_file = cache_dir / "price_pattern.json"

# Generate pattern once
if not pattern_file.exists():
    llm_config = LLMConfig(
        provider="openai/gpt-4o-mini",
        api_token="env:OPENAI_API_KEY"
    )
    
    # Get sample HTML
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun("https://example.com/products")
        html = result.fit_html
    
    # Generate pattern (one-time LLM usage)
    pattern = RegexExtractionStrategy.generate_pattern(
        label="price",
        html=html,
        query="Product prices in USD format",
        llm_config=llm_config
    )
    
    # Cache for future use
    json.dump(pattern, pattern_file.open("w"), indent=2)

# Use cached pattern (no LLM calls)
pattern = json.load(pattern_file.open())
strategy = RegexExtractionStrategy(custom=pattern)
```

### Extraction Results Format

```json
[
  {
    "url": "https://example.com",
    "label": "email",
    "value": "contact@example.com",
    "span": [145, 163]
  },
  {
    "url": "https://example.com",
    "label": "url",
    "value": "https://support.example.com",
    "span": [210, 235]
  }
]
```

## 4. Schema Generation Utility

Automatically generate extraction schemas using LLM (one-time cost):

```python
from crawl4ai import JsonCssExtractionStrategy, LLMConfig

html = """
<div class="product-card">
    <h2 class="title">Gaming Laptop</h2>
    <div class="price">$999.99</div>
</div>
"""

# Option 1: Using OpenAI
css_schema = JsonCssExtractionStrategy.generate_schema(
    html,
    schema_type="css",
    llm_config=LLMConfig(provider="openai/gpt-4o", api_token="your-token")
)

# Option 2: Using Ollama (open source, no token)
xpath_schema = JsonXPathExtractionStrategy.generate_schema(
    html,
    schema_type="xpath",
    llm_config=LLMConfig(provider="ollama/llama3.3", api_token=None)
)

# Use generated schema
strategy = JsonCssExtractionStrategy(css_schema)
```

## 5. Best Practices

1. **Inspect the DOM** in browser DevTools to find stable selectors
2. **Start Simple**: Verify single field extraction before adding complexity
3. **Test** schema on partial HTML first
4. **Combine with JS** if site loads content dynamically
5. **Use baseFields** for container-level attributes
6. **Consider Regex First** for simple data types
7. **Performance**: Make selectors as narrow as possible

## Choosing the Right Strategy

- **`RegexExtractionStrategy`**: Fast extraction of emails, phones, URLs, dates, etc.
- **`JsonCssExtractionStrategy`** / **`JsonXPathExtractionStrategy`**: Structured data with clear HTML patterns
- **Both**: Extract structured data, then use regex on specific fields

## Conclusion

Crawl4AI's LLM-free extraction strategies provide:
- Fast, cheap, and reliable data extraction
- Support for nested objects and repeating lists
- Pattern-based extraction with regex
- Zero hallucination and guaranteed structure

For structured, consistent data, these approaches are far superior to LLM-based extraction in speed, cost, and reliability.

