import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions, WebhookConfig } from '../helpers/interfaces';
import {
  getCrawl4aiClient,
  createBrowserConfig,
  createCrawlerRunConfig,
  isValidUrl,
} from '../helpers/utils';

// --- UI Definition ---
export const description: INodeProperties[] = [
  {
    displayName: 'URLs',
    name: 'jobUrls',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'https://example.com\nhttps://example.com/page2',
    description: 'One URL per line to crawl asynchronously. Returns a task_id to poll with Get Job Status.',
    typeOptions: {
      rows: 4,
    },
    displayOptions: {
      show: {
        operation: ['submitCrawlJob'],
      },
    },
  },
  {
    displayName: 'Browser Options',
    name: 'jobBrowserOptions',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['submitCrawlJob'],
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
    name: 'jobCrawlerOptions',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['submitCrawlJob'],
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
    ],
  },
  {
    displayName: 'Webhook Config',
    name: 'jobWebhookConfig',
    type: 'collection',
    placeholder: 'Add Webhook',
    default: {},
    displayOptions: {
      show: {
        operation: ['submitCrawlJob'],
      },
    },
    options: [
      {
        displayName: 'Webhook URL',
        name: 'webhookUrl',
        type: 'string',
        default: '',
        placeholder: 'https://your-n8n.com/webhook/...',
        description: 'URL to POST results to when the job completes',
      },
      {
        displayName: 'Include Data in Payload',
        name: 'webhookDataInPayload',
        type: 'boolean',
        default: true,
        description: 'Whether to include crawl result data directly in the webhook payload',
      },
      {
        displayName: 'Webhook Headers',
        name: 'webhookHeaders',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        default: {},
        description: 'Custom headers to send with the webhook request',
        options: [
          {
            name: 'header',
            displayName: 'Header',
            values: [
              {
                displayName: 'Key',
                name: 'key',
                type: 'string',
                default: '',
                description: 'Header key',
              },
              {
                displayName: 'Value',
                name: 'value',
                type: 'string',
                default: '',
                description: 'Header value',
              },
            ],
          },
        ],
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
      const rawUrls = this.getNodeParameter('jobUrls', i, '') as string;
      const browserOptions = this.getNodeParameter('jobBrowserOptions', i, {}) as IDataObject;
      const crawlerOptions = this.getNodeParameter('jobCrawlerOptions', i, {}) as IDataObject;
      const webhookConfigOptions = this.getNodeParameter('jobWebhookConfig', i, {}) as IDataObject;

      const urls = rawUrls.split('\n').map((u) => u.trim()).filter((u) => u.length > 0);
      if (urls.length === 0) {
        throw new NodeOperationError(this.getNode(), 'At least one URL is required.', { itemIndex: i });
      }

      for (const url of urls) {
        if (!isValidUrl(url)) {
          throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
        }
      }

      const browserConfig = createBrowserConfig({ ...browserOptions });
      const crawlerConfig = createCrawlerRunConfig({
        ...crawlerOptions,
        ...browserConfig,
      });

      const crawler = await getCrawl4aiClient(this);
      const browserCfg = crawler.formatBrowserConfig(crawlerConfig);
      const crawlerCfg = crawler.formatCrawlerConfig(crawlerConfig);

      // Build webhook config if URL is provided
      let webhookConfig: WebhookConfig | undefined;
      if (webhookConfigOptions.webhookUrl) {
        const headers: Record<string, string> = {};
        const webhookHeaders = webhookConfigOptions.webhookHeaders as any;
        if (webhookHeaders?.header && Array.isArray(webhookHeaders.header)) {
          for (const h of webhookHeaders.header) {
            if (h.key && h.value) headers[h.key] = h.value;
          }
        }
        webhookConfig = {
          webhook_url: String(webhookConfigOptions.webhookUrl),
          webhook_data_in_payload: webhookConfigOptions.webhookDataInPayload !== false,
          ...(Object.keys(headers).length > 0 ? { webhook_headers: headers } : {}),
        };
      }

      const taskId = await crawler.submitCrawlJob({
        urls,
        browser_config: Object.keys(browserCfg).length > 0 ? browserCfg : {},
        crawler_config: Object.keys(crawlerCfg).length > 0 ? crawlerCfg : {},
        ...(webhookConfig ? { webhook_config: webhookConfig } : {}),
      });

      allResults.push({
        json: {
          task_id: taskId,
          submittedAt: new Date().toISOString(),
          urlCount: urls.length,
          message: 'Crawl job submitted. Use Get Job Status with the task_id to poll for results.',
        },
        pairedItem: { item: i },
      });
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
