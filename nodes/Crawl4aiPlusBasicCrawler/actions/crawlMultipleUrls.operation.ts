import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

// Import helpers and types
import type { Crawl4aiNodeOptions } from '../helpers/interfaces';
import {
  getCrawl4aiClient,
  createBrowserConfig,
  createCrawlerRunConfig,
  createMarkdownGenerator,
  createTableExtractionStrategy,
  isValidUrl
} from '../helpers/utils';
import { formatCrawlResult } from '../helpers/formatters';

// --- UI Definition ---
export const description: INodeProperties[] = [
  {
    displayName: 'Crawl Mode',
    name: 'crawlMode',
    type: 'options',
    options: [
      {
        name: 'Manual URL List',
        value: 'manual',
        description: 'Provide an explicit list of URLs to crawl',
      },
      {
        name: 'Discover From Seed URL',
        value: 'discover',
        description: 'Start from a homepage and recursively follow links matching your keywords (e.g. find all product pages, documentation sections, or contact info)',
      },
    ],
    default: 'manual',
    displayOptions: {
      show: {
        operation: ['crawlMultipleUrls'],
      },
    },
  },
  {
    displayName: 'Discovery Options',
    name: 'discoveryOptions',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['crawlMultipleUrls'],
        crawlMode: ['discover'],
      },
    },
    options: [
      {
        displayName: 'Crawl Strategy',
        name: 'crawlStrategy',
        type: 'options',
        options: [
          {
            name: 'Best-First (Recommended)',
            value: 'BestFirstCrawlingStrategy',
            description: 'Visit highest-scoring pages first, regardless of depth. Best for finding most relevant content quickly. Requires query keywords to score pages.',
          },
          {
            name: 'Breadth-First Search (BFS)',
            value: 'BFSDeepCrawlStrategy',
            description: 'Explore all pages at each depth level before going deeper. Best for comprehensive coverage of nearby pages.',
          },
          {
            name: 'Depth-First Search (DFS)',
            value: 'DFSDeepCrawlStrategy',
            description: 'Follow links as deep as possible on each branch before backtracking. Best for focused deep exploration of specific paths.',
          },
        ],
        default: 'BestFirstCrawlingStrategy',
        description: 'How the crawler explores links. Best-First prioritises relevance, BFS ensures breadth, DFS goes deep. Note: Best-First and DFS are validated but not officially tested by Crawl4AI.',
      },
      {
        displayName: 'Discovery Query',
        name: 'query',
        type: 'string',
        default: '',
        placeholder: 'pricing features documentation',
        description: 'Keywords that guide which links to follow. Use spaces for AND logic, "OR" for alternatives (e.g. "api documentation" finds pages about APIs and docs; "pricing OR plans" finds either).',
      },
      {
        displayName: 'Exclude Domains',
        name: 'excludeDomains',
        type: 'string',
        default: '',
        placeholder: 'social.example.com, cdn.example.com',
        description: 'Block specific domains even if external crawling is enabled. Useful for excluding CDNs, social media subdomains, etc.',
      },
      {
        displayName: 'Exclude Patterns',
        name: 'excludePatterns',
        type: 'string',
        default: '',
        placeholder: '*/careers/*, */legal/*',
        description: 'Skip URLs matching these patterns. Useful for avoiding careers, legal, login pages, etc.',
      },
      {
        displayName: 'Include External Domains',
        name: 'includeExternal',
        type: 'boolean',
        default: false,
        description: 'Whether to follow links to other domains. Leave OFF to stay on the same site, turn ON to follow external references.',
      },
      {
        displayName: 'Include Patterns',
        name: 'includePatterns',
        type: 'string',
        default: '',
        placeholder: '*/products/*, */pricing/*',
        description: 'Only follow URLs matching these patterns (wildcards supported). Example: "*/blog/*, */docs/*" only crawls blog and docs sections.',
      },
      {
        displayName: 'Limit Returned Results',
        name: 'resultLimit',
        type: 'number',
        default: 0,
        description: 'Cap the number of results returned to n8n (0 = return all discovered pages). Useful for sampling or performance.',
      },
      {
        displayName: 'Maximum Depth',
        name: 'maxDepth',
        type: 'number',
        default: 2,
        description: 'How many link levels deep to crawl. Depth 1 = only pages linked from seed; Depth 2 = seed + 1 more hop; etc. Range: 1-5. Lower is faster but less comprehensive.',
      },
      {
        displayName: 'Maximum Pages',
        name: 'maxPages',
        type: 'number',
        default: 50,
        description: 'Hard limit on total pages crawled to prevent runaway crawls. Range: 1-200. Tip: Start with 20-50 for testing, increase if needed.',
      },
      {
        displayName: 'Respect robots.txt',
        name: 'respectRobotsTxt',
        type: 'boolean',
        default: true,
        description: 'Whether to check and respect robots.txt directives during discovery',
      },
      {
        displayName: 'Score Threshold',
        name: 'scoreThreshold',
        type: 'number',
        default: 0,
        description: 'Minimum relevance score (0-1) for pages to be crawled. 0 = no threshold. Only used with BFS/DFS strategies; Best-First automatically prioritises high scores.',
        displayOptions: {
          show: {
            crawlStrategy: ['BFSDeepCrawlStrategy', 'DFSDeepCrawlStrategy'],
          },
        },
      },
      {
        displayName: 'Seed URL',
        name: 'seedUrl',
        type: 'string',
        default: '',
        placeholder: 'https://example.com',
        description: 'Starting point URL (usually homepage or main section). The crawler will follow links from here matching your query.',
        required: true,
      },
    ],
  },
  {
    displayName: 'URLs',
    name: 'urls',
    type: 'string',
    default: '',
    placeholder: 'https://example.com, https://example.org',
    description: 'Comma-separated list of URLs to crawl. Required when using Manual URL List mode.',
    displayOptions: {
      show: {
        operation: ['crawlMultipleUrls'],
      },
      hide: {
        crawlMode: ['discover'],
      },
    },
  },
  {
    displayName: 'Browser Options',
    name: 'browserOptions',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['crawlMultipleUrls'],
      },
    },
    options: [
      {
        displayName: 'Enable JavaScript',
        name: 'java_script_enabled',
        type: 'boolean',
        default: true,
        description: 'Whether to enable JavaScript execution',
      },
      {
        displayName: 'Enable Stealth Mode',
        name: 'enableStealth',
        type: 'boolean',
        default: false,
        description: 'Whether to enable stealth mode to bypass basic bot detection (hides webdriver properties and modifies browser fingerprints)',
      },
      {
        displayName: 'Extra Browser Arguments',
        name: 'extraArgs',
        type: 'fixedCollection',
        typeOptions: {
          multipleValues: true,
        },
        default: {},
        description: 'Additional command-line arguments to pass to the browser (advanced users only)',
        options: [
          {
            name: 'args',
            displayName: 'Arguments',
            values: [
              {
                displayName: 'Argument',
                name: 'value',
                type: 'string',
                default: '',
                placeholder: '--disable-blink-features=AutomationControlled',
                description: 'Browser command-line argument (e.g., --disable-blink-features=AutomationControlled)',
              },
            ],
          },
        ],
      },
      {
        displayName: 'Headless Mode',
        name: 'headless',
        type: 'boolean',
        default: true,
        description: 'Whether to run browser in headless mode',
      },
      {
        displayName: 'Timeout (Ms)',
        name: 'timeout',
        type: 'number',
        default: 30000,
        description: 'Maximum time to wait for the browser to load the page',
      },
      {
        displayName: 'User Agent',
        name: 'userAgent',
        type: 'string',
        default: '',
        placeholder: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...',
        description: 'The user agent to use (leave empty for default)',
      },
      {
        displayName: 'Viewport Height',
        name: 'viewportHeight',
        type: 'number',
        default: 800,
        description: 'The height of the browser viewport',
      },
      {
        displayName: 'Viewport Width',
        name: 'viewportWidth',
        type: 'number',
        default: 1280,
        description: 'The width of the browser viewport',
      },
    ],
  },
  {
    displayName: 'Session & Authentication',
    name: 'sessionOptions',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['crawlMultipleUrls'],
      },
    },
    options: [
      {
        displayName: 'Cookies',
        name: 'cookies',
        type: 'json',
        default: '',
        placeholder: '[{"name": "session_id", "value": "abc123", "domain": ".example.com", "path": "/"}]',
        description: 'Array of cookie objects to inject. Alternative to storage state for simple cookie-based auth.',
      },
      {
        displayName: 'Storage State (JSON)',
        name: 'storageState',
        type: 'string',
        typeOptions: {
          rows: 6,
        },
        default: '',
        placeholder: '{"cookies": [...], "origins": [...]}',
        description: 'Browser storage state as JSON (cookies, localStorage, sessionStorage). Captures authenticated session state. Works in all n8n environments.',
      },
      {
        displayName: 'Use Managed Browser',
        name: 'useManagedBrowser',
        type: 'boolean',
        default: false,
        description: 'Whether to use managed browser mode (required for persistent contexts). Advanced option.',
        displayOptions: {
          show: {
            usePersistentContext: [true],
          },
        },
      },
      {
        displayName: 'Use Persistent Browser Context',
        name: 'usePersistentContext',
        type: 'boolean',
        default: false,
        description: 'Whether to use a persistent browser context (requires user data directory). Only use in self-hosted environments with persistent storage.',
      },
      {
        displayName: 'User Data Directory',
        name: 'userDataDir',
        type: 'string',
        default: '',
        placeholder: '/data/browser-profiles/profile1',
        description: 'Path to browser profile directory for persistent sessions. Advanced: Only works in self-hosted n8n with persistent volumes. Use Storage State for cloud deployments.',
        displayOptions: {
          show: {
            usePersistentContext: [true],
          },
        },
      },
    ],
  },
  {
    displayName: 'Crawler Options',
    name: 'crawlerOptions',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['crawlMultipleUrls'],
      },
    },
    options: [
      {
        displayName: 'Cache Mode',
        name: 'cacheMode',
        type: 'options',
        options: [
          {
            name: 'Bypass (Skip Cache)',
            value: 'BYPASS',
            description: 'Skip cache for this operation, fetch fresh content',
          },
          {
            name: 'Disabled (No Cache)',
            value: 'DISABLED',
            description: 'No caching at all',
          },
          {
            name: 'Enabled (Read/Write)',
            value: 'ENABLED',
            description: 'Use cache if available, save new results to cache',
          },
          {
            name: 'Read Only',
            value: 'READ_ONLY',
            description: 'Only read from cache, do not write new results',
          },
          {
            name: 'Write Only',
            value: 'WRITE_ONLY',
            description: 'Only write to cache, do not read existing cache',
          },
        ],
        default: 'ENABLED',
        description: 'How to use the cache when crawling',
      },
      {
        displayName: 'Check Robots.txt',
        name: 'checkRobotsTxt',
        type: 'boolean',
        default: false,
        description: 'Whether to respect robots.txt rules',
      },
      {
        displayName: 'CSS Selector',
        name: 'cssSelector',
        type: 'string',
        default: '',
        placeholder: 'article.content',
        description: 'CSS selector to focus on specific content (leave empty for full page)',
      },
      {
        displayName: 'Exclude External Links',
        name: 'excludeExternalLinks',
        type: 'boolean',
        default: false,
        description: 'Whether to exclude external links from the result',
      },
      {
        displayName: 'Excluded Tags',
        name: 'excludedTags',
        type: 'string',
        default: '',
        placeholder: 'nav,footer,aside',
        description: 'Comma-separated list of HTML tags to exclude from processing',
      },
      {
        displayName: 'Max Retries',
        name: 'maxRetries',
        type: 'number',
        default: 3,
        description: 'Maximum number of retries for failed requests',
      },
      {
        displayName: 'Page Timeout (Ms)',
        name: 'pageTimeout',
        type: 'number',
        default: 30000,
        description: 'Maximum time to wait for the page to load',
      },
      {
        displayName: 'Request Timeout (Ms)',
        name: 'requestTimeout',
        type: 'number',
        default: 30000,
        description: 'Maximum time to wait for network requests',
      },
      {
        displayName: 'Stream Results',
        name: 'streamEnabled',
        type: 'boolean',
        default: false,
        description: 'Whether to stream results as they become available',
      },
      {
        displayName: 'Wait For',
        name: 'waitFor',
        type: 'string',
        default: '',
        placeholder: '.loading-complete',
        description: 'CSS selector or JavaScript expression to wait for before extracting content (essential for dynamic/SPA pages)',
      },
      {
        displayName: 'Word Count Threshold',
        name: 'wordCountThreshold',
        type: 'number',
        default: 0,
        description: 'Minimum number of words for content to be included',
      },
    ],
  },
  {
    displayName: 'Output Options',
    name: 'outputOptions',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['crawlMultipleUrls'],
      },
    },
    options: [
      {
        displayName: 'Capture Screenshot',
        name: 'screenshot',
        type: 'boolean',
        default: false,
        description: 'Whether to capture a screenshot of each page (returned as base64)',
      },
      {
        displayName: 'Fetch SSL Certificate',
        name: 'fetchSslCertificate',
        type: 'boolean',
        default: false,
        description: 'Whether to retrieve SSL certificate information from each server',
      },
      {
        displayName: 'Generate PDF',
        name: 'pdf',
        type: 'boolean',
        default: false,
        description: 'Whether to generate a PDF of each page (returned as base64 or binary)',
      },
      {
        displayName: 'Include Links',
        name: 'includeLinks',
        type: 'boolean',
        default: true,
        description: 'Whether to include structured internal/external links data in output',
      },
      {
        displayName: 'Include Media Data',
        name: 'includeMedia',
        type: 'boolean',
        default: false,
        description: 'Whether to include media data in output (images, videos, audios)',
      },
      {
        displayName: 'Include Tables',
        name: 'includeTables',
        type: 'boolean',
        default: true,
        description: 'Whether to include extracted tables in the output (if table extraction is enabled)',
      },
      {
        displayName: 'Markdown Output',
        name: 'markdownOutput',
        type: 'options',
        options: [
          {
            name: 'Raw Markdown',
            value: 'raw',
            description: 'Return raw markdown (default, full content)',
          },
          {
            name: 'Filtered Markdown',
            value: 'fit',
            description: 'Return content-filtered markdown (cleaner, main content only)',
          },
          {
            name: 'Both',
            value: 'both',
            description: 'Return both raw and filtered markdown variants',
          },
        ],
        default: 'raw',
        description: 'Which markdown variant(s) to return in the output',
      },
      {
        displayName: 'Max Concurrent Crawls',
        name: 'maxConcurrent',
        type: 'number',
        default: 5,
        description: 'Maximum number of concurrent crawls',
      },
      {
        displayName: 'Verbose Response',
        name: 'verboseResponse',
        type: 'boolean',
        default: false,
        description: 'Whether to include detailed data in output (HTML, status codes, etc.)',
      },
    ],
  },
  {
    displayName: 'Content Filter',
    name: 'contentFilter',
    type: 'collection',
    placeholder: 'Add Filter',
    default: {},
    displayOptions: {
      show: {
        operation: ['crawlMultipleUrls'],
      },
    },
    options: [
      {
        displayName: 'BM25 Threshold',
        name: 'bm25Threshold',
        type: 'number',
        default: 1.0,
        displayOptions: {
          show: {
            filterType: ['bm25'],
          },
        },
        description: 'Minimum BM25 score threshold for content inclusion (default: 1.0)',
      },
      {
        displayName: 'Chunk Token Threshold',
        name: 'chunkTokenThreshold',
        type: 'number',
        displayOptions: {
          show: {
            filterType: ['llm'],
          },
        },
        default: 8192,
        description: 'Maximum tokens per chunk for LLM processing (default: 8192, recommended: 4096-16384)',
      },
      {
        displayName: 'Filter Type',
        name: 'filterType',
        type: 'options',
        options: [
          {
            name: 'None',
            value: 'none',
            description: 'No content filtering (return all content)',
          },
          {
            name: 'Pruning Filter',
            value: 'pruning',
            description: 'Remove low-value content using relevance thresholds',
          },
          {
            name: 'BM25 Filter',
            value: 'bm25',
            description: 'Filter content based on query relevance using BM25 algorithm',
          },
          {
            name: 'LLM Filter',
            value: 'llm',
            description: 'Intelligent content filtering using LLM (requires LLM credentials)',
          },
        ],
        default: 'none',
        description: 'Type of content filtering to apply',
      },
      {
        displayName: 'Ignore Cache',
        name: 'ignoreCache',
        type: 'boolean',
        displayOptions: {
          show: {
            filterType: ['llm'],
          },
        },
        default: false,
        description: 'Whether to skip cache and always generate fresh filtered content',
      },
      {
        displayName: 'Ignore Links',
        name: 'ignoreLinks',
        type: 'boolean',
        default: false,
        description: 'Whether to exclude links from markdown output',
      },
      {
        displayName: 'LLM Instruction',
        name: 'llmInstruction',
        type: 'string',
        typeOptions: {
          rows: 8,
        },
        displayOptions: {
          show: {
            filterType: ['llm'],
          },
        },
        default: `Extract the main content while preserving its original wording and substance completely.
Remove only clearly irrelevant elements like:
- Navigation menus
- Advertisement sections
- Cookie notices
- Footers with site information
- Sidebars with external links
- Any UI elements that don't contribute to the content

Keep all valuable educational or informational content intact.`,
        description: 'Instructions for the LLM on how to filter and clean the content',
        required: true,
      },
      {
        displayName: 'LLM Verbose',
        name: 'llmVerbose',
        type: 'boolean',
        displayOptions: {
          show: {
            filterType: ['llm'],
          },
        },
        default: false,
        description: 'Whether to enable verbose logging for LLM content filtering',
      },
      {
        displayName: 'Min Word Threshold',
        name: 'minWordThreshold',
        type: 'number',
        default: 0,
        displayOptions: {
          show: {
            filterType: ['pruning'],
          },
        },
        description: 'Minimum word count for content blocks to be considered (0 = no minimum)',
      },
      {
        displayName: 'Threshold',
        name: 'threshold',
        type: 'number',
        default: 0.48,
        displayOptions: {
          show: {
            filterType: ['pruning'],
          },
        },
        description: 'Relevance threshold for pruning (0.0-1.0, default: 0.48). Higher values = more aggressive filtering.',
      },
      {
        displayName: 'Threshold Type',
        name: 'thresholdType',
        type: 'options',
        options: [
          {
            name: 'Fixed',
            value: 'fixed',
            description: 'Use fixed threshold value',
          },
          {
            name: 'Dynamic',
            value: 'dynamic',
            description: 'Calculate threshold dynamically based on content',
          },
        ],
        default: 'fixed',
        displayOptions: {
          show: {
            filterType: ['pruning'],
          },
        },
        description: 'How to apply the pruning threshold',
      },
      {
        displayName: 'User Query',
        name: 'userQuery',
        type: 'string',
        default: '',
        placeholder: 'main content topics keywords',
        displayOptions: {
          show: {
            filterType: ['bm25'],
          },
        },
        description: 'Query string to filter relevant content (BM25 will rank content by relevance to this query)',
      },
    ],
  },
  {
    displayName: 'Advanced Options',
    name: 'advancedOptions',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['crawlMultipleUrls'],
      },
    },
    options: [
      {
        displayName: 'Anti-Bot Features',
        name: 'antiBotFeatures',
        type: 'fixedCollection',
        default: {},
        options: [
          {
            name: 'features',
            displayName: 'Features',
            values: [
              {
                displayName: 'Magic Mode',
                name: 'magic',
                type: 'boolean',
                default: false,
                description: 'Whether to enable anti-detection techniques (stealth++)',
              },
              {
                displayName: 'Simulate User Behavior',
                name: 'simulateUser',
                type: 'boolean',
                default: false,
                description: 'Whether to simulate human-like browsing behavior',
              },
              {
                displayName: 'Override Navigator',
                name: 'overrideNavigator',
                type: 'boolean',
                default: false,
                description: 'Whether to override navigator properties to avoid detection',
              },
            ],
          },
        ],
      },
      {
        displayName: 'Delay Before Return (Ms)',
        name: 'delayBeforeReturnHtml',
        type: 'number',
        default: 0,
        description: 'Milliseconds to wait before returning HTML (useful for dynamic content)',
      },
      {
        displayName: 'Exclude External Images',
        name: 'excludeExternalImages',
        type: 'boolean',
        default: false,
        description: 'Whether to exclude images hosted on external domains',
      },
      {
        displayName: 'Exclude Social Media Links',
        name: 'excludeSocialMediaLinks',
        type: 'boolean',
        default: false,
        description: 'Whether to exclude links to social media platforms',
      },
      {
        displayName: 'Verbose Mode',
        name: 'verbose',
        type: 'boolean',
        default: false,
        description: 'Whether to enable verbose logging (debug mode)',
      },
      {
        displayName: 'Wait Until',
        name: 'waitUntil',
        type: 'options',
        options: [
          {
            name: 'Load',
            value: 'load',
            description: 'Wait for the load event',
          },
          {
            name: 'DOM Content Loaded',
            value: 'domcontentloaded',
            description: 'Wait for DOMContentLoaded event',
          },
          {
            name: 'Network Idle',
            value: 'networkidle',
            description: 'Wait for network to be idle (no requests for 500ms)',
          },
          {
            name: 'Network Idle 2',
            value: 'networkidle2',
            description: 'Wait for network to be idle (no more than 2 requests for 500ms)',
          },
        ],
        default: 'load',
        description: 'When to consider page load complete',
      },
    ],
  },
  {
    displayName: 'Table Extraction',
    name: 'tableExtraction',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['crawlMultipleUrls'],
      },
    },
    options: [
      {
        displayName: 'Chunk Token Threshold',
        name: 'chunkTokenThreshold',
        type: 'number',
        displayOptions: {
          show: {
            strategyType: ['llm'],
            enableChunking: [true],
          },
        },
        default: 10000,
        description: 'Maximum tokens per chunk when processing large tables (default: 10000)',
      },
      {
        displayName: 'CSS Selector',
        name: 'cssSelector',
        type: 'string',
        displayOptions: {
          show: {
            strategyType: ['llm'],
          },
        },
        default: '',
        placeholder: '.main-content',
        description: 'CSS selector to focus table extraction on specific page area (optional)',
      },
      {
        displayName: 'Enable Chunking',
        name: 'enableChunking',
        type: 'boolean',
        displayOptions: {
          show: {
            strategyType: ['llm'],
          },
        },
        default: false,
        description: 'Whether to enable chunking for large tables (recommended for tables with 100+ rows)',
      },
      {
        displayName: 'Max Parallel Chunks',
        name: 'maxParallelChunks',
        type: 'number',
        displayOptions: {
          show: {
            strategyType: ['llm'],
            enableChunking: [true],
          },
        },
        default: 5,
        description: 'Maximum number of chunks to process in parallel (default: 5)',
      },
      {
        displayName: 'Max Tries',
        name: 'maxTries',
        type: 'number',
        displayOptions: {
          show: {
            strategyType: ['llm'],
          },
        },
        default: 3,
        description: 'Maximum number of retry attempts for LLM extraction (default: 3)',
      },
      {
        displayName: 'Min Rows Per Chunk',
        name: 'minRowsPerChunk',
        type: 'number',
        displayOptions: {
          show: {
            strategyType: ['llm'],
            enableChunking: [true],
          },
        },
        default: 20,
        description: 'Minimum number of rows per chunk (default: 20)',
      },
      {
        displayName: 'Strategy Type',
        name: 'strategyType',
        type: 'options',
        options: [
          {
            name: 'None',
            value: 'none',
            description: 'No table extraction',
          },
          {
            name: 'LLM Table Extraction',
            value: 'llm',
            description: 'Extract tables using LLM (handles complex tables with rowspan/colspan)',
          },
          {
            name: 'Default Table Extraction',
            value: 'default',
            description: 'Extract tables using heuristics (faster, simpler tables only)',
          },
        ],
        default: 'none',
        description: 'Table extraction strategy to use',
      },
      {
        displayName: 'Table Score Threshold',
        name: 'tableScoreThreshold',
        type: 'number',
        displayOptions: {
          show: {
            strategyType: ['default'],
          },
        },
        default: 5,
        description: 'Minimum score for table to be included in results (default: 5, range: 0-10)',
      },
      {
        displayName: 'Verbose',
        name: 'verbose',
        type: 'boolean',
        displayOptions: {
          show: {
            strategyType: ['llm', 'default'],
          },
        },
        default: false,
        description: 'Whether to enable verbose logging for table extraction',
      },
    ],
  },
];

