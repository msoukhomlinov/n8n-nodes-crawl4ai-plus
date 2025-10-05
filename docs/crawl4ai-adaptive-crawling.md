# Adaptive Web Crawling (NEW in 0.7.x)

**Source**: https://docs.crawl4ai.com/core/adaptive-crawling  
**Scraped**: 2025-10-05

---

## Overview

**Adaptive Crawling** introduces intelligence into the crawling process by determining when sufficient information has been gathered to answer a query.

Traditional crawlers follow predetermined patterns blindly. Adaptive Crawling solves both **under-crawling** (stopping too early) and **over-crawling** (wasting resources on irrelevant pages).

## Key Concepts

### The Problem It Solves

When crawling for specific information:
1. **Under-crawling**: Missing crucial information
2. **Over-crawling**: Wasting resources on irrelevant pages

### How It Works

The AdaptiveCrawler uses three metrics:

- **Coverage**: How well collected pages cover query terms
- **Consistency**: Whether information is coherent across pages
- **Saturation**: Detecting when new pages aren't adding new information

When these metrics indicate sufficiency, crawling stops automatically.

## Quick Start

### Basic Usage

```python
from crawl4ai import AsyncWebCrawler, AdaptiveCrawler

async def main():
    async with AsyncWebCrawler() as crawler:
        # Create adaptive crawler
        adaptive = AdaptiveCrawler(crawler)

        # Start crawling with a query
        result = await adaptive.digest(
            start_url="https://docs.python.org/3/",
            query="async context managers"
        )

        # View statistics
        adaptive.print_stats()

        # Get most relevant content
        relevant_pages = adaptive.get_relevant_content(top_k=5)
        for page in relevant_pages:
            print(f"- {page['url']} (score: {page['score']:.2f})")
```

### Configuration Options

```python
from crawl4ai import AdaptiveConfig

config = AdaptiveConfig(
    confidence_threshold=0.8,    # Stop when 80% confident (default: 0.7)
    max_pages=30,               # Maximum pages to crawl (default: 20)
    top_k_links=5,              # Links to follow per page (default: 3)
    min_gain_threshold=0.05     # Minimum expected gain to continue (default: 0.1)
)

adaptive = AdaptiveCrawler(crawler, config)
```

## Crawling Strategies

### Statistical Strategy (Default)

Pure information theory and term-based analysis:

- **Fast and efficient** - No API calls or model loading
- **Term-based coverage** - Analyzes query term presence
- **No external dependencies** - Works offline
- **Best for**: Well-defined queries with specific terminology

```python
config = AdaptiveConfig(
    strategy="statistical",  # Default
    confidence_threshold=0.8
)
```

### Embedding Strategy

Uses semantic embeddings for deeper understanding:

- **Semantic understanding** - Captures meaning beyond exact terms
- **Query expansion** - Automatically generates query variations
- **Gap-driven selection** - Identifies semantic gaps
- **Validation-based stopping** - Uses held-out queries
- **Best for**: Complex queries, ambiguous topics, conceptual understanding

```python
from crawl4ai import LLMConfig

config = AdaptiveConfig(
    strategy="embedding",
    embedding_model="sentence-transformers/all-MiniLM-L6-v2",  # Default
    n_query_variations=10,
    embedding_min_confidence_threshold=0.1,
    
    # With custom LLM provider (recommended)
    embedding_llm_config=LLMConfig(
        provider='openai/text-embedding-3-small',
        api_token='your-api-key',
        temperature=0.7
    )
)
```

### Strategy Comparison

| Feature | Statistical | Embedding |
|---------|------------|-----------|
| **Speed** | Very fast | Moderate |
| **Cost** | Free | Depends on provider |
| **Accuracy** | Good for exact terms | Excellent for concepts |
| **Dependencies** | None | Embedding model/API |
| **Query Understanding** | Literal | Semantic |
| **Best Use Case** | Technical docs | Research, broad topics |

### Embedding Strategy Configuration

```python
config = AdaptiveConfig(
    strategy="embedding",
    
    # Model configuration
    embedding_model="sentence-transformers/all-MiniLM-L6-v2",
    embedding_llm_config=None,  # Use for API-based embeddings
    
    # Query expansion
    n_query_variations=10,
    
    # Coverage parameters
    embedding_coverage_radius=0.2,
    embedding_k_exp=3.0,  # Higher = stricter
    
    # Stopping criteria
    embedding_min_relative_improvement=0.1,
    embedding_validation_min_score=0.3,
    embedding_min_confidence_threshold=0.1,
    
    # Link selection
    embedding_overlap_threshold=0.85,
    
    # Display confidence mapping
    embedding_quality_min_confidence=0.7,
    embedding_quality_max_confidence=0.95
)
```

