# Extracting JSON (LLM)

**Source**: https://docs.crawl4ai.com/extraction/llm-strategies  
**Scraped**: 2025-10-05

---

## Overview

For complex or unstructured information that CSS/XPath schemas cannot easily parse, Crawl4AI provides **LLM-based extraction** that:

1. Works with **any** LLM supported by LiteLLM (Ollama, OpenAI, Claude, etc.)
2. Automatically splits content into chunks to handle token limits
3. Lets you define a schema (Pydantic model) or simpler block extraction

**Important**: LLM-based extraction is slower and costlier than schema-based approaches. Use CSS/XPath strategies first for structured data.

## 1. Why Use an LLM?

- **Complex Reasoning**: Unstructured, scattered, or natural language context
- **Semantic Extraction**: Summaries, knowledge graphs, or relational data
- **Flexible**: Advanced transformations or classification via instructions

## 2. Provider-Agnostic via LiteLLM

Configure LLMs using `LLMConfig`:

```python
llm_config = LLMConfig(
    provider="openai/gpt-4o-mini",
    api_token=os.getenv("OPENAI_API_KEY")
)
```

Crawl4AI supports any model that LiteLLM supports via provider strings:
- `"openai/gpt-4o"`
- `"ollama/llama2"`
- `"anthropic/claude-3-sonnet"`
- `"gemini/gemini-pro"`
- `"deepseek/deepseek-chat"`
- And hundreds more

## 3. How LLM Extraction Works

### Flow

1. **Chunking** (optional): Split HTML/markdown into smaller segments
2. **Prompt Construction**: Form prompt with your instruction and schema
3. **LLM Inference**: Send chunks to model (parallel or sequential)
4. **Combining**: Merge and parse results into JSON

### `extraction_type`

- **`"schema"`**: Model returns JSON conforming to your Pydantic schema
- **`"block"`**: Model returns freeform text or smaller JSON structures

For structured data, use `"schema"`.

## 4. Key Parameters

```python
LLMExtractionStrategy(
    llm_config=LLMConfig(...),           # LLM provider configuration
    schema=YourModel.model_json_schema(), # JSON schema
    extraction_type="schema",             # or "block"
    instruction="Extract...",             # Prompt text
    chunk_token_threshold=1200,           # Max tokens per chunk
    overlap_rate=0.1,                     # Chunk overlap (0.0-1.0)
    apply_chunking=True,                  # Enable/disable chunking
    input_format="markdown",              # "markdown", "html", "fit_markdown"
    extra_args={"temperature": 0.1},      # LLM parameters
    verbose=True
)
```

### Important Parameters

1. **`llm_config`**: LLM provider and credentials
2. **`schema`**: JSON schema for structured extraction
3. **`extraction_type`**: `"schema"` or `"block"`
4. **`instruction`**: Prompt telling LLM what to extract
5. **`chunk_token_threshold`**: Maximum tokens per chunk
6. **`overlap_rate`**: Overlap between chunks (continuity)
7. **`apply_chunking`**: Enable automatic chunking
8. **`input_format`**: Which content to send (`"markdown"`, `"html"`, `"fit_markdown"`)
9. **`extra_args`**: LLM parameters like `temperature`, `max_tokens`, `top_p`

## 5. Complete Example

```python
import os
import asyncio
import json
from pydantic import BaseModel
from typing import List
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode, LLMConfig
from crawl4ai import LLMExtractionStrategy

class Product(BaseModel):
    name: str
    price: str

async def main():
    # 1. Define LLM extraction strategy
    llm_strategy = LLMExtractionStrategy(
        llm_config=LLMConfig(
            provider="openai/gpt-4o-mini",
            api_token=os.getenv('OPENAI_API_KEY')
        ),
        schema=Product.schema_json(),
        extraction_type="schema",
        instruction="Extract all product objects with 'name' and 'price'.",
        chunk_token_threshold=1000,
        overlap_rate=0.0,
        apply_chunking=True,
        input_format="markdown",
        extra_args={"temperature": 0.0, "max_tokens": 800}
    )

    # 2. Build crawler config
    crawl_config = CrawlerRunConfig(
        extraction_strategy=llm_strategy,
        cache_mode=CacheMode.BYPASS
    )

    # 3. Create browser config
    browser_cfg = BrowserConfig(headless=True)

    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        result = await crawler.arun(
            url="https://example.com/products",
            config=crawl_config
        )

        if result.success:
            data = json.loads(result.extracted_content)
            print("Extracted items:", data)
            
            # Show usage stats
            llm_strategy.show_usage()
        else:
            print("Error:", result.error_message)

if __name__ == "__main__":
    asyncio.run(main())
```

