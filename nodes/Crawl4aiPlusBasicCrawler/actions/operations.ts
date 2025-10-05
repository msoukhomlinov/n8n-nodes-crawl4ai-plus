import type { INodeProperties, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { Crawl4aiNodeOptions } from '../helpers/interfaces';

// Import definitions for each operation
import * as crawlSingleUrl from './crawlSingleUrl.operation';
import * as crawlMultipleUrls from './crawlMultipleUrls.operation';
import * as processRawHtml from './processRawHtml.operation';

// Type definition for the execute function of an operation
type OperationExecuteFunction = (
  this: IExecuteFunctions,
  items: INodeExecutionData[],
  nodeOptions: Crawl4aiNodeOptions,
) => Promise<INodeExecutionData[]>;

// Export an object containing the execute function for each operation
// This allows the router to dynamically call the correct execute function
export const operations: { [key: string]: OperationExecuteFunction } = {
  crawlSingleUrl: crawlSingleUrl.execute,
  crawlMultipleUrls: crawlMultipleUrls.execute,
  processRawHtml: processRawHtml.execute,
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
        name: 'Crawl Single URL',
        value: 'crawlSingleUrl',
        description: 'Crawl a single URL and extract content',
        action: 'Crawl a single URL',
      },
      {
        name: 'Crawl Multiple URLs',
        value: 'crawlMultipleUrls',
        description: 'Crawl multiple URLs and extract content',
        action: 'Crawl multiple ur ls',
      },
      {
        name: 'Process Raw HTML',
        value: 'processRawHtml',
        description: 'Process provided HTML content without crawling',
        action: 'Process raw html',
      },
    ],
    default: 'crawlSingleUrl',
  },

  // Spread descriptions from each operation file
  ...crawlSingleUrl.description,
  ...crawlMultipleUrls.description,
  ...processRawHtml.description,
];
