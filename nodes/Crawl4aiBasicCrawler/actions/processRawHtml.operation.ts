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
  createCrawlerRunConfig
} from '../helpers/utils';
import { formatCrawlResult } from '../helpers/formatters';

// --- UI Definition ---
export const description: INodeProperties[] = [
  {
    displayName: 'HTML Content',
    name: 'html',
    type: 'string',
    typeOptions: {
      rows: 8,
    },
    required: true,
    default: '',
    placeholder: '<html><body><h1>Example</h1><p>Content</p></body></html>',
    description: 'The raw HTML content to process',
    displayOptions: {
      show: {
        operation: ['processRawHtml'],
      },
    },
  },
  {
    displayName: 'Base URL',
    name: 'baseUrl',
    type: 'string',
    default: 'https://example.com',
    description: 'The base URL to use for resolving relative links',
    displayOptions: {
      show: {
        operation: ['processRawHtml'],
      },
    },
  },
  {
    displayName: 'Crawler Options',
    name: 'crawlerOptions',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['processRawHtml'],
      },
    },
    options: [
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
        operation: ['processRawHtml'],
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
      const html = this.getNodeParameter('html', i, '') as string;
      const baseUrl = this.getNodeParameter('baseUrl', i, 'https://example.com') as string;
      const crawlerOptions = this.getNodeParameter('crawlerOptions', i, {}) as IDataObject;
      const options = this.getNodeParameter('options', i, {}) as IDataObject;

      if (!html) {
        throw new NodeOperationError(this.getNode(), 'HTML content cannot be empty.', { itemIndex: i });
      }

      // Create crawler configuration
      const crawlerConfig = createCrawlerRunConfig(crawlerOptions);

      // Get crawler client
      const crawler = await getCrawl4aiClient(this);

      // Process the HTML
      const result = await crawler.processRawHtml(html, baseUrl, crawlerConfig);

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