## 6. Chunking Details

### `chunk_token_threshold`

Sets approximate max tokens per chunk. If your page is large, content is split to fit within LLM context window.

### `overlap_rate`

Overlap between chunks (0.0-1.0). Example: `overlap_rate=0.1` means 10% of previous chunk is included in next chunk. Helps maintain context continuity.

### Performance & Parallelism

Chunking allows parallel processing of multiple segments, reducing total time for large pages.

## 7. Input Format

By default, uses `input_format="markdown"`:

- **`"markdown"`**: Crawler's final markdown
- **`"html"`**: Cleaned or raw HTML
- **`"fit_markdown"`**: Filtered markdown (if using content filters)

Choose based on your LLM instructions:
- Use `"html"` if instructions rely on HTML tags
- Use `"markdown"` for text-based approach
- Use `"fit_markdown"` for most relevant content

```python
LLMExtractionStrategy(
    input_format="html",  # or "markdown", "fit_markdown"
    # ...
)
```

## 8. Token Usage & Monitoring

Track token usage and costs:

```python
llm_strategy = LLMExtractionStrategy(...)
# ... after crawling
llm_strategy.show_usage()
# Prints: "Total usage: 1241 tokens across 2 chunk calls"
```

Each chunk call is recorded in:
- **`usages`** (list): Token usage per chunk
- **`total_usage`**: Sum of all chunks
- **`show_usage()`**: Print usage report

## 9. Knowledge Graph Example

```python
from typing import List
from pydantic import BaseModel

class Entity(BaseModel):
    name: str
    description: str

class Relationship(BaseModel):
    entity1: Entity
    entity2: Entity
    description: str
    relation_type: str

class KnowledgeGraph(BaseModel):
    entities: List[Entity]
    relationships: List[Relationship]

async def main():
    llm_strat = LLMExtractionStrategy(
        llm_config=LLMConfig(
            provider="openai/gpt-4",
            api_token=os.getenv('OPENAI_API_KEY')
        ),
        schema=KnowledgeGraph.model_json_schema(),
        extraction_type="schema",
        instruction="Extract entities and relationships. Return valid JSON.",
        chunk_token_threshold=1400,
        apply_chunking=True,
        input_format="html",
        extra_args={"temperature": 0.1, "max_tokens": 1500}
    )

    crawl_config = CrawlerRunConfig(
        extraction_strategy=llm_strat,
        cache_mode=CacheMode.BYPASS
    )

    async with AsyncWebCrawler(config=BrowserConfig(headless=True)) as crawler:
        result = await crawler.arun(
            url="https://www.nbcnews.com/business",
            config=crawl_config
        )

        if result.success:
            with open("kb_result.json", "w", encoding="utf-8") as f:
                f.write(result.extracted_content)
            llm_strat.show_usage()
        else:
            print("Crawl failed:", result.error_message)
```

## 10. Best Practices

1. **Cost & Latency**: LLM calls are slow/expensive. Consider chunking or partial coverage
2. **Model Token Limits**: Chunking is essential if page + instruction exceed context window
3. **Instruction Engineering**: Well-crafted instructions improve output reliability
4. **Schema Strictness**: `"schema"` extraction parses JSON output; invalid JSON may fail
5. **Parallel vs. Serial**: Watch for rate limits when processing multiple chunks in parallel
6. **Validate Output**: LLMs may omit fields or add extraneous text; post-validate with Pydantic

## 11. Choosing Between Strategies

| Feature | Schema-based (CSS/XPath) | LLM-based |
|---------|--------------------------|-----------|
| **Speed** | Very fast | Slow |
| **Cost** | Free | Varies by provider |
| **Accuracy** | Exact matches | Semantic understanding |
| **Use Case** | Structured, consistent data | Unstructured, complex reasoning |

**Recommendation**: Try CSS/XPath strategies first. Use LLM extraction only when you need AI interpretation or semantic understanding.

## Conclusion

LLM-based extraction offers:
- Provider-agnostic flexibility via LiteLLM
- Automatic chunking for large content
- Schema-driven or freeform extraction
- Semantic understanding for complex tasks

But remember: it's slower and costlier than pattern-based approaches. Use wisely!

