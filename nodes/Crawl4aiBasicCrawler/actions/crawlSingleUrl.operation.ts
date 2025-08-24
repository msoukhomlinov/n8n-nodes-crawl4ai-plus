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
        displayName: 'Enable JavaScript',
        name: 'javaScriptEnabled',
        type: 'boolean',
        default: true,
        description: 'Whether to enable JavaScript execution',
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
      {
        displayName: 'Enable Stealth Mode',
        name: 'enableStealth',
        type: 'boolean',
        default: false,
        description: 'Enable stealth mode to bypass basic bot detection (hides webdriver properties and modifies browser fingerprints)',
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
            name: 'Enabled (Read/Write)',
            value: 'enabled',
            description: 'Use cache if available, save new results to cache',
          },
          {
            name: 'Bypass (Force Fresh)',
            value: 'bypass',
            description: 'Ignore cache, always fetch fresh content',
          },
          {
            name: 'Only (Read Only)',
            value: 'only',
            description: 'Only use cache, do not make new requests',
          },
        ],
        default: 'enabled',
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
        operation: ['crawlSingleUrl'],
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
      const crawlerOptions = this.getNodeParameter('crawlerOptions', i, {}) as IDataObject;
      const options = this.getNodeParameter('options', i, {}) as IDataObject;

      if (!url) {
        throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
      }

      if (!isValidUrl(url)) {
        throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
      }

      // Create browser and crawler configuration
      const browserConfig = createBrowserConfig(browserOptions);
      const crawlerConfig = createCrawlerRunConfig({
        ...crawlerOptions,
        ...browserConfig, // Include browser options in crawler config
      });

      // Get crawler client
      const crawler = await getCrawl4aiClient(this);

      // Run the crawl
      const result = await crawler.crawlUrl(url, crawlerConfig);

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
