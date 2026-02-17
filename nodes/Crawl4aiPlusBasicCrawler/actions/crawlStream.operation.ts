import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions } from '../helpers/interfaces';
import {
  getCrawl4aiClient,
  createBrowserConfig,
  createCrawlerRunConfig,
  isValidUrl,
} from '../helpers/utils';
import { formatCrawlResult } from '../helpers/formatters';

// --- UI Definition ---
export const description: INodeProperties[] = [
  {
    displayName: 'URLs',
    name: 'streamUrls',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'https://example.com\nhttps://example.com/page2',
    description: 'One URL per line to crawl via the streaming endpoint. Each URL produces one output item.',
    typeOptions: {
      rows: 4,
    },
    displayOptions: {
      show: {
        operation: ['crawlStream'],
      },
    },
  },
  {
    displayName: 'Browser Options',
    name: 'streamBrowserOptions',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['crawlStream'],
      },
    },
    options: [
      {
        displayName: 'Browser Type',
        name: 'browserType',
        type: 'options',
        options: [
          { name: 'Chromium', value: 'chromium', description: 'Use Chromium browser (default)' },
          { name: 'Firefox', value: 'firefox', description: 'Use Firefox browser' },
          { name: 'Webkit', value: 'webkit', description: 'Use Webkit browser (Safari engine)' },
        ],
        default: 'chromium',
        description: 'Which browser engine to use',
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
        description: 'Whether to enable stealth mode to bypass basic bot detection',
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
    name: 'streamCrawlerOptions',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['crawlStream'],
      },
    },
    options: [
      {
        displayName: 'Cache Mode',
        name: 'cacheMode',
        type: 'options',
        options: [
          { name: 'Bypass (Skip Cache)', value: 'BYPASS', description: 'Skip cache, fetch fresh content' },
          { name: 'Disabled (No Cache)', value: 'DISABLED', description: 'No caching at all' },
          { name: 'Enabled (Read/Write)', value: 'ENABLED', description: 'Use cache if available' },
          { name: 'Read Only', value: 'READ_ONLY', description: 'Only read from cache' },
          { name: 'Write Only', value: 'WRITE_ONLY', description: 'Only write to cache' },
        ],
        default: 'ENABLED',
        description: 'How to use the cache when crawling',
      },
      {
        displayName: 'CSS Selector',
        name: 'cssSelector',
        type: 'string',
        default: '',
        placeholder: 'article.content',
        description: 'CSS selector to focus on specific content',
      },
      {
        displayName: 'Preserve HTTPS for Internal Links',
        name: 'preserveHttpsForInternalLinks',
        type: 'boolean',
        default: false,
        description: 'Whether to preserve HTTPS scheme for internal links (0.7.5)',
      },
      {
        displayName: 'Wait For',
        name: 'waitFor',
        type: 'string',
        default: '',
        placeholder: '.loading-complete',
        description: 'CSS selector or JS expression to wait for before extracting content',
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
    name: 'streamOutputOptions',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['crawlStream'],
      },
    },
    options: [
      {
        displayName: 'Include HTML',
        name: 'includeHtml',
        type: 'boolean',
        default: false,
        description: 'Whether to include raw HTML in content object',
      },
      {
        displayName: 'Include Links',
        name: 'includeLinks',
        type: 'boolean',
        default: true,
        description: 'Whether to include internal/external links in output',
      },
      {
        displayName: 'Include Media Data',
        name: 'includeMedia',
        type: 'boolean',
        default: false,
        description: 'Whether to include media data (images, videos) in output',
      },
    ],
  },
];

// --- Execution Logic ---
export async function execute(
  this: IExecuteFunctions,
  items: INodeExecutionData[],
  _nodeOptions: Crawl4aiNodeOptions,
): Promise<INodeExecutionData[]> {
  const allResults: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    try {
      const rawUrls = this.getNodeParameter('streamUrls', i, '') as string;
      const browserOptions = this.getNodeParameter('streamBrowserOptions', i, {}) as IDataObject;
      const crawlerOptions = this.getNodeParameter('streamCrawlerOptions', i, {}) as IDataObject;
      const outputOptions = this.getNodeParameter('streamOutputOptions', i, {}) as IDataObject;

      const urls = rawUrls.split('\n').map((u) => u.trim()).filter((u) => u.length > 0);
      if (urls.length === 0) {
        throw new NodeOperationError(this.getNode(), 'At least one URL is required.', { itemIndex: i });
      }

      for (const url of urls) {
        if (!isValidUrl(url)) {
          throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
        }
      }

      // Handle extraArgs and initScripts fixedCollection formats
      let mergedBrowserOptions = { ...browserOptions };
      if (browserOptions.initScripts && typeof browserOptions.initScripts === 'object') {
        mergedBrowserOptions.initScripts = browserOptions.initScripts;
      }

      const browserConfig = createBrowserConfig(mergedBrowserOptions);
      const crawlerConfig = createCrawlerRunConfig({
        ...crawlerOptions,
        ...browserConfig,
      });

      const crawler = await getCrawl4aiClient(this);
      const results = await crawler.crawlStream(urls, crawlerConfig);

      for (const result of results) {
        const fetchedAt = new Date().toISOString();
        const formatted = formatCrawlResult(result, {
          cacheMode: crawlerOptions.cacheMode as string | undefined,
          includeHtml: outputOptions.includeHtml as boolean,
          includeLinks: outputOptions.includeLinks !== false,
          includeMedia: outputOptions.includeMedia as boolean,
          fetchedAt,
        });
        allResults.push({ json: formatted, pairedItem: { item: i } });
      }
    } catch (error) {
      if (this.continueOnFail()) {
        allResults.push({
          json: items[i].json,
          error: new NodeOperationError(this.getNode(), (error as Error).message, {
            itemIndex: (error as any).itemIndex ?? i,
          }),
          pairedItem: { item: i },
        });
        continue;
      }
      throw error;
    }
  }

  return allResults;
}
