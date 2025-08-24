# Crawl4AI for n8n

This project provides n8n integration for Crawl4AI, a powerful web crawling and data extraction tool. It consists of two main nodes:

1. **Crawl4AI: Basic Crawler** - For general web crawling and content extraction
2. **Crawl4AI: Content Extractor** - For extracting structured data using CSS selectors, LLM, or JSON

## Features

### Basic Crawler Node

- **Crawl Single URL** - Extract content from a single web page
- **Crawl Multiple URLs** - Process multiple web pages in one operation
- **Process Raw HTML** - Extract content from raw HTML without crawling

### Content Extractor Node

- **CSS Selector Extractor** - Extract structured data using CSS selectors
- **LLM Extractor** - Use AI to extract structured data from webpages
- **JSON Extractor** - Extract and process JSON data from web pages

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
   - **Connection Mode**: Direct or Docker
   - **Authentication**: Configure as needed
   - **LLM Settings**: Enable and configure if needed for AI extraction

### Basic Crawler Usage

The Basic Crawler node allows you to crawl web pages and extract their content:

1. Add the "Crawl4AI: Basic Crawler" node to your workflow
2. Select an operation (Crawl Single URL, Crawl Multiple URLs, or Process Raw HTML)
3. Configure the required parameters
4. Run the workflow to extract content

### Content Extractor Usage

The Content Extractor node allows you to extract structured data from web pages:

1. Add the "Crawl4AI: Content Extractor" node to your workflow
2. Select an extraction method (CSS Selector, LLM, or JSON)
3. Configure the extraction parameters
4. Run the workflow to extract structured data

## Configuration Options

### Browser Options

- **Headless Mode**: Run browser in headless mode
- **Enable JavaScript**: Enable JavaScript execution
- **Viewport Size**: Set browser viewport dimensions
- **Timeout**: Maximum time to wait for page load
- **User Agent**: Override browser user agent

### Crawler Options

- **Cache Mode**: Control caching behavior
- **JavaScript Code**: Execute custom JS on the page
- **CSS Selector**: Focus crawling on specific elements
- **Excluded Tags**: Skip specific HTML tags
- **Check Robots.txt**: Respect robots.txt rules
- **Word Count Threshold**: Filter content by word count

### LLM Extraction Options

- **Extraction Instructions**: Instructions for the AI
- **Schema Fields**: Define structured data schema
- **LLM Provider**: Choose AI model provider
- **Temperature**: Control randomness of AI responses

## Project Structure

```
nodes/
  ├── Crawl4aiBasicCrawler/
  │   ├── Crawl4aiBasicCrawler.node.ts         # Main node file
  │   ├── crawl4ai.svg                        # Icon
  │   ├── actions/
  │   │   ├── operations.ts                   # Operations definition
  │   │   ├── router.ts                       # Router handler
  │   │   ├── crawlSingleUrl.operation.ts     # Single URL crawl operation
  │   │   ├── crawlMultipleUrls.operation.ts  # Multiple URL crawl operation
  │   │   └── processRawHtml.operation.ts     # Raw HTML processing operation
  │   └── helpers/
  │       ├── interfaces.ts                   # Interface definitions
  │       ├── utils.ts                        # Common utilities
  │       ├── apiClient.ts                    # API client
  │       └── formatters.ts                   # Formatting tools
  │
  └── Crawl4aiContentExtractor/
      ├── Crawl4aiContentExtractor.node.ts    # Main node file
      ├── crawl4ai.svg                        # Icon
      ├── actions/
      │   ├── operations.ts                   # Operations definition
      │   ├── router.ts                       # Router handler
      │   ├── cssExtractor.operation.ts       # CSS selector extraction operation
      │   ├── llmExtractor.operation.ts       # LLM extraction operation
      │   └── jsonExtractor.operation.ts      # JSON extraction operation
      └── helpers/
          ├── interfaces.ts                   # Interface definitions
          ├── utils.ts                        # Common utilities
          ├── apiClient.ts                    # API client
          └── formatters.ts                   # Formatting tools

credentials/
  └── Crawl4aiApi.credentials.ts              # Credentials definition
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
