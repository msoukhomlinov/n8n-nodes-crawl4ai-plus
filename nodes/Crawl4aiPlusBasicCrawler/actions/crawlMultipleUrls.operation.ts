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
  isValidUrl
} from '../helpers/utils';
import { formatCrawlResult } from '../helpers/formatters';

// --- UI Definition ---
export const description: INodeProperties[] = [
  {
    displayName: 'URLs',
    name: 'urls',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'https://example.com, https://example.org',
    description: 'Comma-separated list of URLs to crawl',
    displayOptions: {
      show: {
        operation: ['crawlMultipleUrls'],
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
    displayName: 'Options',
    name: 'options',
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
        displayName: 'Include Media Data',
        name: 'includeMedia',
        type: 'boolean',
        default: false,
        description: 'Whether to include media data in output (images, videos)',
      },
      {
        displayName: 'Verbose Response',
        name: 'verboseResponse',
        type: 'boolean',
        default: false,
        description: 'Whether to include detailed data in output (HTML, status codes, etc.)',
      },
      {
        displayName: 'Max Concurrent Crawls',
        name: 'maxConcurrent',
        type: 'number',
        default: 5,
        description: 'Maximum number of concurrent crawls',
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
      const urlsString = this.getNodeParameter('urls', i, '') as string;
      const browserOptions = this.getNodeParameter('browserOptions', i, {}) as IDataObject;
      const crawlerOptions = this.getNodeParameter('crawlerOptions', i, {}) as IDataObject;
      const options = this.getNodeParameter('options', i, {}) as IDataObject;

      if (!urlsString) {
        throw new NodeOperationError(this.getNode(), 'URLs cannot be empty.', { itemIndex: i });
      }

      // Parse the URLs from the comma-separated string
      const urls = urlsString
        .split(',')
        .map(url => url.trim())
        .filter(url => url);

      if (urls.length === 0) {
        throw new NodeOperationError(this.getNode(), 'No valid URLs provided.', { itemIndex: i });
      }

      // Validate URLs
      const invalidUrls = urls.filter(url => !isValidUrl(url));
      if (invalidUrls.length > 0) {
        throw new NodeOperationError(
          this.getNode(),
          `Invalid URLs: ${invalidUrls.join(', ')}`,
          { itemIndex: i }
        );
      }

      // Create browser and crawler configuration
      const browserConfig = createBrowserConfig(browserOptions);
      const crawlerConfig = createCrawlerRunConfig({
        ...crawlerOptions,
        ...browserConfig, // Include browser options in crawler config
        maxConcurrent: options.maxConcurrent ? Number(options.maxConcurrent) : 5,
      });

      // Get crawler client
      const crawler = await getCrawl4aiClient(this);

      // Run the crawl for multiple URLs
      const results = await crawler.crawlMultipleUrls(urls, crawlerConfig);

      // Process and add each result
      for (const result of results) {
        // Format result
        const formattedResult = formatCrawlResult(
          result,
          options.includeMedia as boolean,
          options.verboseResponse as boolean
        );

        // Add the result to the output array
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