### Handling Irrelevant Queries

The embedding strategy can detect unrelated queries:

```python
# This will stop quickly with low confidence
result = await adaptive.digest(
    start_url="https://docs.python.org/3/",
    query="how to cook pasta"  # Irrelevant to Python docs
)

# Check if query was irrelevant
if result.metrics.get('is_irrelevant', False):
    print("Query is unrelated to the content!")
```

## When to Use Adaptive Crawling

### Perfect For:

- **Research Tasks**: Finding comprehensive information
- **Question Answering**: Gathering context for specific queries
- **Knowledge Base Building**: Creating focused datasets
- **Competitive Intelligence**: Collecting complete product/feature information

### Not Recommended For:

- **Full Site Archiving**: When you need every page
- **Structured Data Extraction**: Targeting specific page patterns
- **Real-time Monitoring**: Continuous updates

## Understanding the Output

### Confidence Score

Confidence score (0-1) indicates information sufficiency:

- **0.0-0.3**: Insufficient, needs more crawling
- **0.3-0.6**: Partial information
- **0.6-0.7**: Good coverage
- **0.7-1.0**: Excellent coverage

### Statistics Display

```python
adaptive.print_stats(detailed=False)  # Summary table
adaptive.print_stats(detailed=True)   # Detailed metrics
```

## Persistence and Resumption

### Saving Progress

```python
config = AdaptiveConfig(
    save_state=True,
    state_path="my_crawl_state.json"
)

result = await adaptive.digest(start_url, query)
```

### Resuming a Crawl

```python
result = await adaptive.digest(
    start_url,
    query,
    resume_from="my_crawl_state.json"
)
```

### Exporting Knowledge Base

```python
# Export collected pages
adaptive.export_knowledge_base("knowledge_base.jsonl")

# Import into another session
new_adaptive = AdaptiveCrawler(crawler)
new_adaptive.import_knowledge_base("knowledge_base.jsonl")
```

## Best Practices

### 1. Query Formulation

- Use specific, descriptive queries
- Include key terms you expect to find
- Avoid overly broad queries

### 2. Threshold Tuning

- Start with default (0.7) for general use
- Lower to 0.5-0.6 for exploratory crawling
- Raise to 0.8+ for exhaustive coverage

### 3. Performance Optimization

- Use appropriate `max_pages` limits
- Adjust `top_k_links` based on site structure
- Enable caching for repeat crawls

### 4. Link Selection

Crawler prioritizes links based on:
- Relevance to query
- Expected information gain
- URL structure and depth

## Examples

### Research Assistant

```python
# Gather information about a programming concept
result = await adaptive.digest(
    start_url="https://realpython.com",
    query="python decorators implementation patterns"
)

# Get most relevant excerpts
for doc in adaptive.get_relevant_content(top_k=3):
    print(f"\nFrom: {doc['url']}")
    print(f"Relevance: {doc['score']:.2%}")
    print(doc['content'][:500] + "...")
```

### Knowledge Base Builder

```python
# Build focused knowledge base
queries = [
    "supervised learning algorithms",
    "neural network architectures",
    "model evaluation metrics"
]

for query in queries:
    await adaptive.digest(
        start_url="https://scikit-learn.org/stable/",
        query=query
    )

# Export combined knowledge base
adaptive.export_knowledge_base("ml_knowledge.jsonl")
```

### API Documentation Crawler

```python
# Intelligently crawl API documentation
config = AdaptiveConfig(
    confidence_threshold=0.85,
    max_pages=30
)

adaptive = AdaptiveCrawler(crawler, config)
result = await adaptive.digest(
    start_url="https://api.example.com/docs",
    query="authentication endpoints rate limits"
)
```

## FAQ

**Q: How is this different from traditional crawling?**
A: Traditional crawling follows fixed patterns (BFS/DFS). Adaptive crawling makes intelligent decisions about which links to follow and when to stop based on information gain.

**Q: Can I use this with JavaScript-heavy sites?**
A: Yes! AdaptiveCrawler inherits all AsyncWebCrawler capabilities, including JavaScript execution.

**Q: How does it handle large websites?**
A: The algorithm naturally limits crawling to relevant sections. Use `max_pages` as a safety limit.

**Q: Can I customize the scoring algorithms?**
A: Advanced users can implement custom strategies.

## Conclusion

Adaptive Crawling is a **NEW flagship feature in Crawl4AI 0.7.x** that:

- ✅ Intelligently determines when sufficient information is gathered
- ✅ Supports statistical (fast) and embedding (semantic) strategies
- ✅ Provides query-driven, confidence-based stopping
- ✅ Enables efficient research and knowledge base building
- ✅ Prevents both under-crawling and over-crawling

This is a game-changer for intelligent web scraping workflows!