// --- Execution Logic ---
export async function execute(
  this: IExecuteFunctions,
  items: INodeExecutionData[],
  nodeOptions: Crawl4aiNodeOptions,
): Promise<INodeExecutionData[]> {
  const allResults: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    try {
      // Get parameters for the current item
      const browserOptions = this.getNodeParameter('browserOptions', i, {}) as IDataObject;
      const sessionOptions = this.getNodeParameter('sessionOptions', i, {}) as IDataObject;
      const crawlerOptions = this.getNodeParameter('crawlerOptions', i, {}) as IDataObject;
      const outputOptions = this.getNodeParameter('outputOptions', i, {}) as IDataObject;
      const contentFilter = this.getNodeParameter('contentFilter', i, {}) as IDataObject;
      const advancedOptions = this.getNodeParameter('advancedOptions', i, {}) as IDataObject;

      // Merge session options into browser options for unified config
      let mergedBrowserOptions = { ...browserOptions, ...sessionOptions };

      // Transform extraArgs from fixedCollection format to array
      if (browserOptions.extraArgs && typeof browserOptions.extraArgs === 'object') {
        const extraArgsCollection = browserOptions.extraArgs as any;
        if (extraArgsCollection.args && Array.isArray(extraArgsCollection.args)) {
          mergedBrowserOptions.extraArgs = extraArgsCollection.args.map((arg: any) => arg.value).filter((v: string) => v);
        }
      }

      const crawlMode = this.getNodeParameter('crawlMode', i, 'manual') as string;

      let urls: string[] = [];

      if (crawlMode === 'manual') {
        const urlsString = this.getNodeParameter('urls', i, '') as string;

        if (!urlsString) {
          throw new NodeOperationError(this.getNode(), 'URLs cannot be empty.', { itemIndex: i });
        }

        urls = urlsString
          .split(',')
          .map(url => url.trim())
          .filter(url => url);

        if (urls.length === 0) {
          throw new NodeOperationError(this.getNode(), 'No valid URLs provided.', { itemIndex: i });
        }

        const invalidUrls = urls.filter(url => !isValidUrl(url));
        if (invalidUrls.length > 0) {
          throw new NodeOperationError(
            this.getNode(),
            `Invalid URLs: ${invalidUrls.join(', ')}`,
            { itemIndex: i }
          );
        }
      }

      // Create browser and crawler configuration
      const browserConfig = createBrowserConfig(mergedBrowserOptions);
      const antiBotFeatures = (advancedOptions.antiBotFeatures as any)?.features || {};
      const mergedCrawlerOptions: IDataObject = {
        ...crawlerOptions,
        ...browserConfig,
        maxConcurrent: outputOptions.maxConcurrent ? Number(outputOptions.maxConcurrent) : 5,
        // Add output format options
        screenshot: outputOptions.screenshot,
        pdf: outputOptions.pdf,
        fetchSslCertificate: outputOptions.fetchSslCertificate,
        // Add anti-bot features
        magic: antiBotFeatures.magic,
        simulateUser: antiBotFeatures.simulateUser,
        overrideNavigator: antiBotFeatures.overrideNavigator,
        // Add link/media filtering
        excludeSocialMediaLinks: advancedOptions.excludeSocialMediaLinks,
        excludeExternalImages: advancedOptions.excludeExternalImages,
        // Add timing options
        delayBeforeReturnHtml: advancedOptions.delayBeforeReturnHtml,
        waitUntil: advancedOptions.waitUntil,
        verbose: advancedOptions.verbose,
      };

      // Add markdown generator with content filter if configured
      if (contentFilter.filterType && contentFilter.filterType !== 'none') {
        // Build LLM config if using LLM filter
        const enrichedFilterConfig = { ...contentFilter };

        if (contentFilter.filterType === 'llm') {
          // Get credentials to build LLM config
          const credentials = await this.getCredentials('crawl4aiPlusApi') as any;

          if (!credentials.enableLlm) {
            throw new NodeOperationError(
              this.getNode(),
              'LLM features must be enabled in Crawl4AI credentials to use LLM content filtering.',
              { itemIndex: i }
            );
          }

          // Build provider string and API key based on provider type
          let provider = 'openai/gpt-4o';
          let apiKey = '';

          if (credentials.llmProvider === 'openai') {
            const model = credentials.llmModel || 'gpt-4o';
            provider = `openai/${model}`;
            apiKey = credentials.apiKey || '';
          } else if (credentials.llmProvider === 'anthropic') {
            const model = credentials.llmModel || 'claude-3-haiku-20240307';
            provider = `anthropic/${model}`;
            apiKey = credentials.apiKey || '';
          } else if (credentials.llmProvider === 'groq') {
            const model = credentials.llmModel || 'llama3-70b-8192';
            provider = `groq/${model}`;
            apiKey = credentials.apiKey || '';
          } else if (credentials.llmProvider === 'ollama') {
            const model = credentials.ollamaModel || 'llama3';
            provider = `ollama/${model}`;
            // Ollama doesn't require API key but needs base URL
          } else if (credentials.llmProvider === 'other') {
            provider = credentials.customProvider || 'custom/model';
            apiKey = credentials.customApiKey || '';
          }

          if (!apiKey && credentials.llmProvider !== 'ollama') {
            throw new NodeOperationError(
              this.getNode(),
              `API key is required for ${credentials.llmProvider} provider. Please configure it in the Crawl4AI credentials.`,
              { itemIndex: i }
            );
          }

          enrichedFilterConfig.llmConfig = {
            type: 'LLMConfig',
            params: {
              provider,
              api_token: apiKey,
              ...(credentials.llmProvider === 'other' && credentials.customBaseUrl ?
                { api_base: credentials.customBaseUrl } : {}),
              ...(credentials.llmProvider === 'ollama' && credentials.ollamaUrl ?
                { api_base: credentials.ollamaUrl } : {})
            }
          };
        }

        mergedCrawlerOptions.markdownGenerator = createMarkdownGenerator(enrichedFilterConfig);
      }

      // Add table extraction strategy if configured
      const tableExtractionConfig = this.getNodeParameter('tableExtraction', i, {}) as IDataObject;
      if (tableExtractionConfig.strategyType && tableExtractionConfig.strategyType !== 'none') {
        // Build LLM config if using LLM strategy
        const enrichedTableConfig = { ...tableExtractionConfig };

        if (tableExtractionConfig.strategyType === 'llm') {
          // Get credentials to build LLM config
          const credentials = await this.getCredentials('crawl4aiPlusApi') as any;

          if (!credentials.enableLlm) {
            throw new NodeOperationError(
              this.getNode(),
              'LLM features must be enabled in Crawl4AI credentials to use LLM table extraction.',
              { itemIndex: i }
            );
          }

          // Build provider string and API key based on provider type
          let provider = 'openai/gpt-4o';
          let apiKey = '';

          if (credentials.llmProvider === 'openai') {
            const model = credentials.llmModel || 'gpt-4o';
            provider = `openai/${model}`;
            apiKey = credentials.apiKey || '';
          } else if (credentials.llmProvider === 'anthropic') {
            const model = credentials.llmModel || 'claude-3-haiku-20240307';
            provider = `anthropic/${model}`;
            apiKey = credentials.apiKey || '';
          } else if (credentials.llmProvider === 'groq') {
            const model = credentials.llmModel || 'llama3-70b-8192';
            provider = `groq/${model}`;
            apiKey = credentials.apiKey || '';
          } else if (credentials.llmProvider === 'ollama') {
            const model = credentials.ollamaModel || 'llama3';
            provider = `ollama/${model}`;
            // Ollama doesn't require API key but needs base URL
          } else if (credentials.llmProvider === 'other') {
            provider = credentials.customProvider || 'custom/model';
            apiKey = credentials.customApiKey || '';
          }

          if (!apiKey && credentials.llmProvider !== 'ollama') {
            throw new NodeOperationError(
              this.getNode(),
              `API key is required for ${credentials.llmProvider} provider. Please configure it in the Crawl4AI credentials.`,
              { itemIndex: i }
            );
          }

          enrichedTableConfig.llmConfig = {
            type: 'LLMConfig',
            params: {
              provider,
              api_token: apiKey,
              ...(credentials.llmProvider === 'other' && credentials.customBaseUrl ?
                { api_base: credentials.customBaseUrl } : {}),
              ...(credentials.llmProvider === 'ollama' && credentials.ollamaUrl ?
                { api_base: credentials.ollamaUrl } : {})
            }
          };
        }

        mergedCrawlerOptions.tableExtraction = createTableExtractionStrategy(enrichedTableConfig);
      }

      if (crawlMode === 'discover') {
        const discoveryOptions = this.getNodeParameter('discoveryOptions', i, {}) as IDataObject;

        const seedUrl = String(discoveryOptions.seedUrl ?? '').trim();
        const query = String(discoveryOptions.query ?? '').trim();

        if (!seedUrl) {
          throw new NodeOperationError(this.getNode(), 'Seed URL is required when discovery mode is enabled.', { itemIndex: i });
        }

        if (!isValidUrl(seedUrl)) {
          throw new NodeOperationError(this.getNode(), `Invalid Seed URL: ${seedUrl}`, { itemIndex: i });
        }

        if (!query) {
          throw new NodeOperationError(this.getNode(), 'Discovery query cannot be empty.', { itemIndex: i });
        }

        const maxDepthRaw = discoveryOptions.maxDepth ?? 2;
        const maxDepth = Math.min(Math.max(Number(maxDepthRaw), 1), 5);
        if (Number(maxDepthRaw) !== maxDepth) {
          throw new NodeOperationError(this.getNode(), 'Maximum Depth must be between 1 and 5.', { itemIndex: i });
        }

        const maxPagesRaw = discoveryOptions.maxPages ?? 50;
        const maxPages = Math.min(Math.max(Number(maxPagesRaw), 1), 200);
        if (Number(maxPagesRaw) !== maxPages) {
          throw new NodeOperationError(this.getNode(), 'Maximum Pages must be between 1 and 200.', { itemIndex: i });
        }

        const includeExternal = discoveryOptions.includeExternal === true;
        const respectRobotsTxt = discoveryOptions.respectRobotsTxt !== false;

        const includePatternsRaw = discoveryOptions.includePatterns as string | string[] | undefined;
        const includePatterns = Array.isArray(includePatternsRaw)
          ? includePatternsRaw
          : typeof includePatternsRaw === 'string'
            ? includePatternsRaw
                .split(',')
                .map(value => value.trim())
                .filter(value => value.length > 0)
            : [];

        const excludePatternsRaw = discoveryOptions.excludePatterns as string | string[] | undefined;
        const excludePatterns = Array.isArray(excludePatternsRaw)
          ? excludePatternsRaw
          : typeof excludePatternsRaw === 'string'
            ? excludePatternsRaw
                .split(',')
                .map(value => value.trim())
                .filter(value => value.length > 0)
            : [];

        const excludeDomainsRaw = discoveryOptions.excludeDomains as string | string[] | undefined;
        const excludeDomains = Array.isArray(excludeDomainsRaw)
          ? excludeDomainsRaw
          : typeof excludeDomainsRaw === 'string'
            ? excludeDomainsRaw
                .split(',')
                .map(value => value.trim())
                .filter(value => value.length > 0)
            : [];

        const resultLimitRaw = discoveryOptions.resultLimit ?? 0;
        const resultLimit = Math.max(Number(resultLimitRaw), 0);

        // Build filter chain for deep crawl
        const filters: IDataObject[] = [];

        // Add domain filter if exclude domains specified
        if (excludeDomains.length > 0) {
          filters.push({
            type: 'DomainFilter',
            params: {
              blocked_domains: excludeDomains,
            },
          });
        }

        // Add URL pattern filter for include/exclude patterns
        if (excludePatterns.length > 0) {
          filters.push({
            type: 'URLPatternFilter',
            params: {
              patterns: excludePatterns,
              reverse: true, // Block if match
            },
          });
        }

        if (includePatterns.length > 0) {
          filters.push({
            type: 'URLPatternFilter',
            params: {
              patterns: includePatterns,
              reverse: false, // Allow if match
            },
          });
        }

        // Build keyword scorer if query provided
        const urlScorer = query
          ? {
              type: 'KeywordRelevanceScorer',
              params: {
                keywords: query.split(/\s+OR\s+|\s+/).filter(k => k.trim()),
                weight: 1.0,
              },
            }
          : undefined;

        // Get user-selected strategy (default to BestFirst if not specified)
        const strategyType = String(discoveryOptions.crawlStrategy ?? 'BestFirstCrawlingStrategy');

        // Build strategy params
        const strategyParams: IDataObject = {
          max_depth: maxDepth,
          max_pages: maxPages,
          include_external: includeExternal,
          ...(filters.length > 0 ? {
            filter_chain: {
              type: 'FilterChain',
              params: {
                filters,
              },
            },
          } : {}),
          ...(urlScorer ? { url_scorer: urlScorer } : {}),
        };

        // Add score_threshold only for BFS/DFS strategies (not needed for BestFirst)
        if (strategyType !== 'BestFirstCrawlingStrategy') {
          const scoreThreshold = Number(discoveryOptions.scoreThreshold ?? 0);
          if (scoreThreshold > 0) {
            strategyParams.score_threshold = scoreThreshold;
          }
        }

        const deepCrawlStrategy: IDataObject = {
          type: strategyType,
          params: strategyParams,
        };

        mergedCrawlerOptions.deepCrawlStrategy = deepCrawlStrategy;

        // Move respect_robots_txt to crawler config level (not strategy level)
        if (respectRobotsTxt) {
          mergedCrawlerOptions.checkRobotsTxt = true;
        }

        urls = [seedUrl];

        // Tag options for downstream result handling
        mergedCrawlerOptions.__resultLimit = resultLimit;
      }

      const crawlerConfig = createCrawlerRunConfig(mergedCrawlerOptions);

      const crawler = await getCrawl4aiClient(this);

      // Get crawler client and run the crawl
      const results = await crawler.crawlMultipleUrls(urls, crawlerConfig);

      // Apply result limit if set in discovery mode
      const resultLimit = crawlMode === 'discover'
        ? Number(mergedCrawlerOptions.__resultLimit ?? 0)
        : 0;
      const limitedResults = resultLimit > 0 ? results.slice(0, resultLimit) : results;

      for (const result of limitedResults) {
        const formattedResult = formatCrawlResult(
          result,
          outputOptions.includeMedia as boolean,
          outputOptions.verboseResponse as boolean,
          {
            markdownOutput: outputOptions.markdownOutput as 'raw' | 'fit' | 'both',
            includeLinks: outputOptions.includeLinks as boolean,
            includeScreenshot: outputOptions.screenshot as boolean,
            includePdf: outputOptions.pdf as boolean,
            includeSslCertificate: outputOptions.fetchSslCertificate as boolean,
            includeTables: outputOptions.includeTables as boolean,
          }
        );

        allResults.push({
          json: formattedResult,
          pairedItem: { item: i },
        });
      }

    } catch (error) {
      // Handle continueOnFail or re-throw
      if (this.continueOnFail()) {
        const node = this.getNode();
        const errorItemIndex = (error as any).itemIndex ?? i;
        allResults.push({
          json: items[i].json,
          error: new NodeOperationError(node, (error as Error).message, { itemIndex: errorItemIndex }),
          pairedItem: { item: i },
        });
        continue;
      }
      // If not continueOnFail, re-throw the error
      throw error;
    }
  }

  return allResults;
}
