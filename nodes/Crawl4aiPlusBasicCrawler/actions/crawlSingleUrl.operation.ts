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
  buildLlmConfig,
  createCrawlerRunConfig,
  createMarkdownGenerator,
  createTableExtractionStrategy,
  isValidUrl
} from '../helpers/utils';
import { formatCrawlResult } from '../helpers/formatters';

// --- UI Definition ---
export const description: INodeProperties[] = [
  {
    displayName: 'URL',
    name: 'url',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'https://example.com',
    description: 'The URL to crawl',
    displayOptions: {
      show: {
        operation: ['crawlSingleUrl'],
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
        operation: ['crawlSingleUrl'],
      },
    },
    options: [
      {
        displayName: 'Browser Type',
        name: 'browserType',
        type: 'options',
        options: [
          {
            name: 'Chromium',
            value: 'chromium',
            description: 'Use Chromium browser (default, most compatible)',
          },
          {
            name: 'Firefox',
            value: 'firefox',
            description: 'Use Firefox browser',
          },
          {
            name: 'Webkit',
            value: 'webkit',
            description: 'Use Webkit browser (Safari engine)',
          },
        ],
        default: 'chromium',
        description: 'Which browser engine to use for crawling. Default: Chromium (if not specified).',
      },
      {
        displayName: 'Enable JavaScript',
        name: 'javaScriptEnabled',
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
        displayName: 'Init Scripts',
        name: 'initScripts',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        default: {},
        description: 'JavaScript snippets injected before page load for stealth or setup (0.8.0)',
        options: [
          {
            name: 'scripts',
            displayName: 'Scripts',
            values: [
              {
                displayName: 'Script',
                name: 'value',
                type: 'string',
                typeOptions: { rows: 3 },
                default: '',
                placeholder: 'Object.defineProperty(navigator, "webdriver", {get: () => undefined});',
                description: 'JavaScript to inject before page load',
              },
            ],
          },
        ],
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
        operation: ['crawlSingleUrl'],
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
        operation: ['crawlSingleUrl'],
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
        displayName: 'JavaScript Code',
        name: 'jsCode',
        type: 'string',
        typeOptions: {
          rows: 4,
        },
        default: '',
        placeholder: 'document.querySelector("button.load-more").click();',
        description: 'JavaScript code to execute on the page after load',
      },
      {
        displayName: 'JavaScript Only Mode',
        name: 'jsOnly',
        type: 'boolean',
        default: false,
        description: 'Whether to only execute JavaScript without crawling',
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
        displayName: 'Preserve HTTPS for Internal Links',
        name: 'preserveHttpsForInternalLinks',
        type: 'boolean',
        default: false,
        description: 'Whether to preserve HTTPS scheme for internal links (0.7.5)',
      },
      {
        displayName: 'Request Timeout (Ms)',
        name: 'requestTimeout',
        type: 'number',
        default: 30000,
        description: 'Maximum time to wait for network requests',
      },
      {
        displayName: 'Session ID',
        name: 'sessionId',
        type: 'string',
        default: '',
        placeholder: 'my-session-ID',
        description: 'ID to maintain browser state across multiple crawls (for multi-step crawling)',
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
        operation: ['crawlSingleUrl'],
      },
    },
    options: [
      {
        displayName: 'Capture Screenshot',
        name: 'screenshot',
        type: 'boolean',
        default: false,
        description: 'Whether to capture a screenshot of the page (returned as base64)',
      },
      {
        displayName: 'Fetch SSL Certificate',
        name: 'fetchSslCertificate',
        type: 'boolean',
        default: false,
        description: 'Whether to retrieve SSL certificate information from the server',
      },
      {
        displayName: 'Generate PDF',
        name: 'pdf',
        type: 'boolean',
        default: false,
        description: 'Whether to generate a PDF of the page (returned as base64 or binary)',
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
        operation: ['crawlSingleUrl'],
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
        operation: ['crawlSingleUrl'],
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
        operation: ['crawlSingleUrl'],
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
      const url = this.getNodeParameter('url', i, '') as string;
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

      // initScripts stays as fixedCollection object — createBrowserConfig handles the format

      if (!url) {
        throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
      }

      if (!isValidUrl(url)) {
        throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
      }

      // Create browser and crawler configuration
      const browserConfig = createBrowserConfig(mergedBrowserOptions);

      // Build crawler config with all options
      const antiBotFeatures = (advancedOptions.antiBotFeatures as any)?.features || {};
      const crawlerConfig = createCrawlerRunConfig({
        ...crawlerOptions,
        ...browserConfig, // Include browser options in crawler config
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
      });

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

          // Build LLM config from credentials
          const { llmConfig: filterLlmConfig } = buildLlmConfig(credentials);
          enrichedFilterConfig.llmConfig = filterLlmConfig;
        }

        crawlerConfig.markdownGenerator = createMarkdownGenerator(enrichedFilterConfig);
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

          // Build LLM config from credentials
          const { llmConfig: tableLlmConfig } = buildLlmConfig(credentials);
          enrichedTableConfig.llmConfig = tableLlmConfig;
        }

        crawlerConfig.tableExtraction = createTableExtractionStrategy(enrichedTableConfig);
      }

      // Get crawler client
      const crawler = await getCrawl4aiClient(this);

      // Run the crawl
      const fetchedAt = new Date().toISOString();
      const result = await crawler.crawlUrl(url, crawlerConfig);

      // Format result with new structured output shape
      const formattedResult = formatCrawlResult(result, {
        cacheMode: crawlerOptions.cacheMode as string | undefined,
        includeHtml: outputOptions.verboseResponse as boolean,
        includeLinks: outputOptions.includeLinks !== false,
        includeMedia: outputOptions.includeMedia as boolean,
        includeScreenshot: outputOptions.screenshot as boolean,
        includePdf: outputOptions.pdf as boolean,
        includeSslCertificate: outputOptions.fetchSslCertificate as boolean,
        includeTables: outputOptions.includeTables as boolean,
        fetchedAt,
      });

      // Add the result to the output array
      allResults.push({
        json: formattedResult,
        pairedItem: { item: i },
      });

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
