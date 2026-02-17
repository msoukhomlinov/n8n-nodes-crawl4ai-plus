import type { INodeProperties, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { Crawl4aiNodeOptions } from '../helpers/interfaces';

// Import definitions for each operation
import * as crawlMultipleUrls from './crawlMultipleUrls.operation';
import * as crawlSingleUrl from './crawlSingleUrl.operation';
import * as crawlStream from './crawlStream.operation';
import * as discoverLinks from './discoverLinks.operation';
import * as getJobStatus from './getJobStatus.operation';
import * as healthCheck from './healthCheck.operation';
import * as processRawHtml from './processRawHtml.operation';
import * as submitCrawlJob from './submitCrawlJob.operation';

// Type definition for the execute function of an operation
type OperationExecuteFunction = (
  this: IExecuteFunctions,
  items: INodeExecutionData[],
  nodeOptions: Crawl4aiNodeOptions,
) => Promise<INodeExecutionData[]>;

// Export an object containing the execute function for each operation
export const operations: { [key: string]: OperationExecuteFunction } = {
  crawlMultipleUrls: crawlMultipleUrls.execute,
  crawlSingleUrl: crawlSingleUrl.execute,
  crawlStream: crawlStream.execute,
  discoverLinks: discoverLinks.execute,
  getJobStatus: getJobStatus.execute,
  healthCheck: healthCheck.execute,
  processRawHtml: processRawHtml.execute,
  submitCrawlJob: submitCrawlJob.execute,
};

// Aggregate UI property descriptions from all operations
export const description: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    options: [
      {
        name: 'Crawl Multiple URLs',
        value: 'crawlMultipleUrls',
        description: 'Crawl multiple URLs and extract content',
        // eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased
        action: 'Crawl multiple URLs',
      },
      {
        name: 'Crawl Single URL',
        value: 'crawlSingleUrl',
        description: 'Crawl a single URL and extract content',
        action: 'Crawl a single URL',
      },
      {
        name: 'Crawl Stream',
        value: 'crawlStream',
        description: 'Crawl URLs via the streaming endpoint — one output item per page result',
        // eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased
        action: 'Crawl URLs via streaming',
      },
      {
        name: 'Discover Links',
        value: 'discoverLinks',
        description: 'Extract and filter all links from a page',
        action: 'Discover links from URL',
      },
      {
        name: 'Get Job Status',
        value: 'getJobStatus',
        description: 'Poll the status of an async crawl job by task_id',
        action: 'Get async job status',
      },
      {
        name: 'Health Check',
        value: 'healthCheck',
        description: 'Check server health, memory usage, and endpoint statistics',
        action: 'Check server health',
      },
      {
        name: 'Process Raw HTML',
        value: 'processRawHtml',
        description: 'Process provided HTML content without crawling',
        action: 'Process raw HTML',
      },
      {
        name: 'Submit Crawl Job',
        value: 'submitCrawlJob',
        description: 'Submit an async crawl job and receive a task_id (for large/long-running crawls)',
        action: 'Submit async crawl job',
      },
    ],
    default: 'crawlSingleUrl',
  },

  // Spread descriptions from each operation file
  ...crawlMultipleUrls.description,
  ...crawlSingleUrl.description,
  ...crawlStream.description,
  ...discoverLinks.description,
  ...getJobStatus.description,
  ...healthCheck.description,
  ...processRawHtml.description,
  ...submitCrawlJob.description,
];
