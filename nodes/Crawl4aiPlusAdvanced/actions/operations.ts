import type { INodeProperties, INodePropertyOptions, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { Crawl4aiNodeOptions } from '../helpers/interfaces';

// Import definitions for each operation — Crawling group
import * as crawlUrl from './crawlUrl.operation';
import * as crawlMultipleUrls from './crawlMultipleUrls.operation';
import * as crawlStream from './crawlStream.operation';
import * as processRawHtml from './processRawHtml.operation';
import * as discoverLinks from './discoverLinks.operation';

// Import definitions for each operation — Extraction group
import * as llmExtractor from './llmExtractor.operation';
import * as cssExtractor from './cssExtractor.operation';
import * as jsonExtractor from './jsonExtractor.operation';
import * as regexExtractor from './regexExtractor.operation';
import * as cosineExtractor from './cosineExtractor.operation';
import * as seoExtractor from './seoExtractor.operation';

// Import definitions for each operation — Jobs & Monitoring group
import * as submitCrawlJob from './submitCrawlJob.operation';
import * as submitLlmJob from './submitLlmJob.operation';
import * as getJobStatus from './getJobStatus.operation';
import * as healthCheck from './healthCheck.operation';

// Type definition for the execute function of an operation
type OperationExecuteFunction = (
  this: IExecuteFunctions,
  items: INodeExecutionData[],
  nodeOptions: Crawl4aiNodeOptions,
) => Promise<INodeExecutionData[]>;

// Export an object containing the execute function for each operation
export const operations: { [key: string]: OperationExecuteFunction } = {
  // Crawling
  crawlUrl: crawlUrl.execute,
  crawlMultipleUrls: crawlMultipleUrls.execute,
  crawlStream: crawlStream.execute,
  processRawHtml: processRawHtml.execute,
  discoverLinks: discoverLinks.execute,
  // Extraction
  llmExtractor: llmExtractor.execute,
  cssExtractor: cssExtractor.execute,
  jsonExtractor: jsonExtractor.execute,
  regexExtractor: regexExtractor.execute,
  cosineExtractor: cosineExtractor.execute,
  seoExtractor: seoExtractor.execute,
  // Jobs & Monitoring
  submitCrawlJob: submitCrawlJob.execute,
  submitLlmJob: submitLlmJob.execute,
  getJobStatus: getJobStatus.execute,
  healthCheck: healthCheck.execute,
};

// Aggregate UI property descriptions from all operations
export const description: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    options: [
      // --- Crawling group ---
      {
        name: 'Crawl URL',
        value: 'crawlUrl',
        description: 'Crawl a single URL with full configuration control',
        action: 'Crawl a URL',
        groupName: 'Crawling',
      },
      {
        name: 'Crawl Multiple URLs',
        value: 'crawlMultipleUrls',
        description: 'Crawl multiple URLs with deep/recursive crawl support',
        action: 'Crawl multiple URLs',
        groupName: 'Crawling',
      },
      {
        name: 'Stream Crawl',
        value: 'crawlStream',
        description: 'Crawl URLs via the streaming endpoint — one output item per page result',
        action: 'Crawl URLs via streaming',
        groupName: 'Crawling',
      },
      {
        name: 'Process Raw HTML',
        value: 'processRawHtml',
        description: 'Process provided HTML content without crawling',
        action: 'Process raw HTML',
        groupName: 'Crawling',
      },
      {
        name: 'Discover Links',
        value: 'discoverLinks',
        description: 'Extract and filter all links from a page',
        action: 'Discover links from URL',
        groupName: 'Crawling',
      },

      // --- Extraction group ---
      {
        name: 'LLM Extractor',
        value: 'llmExtractor',
        description: 'Extract structured content using LLM models',
        action: 'Extract with LLM',
        groupName: 'Extraction',
      },
      {
        name: 'CSS Extractor',
        value: 'cssExtractor',
        description: 'Extract structured content using CSS selectors',
        action: 'Extract with CSS selectors',
        groupName: 'Extraction',
      },
      {
        name: 'JSON Extractor',
        value: 'jsonExtractor',
        description: 'Extract JSON data from a webpage',
        action: 'Extract with JSON path',
        groupName: 'Extraction',
      },
      {
        name: 'Regex Extractor',
        value: 'regexExtractor',
        description: 'Extract data using regex patterns',
        action: 'Extract with regex',
        groupName: 'Extraction',
      },
      {
        name: 'Cosine Similarity Extractor',
        value: 'cosineExtractor',
        description: 'Extract content using semantic similarity clustering (requires crawl4ai:all image)',
        action: 'Extract with semantic clustering',
        groupName: 'Extraction',
      },
      {
        name: 'SEO Metadata Extractor',
        value: 'seoExtractor',
        description: 'Extract SEO metadata (title, meta tags, OG tags, JSON-LD)',
        action: 'Extract SEO metadata',
        groupName: 'Extraction',
      },

      // --- Jobs & Monitoring group ---
      {
        name: 'Submit Crawl Job',
        value: 'submitCrawlJob',
        description: 'Submit an async crawl job and receive a task_id',
        action: 'Submit async crawl job',
        groupName: 'Jobs & Monitoring',
      },
      {
        name: 'Submit LLM Job',
        value: 'submitLlmJob',
        description: 'Submit an async LLM extraction job and receive a task_id',
        action: 'Submit async LLM job',
        groupName: 'Jobs & Monitoring',
      },
      {
        name: 'Get Job Status',
        value: 'getJobStatus',
        description: 'Poll the status of an async job by task_id',
        action: 'Get async job status',
        groupName: 'Jobs & Monitoring',
      },
      {
        name: 'Health Check',
        value: 'healthCheck',
        description: 'Check server health, memory usage, and endpoint statistics',
        action: 'Check server health',
        groupName: 'Jobs & Monitoring',
      },
    ] as unknown as INodePropertyOptions[],
    default: 'crawlUrl',
  },

  // Spread descriptions from each operation file
  // Crawling
  ...crawlUrl.description,
  ...crawlMultipleUrls.description,
  ...crawlStream.description,
  ...processRawHtml.description,
  ...discoverLinks.description,
  // Extraction
  ...llmExtractor.description,
  ...cssExtractor.description,
  ...jsonExtractor.description,
  ...regexExtractor.description,
  ...cosineExtractor.description,
  ...seoExtractor.description,
  // Jobs & Monitoring
  ...submitCrawlJob.description,
  ...submitLlmJob.description,
  ...getJobStatus.description,
  ...healthCheck.description,
];
