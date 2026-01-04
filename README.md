# Crawl4AI Plus for n8n

> **Enhanced fork** with comprehensive Crawl4AI v0.7.x support, including regex extraction, multi-browser support, and 22+ LLM providers.

## Project History & Attribution

This is a maintained fork with enhanced features for Crawl4AI 0.7.x.

### Fork Chain
- **Original author**: [Heictor Hsiao](https://github.com/golfamigo) - [golfamigo/n8n-nodes-crawl4j](https://github.com/golfamigo/n8n-nodes-crawl4j)
- **First maintainer**: [Matias Lopez](https://github.com/qmatiaslopez) - [qmatiaslopez/n8n-nodes-crawl4j](https://github.com/qmatiaslopez/n8n-nodes-crawl4j)
- **Current maintainer**: [Max Soukhomlinov](https://github.com/msoukhomlinov) - [msoukhomlinov/n8n-nodes-crawl4ai-plus](https://github.com/msoukhomlinov/n8n-nodes-crawl4ai-plus)

All credit for the original implementation goes to **Heictor Hsiao** and **Matias Lopez**.

## What's New in v2.1.0

This version includes comprehensive Crawl4AI 0.7.4+ support with major improvements:

### 🚀 Major Features
- ✅ **Recursive Deep Crawling** - Keyword-driven recursive crawling with BestFirst/BFS/DFS strategies
- ✅ **6 Extraction Strategies** - CSS, LLM, JSON, Regex, Cosine Similarity, and SEO Metadata extraction
- ✅ **LLM Pattern Generation** - Natural language to regex pattern conversion
- ✅ **Table Extraction** - LLM-based and default table extraction for complex structures
- ✅ **Session Management** - Browser storage state, cookies, and persistent contexts
- ✅ **Output Formats** - Screenshot, PDF, and SSL certificate extraction
- ✅ **Content Filtering** - Pruning, BM25, and LLM content filters
- ✅ **Anti-Bot Features** - Magic mode, user simulation, and navigator override

### 🔧 Core Improvements
- ✅ **Unified API Client** - Standardized error handling with actionable messages
- ✅ **95%+ API Coverage** - Comprehensive support for Crawl4AI 0.7.4 REST API
- ✅ **Multi-Browser Support** - Chromium, Firefox, and Webkit
- ✅ **22+ LLM Providers** - OpenAI, Anthropic, Groq, Ollama, and custom providers
- ✅ **Enhanced Cache Modes** - 5 modes (ENABLED, DISABLED, READ_ONLY, WRITE_ONLY, BYPASS)

---

This project provides n8n integration for Crawl4AI, a powerful web crawling and data extraction tool. It consists of two main nodes:

1. **Crawl4AI Plus: Basic Crawler** - For general web crawling, recursive discovery, and content extraction
2. **Crawl4AI Plus: Content Extractor** - For extracting structured data using 6 different extraction strategies

## Features

### Basic Crawler Node

- **Crawl Single URL** - Extract content from a single web page with full configuration options
- **Crawl Multiple URLs** - Process multiple web pages or use recursive discovery mode
  - **Recursive Discovery** - Keyword-driven deep crawling with configurable depth and filters
  - **Multiple Strategies** - BestFirst (recommended), BFS, or DFS crawling strategies
  - **Extraction Options** - Apply CSS or LLM extraction to each discovered page (shallow crawl with extraction)
- **Process Raw HTML** - Extract content from raw HTML without crawling
- **Discover Links** - Extract and filter all links from a page
  - **Link Types** - Filter by internal or external links
  - **Pattern Filters** - Include/exclude URLs by pattern matching
  - **Output Formats** - Grouped or split output for workflow flexibility

### Content Extractor Node

- **CSS Selector Extractor** - Extract structured data using CSS selectors
- **LLM Extractor** - Use AI to extract structured data with schema support
  - **Input Formats** - Markdown, HTML, or fit_markdown
  - **Schema Modes** - Simple fields or advanced JSON schema
- **JSON Extractor** - Extract and process JSON data from web pages (direct, script tags, or JSON-LD)
- **Regex Extractor** - Extract data using 21 built-in patterns, custom regex, or LLM-generated patterns
  - **Quick Presets** - Contact Info and Financial Data presets for common extraction tasks
- **Cosine Similarity Extractor** - Semantic similarity-based content extraction with clustering (requires `all` Docker image)
- **SEO Metadata Extractor** - Extract SEO metadata including:
  - **Basic Meta Tags** - Title, description, keywords, canonical URL
  - **Open Graph Tags** - OG title, description, image, type
  - **Twitter Cards** - Twitter card metadata
  - **JSON-LD** - Schema.org structured data

> **Note**: Table extraction is available in the **Basic Crawler** node via the Table Extraction options (LLM-based or default heuristics).

## Installation

1. Clone this repository into your n8n custom nodes directory
2. Run `npm install` to install dependencies
3. Restart your n8n instance

## Usage

### Setting up credentials

Before using the nodes, you need to set up Crawl4AI API credentials:

1. Go to **Settings > Credentials > New**
2. Select **Crawl4AI API**
3. Configure connection settings:
   - **Docker URL**: URL of your Crawl4AI Docker container (default: `http://localhost:11235`)
   - **Authentication**: Optional token or basic auth if your Docker instance requires it
   - **LLM Settings**: Enable and configure LLM provider for AI extraction features
     - Supported providers: OpenAI, Anthropic, Groq, Ollama, or custom LiteLLM endpoints

### Basic Crawler Usage

The Basic Crawler node allows you to crawl web pages and extract their content:

1. Add the "Crawl4AI: Basic Crawler" node to your workflow
2. Select an operation (Crawl Single URL, Crawl Multiple URLs, or Process Raw HTML)
3. Configure the required parameters
4. Run the workflow to extract content

### Content Extractor Usage

The Content Extractor node allows you to extract structured data from web pages:

1. Add the "Crawl4AI Plus: Content Extractor" node to your workflow
2. Select an extraction method:
   - **CSS Selector** - For structured pages with consistent selectors
   - **LLM Extractor** - For AI-powered extraction with natural language instructions
   - **JSON Extractor** - For JSON APIs or embedded JSON data
   - **Regex Extractor** - For pattern-based extraction (21 built-in patterns or custom)
   - **Cosine Extractor** - For semantic similarity-based clustering (requires transformers)
   - **SEO Metadata** - For extracting page titles, meta tags, OG tags, and JSON-LD structured data
3. Configure the extraction parameters
4. Run the workflow to extract structured data

> **Tip**: For table extraction, use the **Basic Crawler** node with Table Extraction options enabled.

## Configuration Options

### Browser Options

- **Browser Type**: Chromium (default), Firefox, or Webkit
- **Headless Mode**: Run browser in headless mode
- **Enable JavaScript**: Enable JavaScript execution
- **Enable Stealth Mode**: Bypass basic bot detection
- **Extra Browser Arguments**: Custom command-line arguments
- **Viewport Size**: Set browser viewport dimensions
- **Timeout**: Maximum time to wait for page load
- **User Agent**: Override browser user agent

### Session & Authentication

- **Storage State (JSON)**: Browser storage state for authenticated sessions (works in all n8n environments)
- **Cookies**: Array of cookie objects for simple authentication
- **User Data Directory**: Persistent browser profiles (self-hosted only)
- **Use Managed Browser**: Enable managed browser mode for persistent contexts

### Crawler Options

- **Cache Mode**: 5 modes (ENABLED, DISABLED, READ_ONLY, WRITE_ONLY, BYPASS)
- **JavaScript Code**: Execute custom JS on the page before extraction
- **CSS Selector**: Focus crawling on specific elements
- **Wait Until**: Control when page is considered loaded
- **Delay Before Return**: Add delay before returning HTML
- **Excluded Tags**: Skip specific HTML tags
- **Check Robots.txt**: Respect robots.txt rules
- **Word Count Threshold**: Filter content by word count

### Deep Crawl Options (Crawl Multiple URLs)

- **Crawl Mode**: Manual URL list or Recursive Discovery
- **Seed URL**: Starting URL for recursive discovery
- **Query**: Keywords for relevance-based crawling
- **Strategy**: BestFirst (recommended), BFS, or DFS
- **Max Depth**: Maximum crawl depth
- **Max Pages**: Maximum number of pages to crawl
- **Domain Filters**: Include/exclude specific domains
- **URL Pattern Filters**: Regex patterns for URL filtering

### Output Options

- **Screenshot**: Capture page screenshots
- **PDF**: Generate PDF from page
- **SSL Certificate**: Extract SSL certificate information
- **Markdown Variants**: Raw markdown, fit markdown, or cleaned markdown
- **Structured Links**: Extract and structure all links from page

### Content Filtering

- **Pruning Filter**: Remove low-value content based on thresholds
- **BM25 Filter**: Relevance-based content filtering
- **LLM Content Filter**: Intelligent content filtering using LLM

### LLM Extraction Options

- **Extraction Instructions**: Natural language instructions for the AI
- **Schema Mode**: Simple fields or advanced JSON schema
- **Input Format**: Markdown (default), HTML, or fit_markdown
- **LLM Provider**: Choose AI model provider
- **Temperature**: Control randomness of AI responses (0-1)
- **Max Tokens**: Maximum tokens for LLM response

## Project Structure

```
nodes/
  ├── Crawl4aiPlusBasicCrawler/
  │   ├── Crawl4aiPlusBasicCrawler.node.ts    # Main node file
  │   ├── crawl4aiplus.svg                    # Icon
  │   ├── actions/
  │   │   ├── operations.ts                   # Operations definition
  │   │   ├── router.ts                       # Router handler
  │   │   ├── crawlSingleUrl.operation.ts     # Single URL crawl operation
  │   │   ├── crawlMultipleUrls.operation.ts  # Multiple URL crawl + recursive discovery
  │   │   ├── processRawHtml.operation.ts     # Raw HTML processing operation
  │   │   └── discoverLinks.operation.ts      # Link discovery and extraction
  │   └── helpers/
  │       ├── interfaces.ts                   # Interface definitions
  │       ├── utils.ts                        # Common utilities
  │       ├── apiClient.ts                    # Unified API client
  │       └── formatters.ts                   # Formatting tools
  │
  └── Crawl4aiPlusContentExtractor/
      ├── Crawl4aiPlusContentExtractor.node.ts # Main node file
      ├── crawl4aiplus.svg                    # Icon
      ├── actions/
      │   ├── operations.ts                   # Operations definition
      │   ├── router.ts                       # Router handler
      │   ├── cssExtractor.operation.ts       # CSS selector extraction
      │   ├── llmExtractor.operation.ts       # LLM extraction
      │   ├── jsonExtractor.operation.ts      # JSON extraction
      │   ├── regexExtractor.operation.ts     # Regex extraction
      │   ├── cosineExtractor.operation.ts    # Cosine similarity extraction
      │   └── seoExtractor.operation.ts       # SEO metadata extraction
      └── helpers/
          ├── interfaces.ts                   # Interface definitions
          └── utils.ts                        # Common utilities (re-exports from BasicCrawler)

credentials/
  └── Crawl4aiApi.credentials.ts              # Credentials definition
```

## Requirements

- **n8n**: Version 1.79.1 or higher
- **Crawl4AI Docker**: Version 0.7.3+ (0.7.4 recommended)
  - For Cosine Similarity Extractor: Use `unclecode/crawl4ai:all` image (includes transformers)
  - Standard image: `unclecode/crawl4ai:latest` or `unclecode/crawl4ai:0.7.3`

## Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version history and breaking changes.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
