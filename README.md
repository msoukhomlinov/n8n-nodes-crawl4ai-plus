# n8n-nodes-crawl4ai

This package provides n8n nodes to integrate with [Crawl4AI](https://github.com/unclecode/crawl4ai), an LLM-friendly web crawler and data extraction library.

## Key Features

- **Basic Web Crawling**: Fetch content from single or multiple URLs
- **Content Extraction**: Extract structured data using CSS selectors or LLM
- **JSON Extraction**: Parse JSON data from APIs, script tags, or JSON-LD
- **Flexible Configuration**: Configure browser settings, caching, and more
- **LLM Integration**: Use AI models to understand and extract structured data

## Installation

### Installation in n8n Desktop App / Self-Hosted

1. Go to **Settings > Community Nodes**
2. Click **Install a node from npm**
3. Enter `n8n-nodes-crawl4ai` and click **Install**
4. Restart n8n

### Installation in Docker

Add the following environment variables to your docker-compose.yml file:

```yaml
N8N_CUSTOM_EXTENSIONS: "n8n-nodes-crawl4ai"
```

### Required Dependencies

To use these nodes, you'll need:

1. **Crawl4AI**: This nodes package requires the Crawl4AI Python library. You can install it on your server with:
   ```bash
   pip install crawl4ai
   crawl4ai-setup  # Setup browser dependencies
   ```

2. **Playwright**: Crawl4AI depends on Playwright for browser automation. It will be installed automatically when you run `crawl4ai-setup`.

## Nodes

This package contains the following nodes:

### 1. Crawl4AI: Basic Crawler

Crawls websites and extracts content as text, markdown, or HTML.

- **Operations**:
  - **Crawl Single URL**: Crawl a single URL and extract its content
  - **Crawl Multiple URLs**: Crawl multiple URLs in parallel
  - **Process Raw HTML**: Process provided HTML content without crawling

### 2. Crawl4AI: Content Extractor

Extracts structured data from websites using various strategies.

- **Operations**:
  - **CSS Selector Extractor**: Extract structured content using CSS selectors
  - **LLM Extractor**: Extract structured content using LLM models
  - **JSON Extractor**: Extract JSON data from a webpage

## Credentials

This package includes the following credentials:

### Crawl4AI API

Configure connection settings for Crawl4AI:

- **Connection Mode**: Direct Python package or Docker client
- **LLM Provider Settings**: Configure LLM providers for AI-powered extraction
- **Cache Settings**: Configure caching for better performance

## Usage Examples

### Example 1: Basic Web Crawling

1. Add **Crawl4AI: Basic Crawler** node
2. Select **Crawl Single URL** operation
3. Enter the URL to crawl
4. Configure browser options as needed
5. Execute the node to get the extracted content

### Example 2: Extracting Product Data with CSS Selectors

1. Add **Crawl4AI: Content Extractor** node
2. Select **CSS Selector Extractor** operation
3. Enter the URL of a product listing page
4. Set the base selector to target each product element
5. Add fields for title, price, description, etc.
6. Execute the node to get structured product data

### Example 3: Extracting Data with LLM

1. Add **Crawl4AI: Content Extractor** node
2. Select **LLM Extractor** operation
3. Enter the URL and extraction instructions
4. Define schema fields for the data you want to extract
5. Configure the LLM provider
6. Execute the node to get AI-extracted data

## Resources

- [Crawl4AI GitHub Repository](https://github.com/unclecode/crawl4ai)
- [Crawl4AI Documentation](https://github.com/unclecode/crawl4ai/tree/main/docs)
- [n8n Documentation](https://docs.n8n.io/)

## License

[MIT](LICENSE.md)
