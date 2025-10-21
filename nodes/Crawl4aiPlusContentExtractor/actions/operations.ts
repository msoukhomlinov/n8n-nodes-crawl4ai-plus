import type { INodeProperties, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { Crawl4aiNodeOptions } from '../helpers/interfaces';

// Import definitions for each operation
import * as cosineExtractor from './cosineExtractor.operation';
import * as cssExtractor from './cssExtractor.operation';
import * as jsonExtractor from './jsonExtractor.operation';
import * as llmExtractor from './llmExtractor.operation';
import * as regexExtractor from './regexExtractor.operation';

// Type definition for the execute function of an operation
type OperationExecuteFunction = (
  this: IExecuteFunctions,
  items: INodeExecutionData[],
  nodeOptions: Crawl4aiNodeOptions,
) => Promise<INodeExecutionData[]>;

// Export an object containing the execute function for each operation
// This allows the router to dynamically call the correct execute function
export const operations: { [key: string]: OperationExecuteFunction } = {
  cosineExtractor: cosineExtractor.execute,
  cssExtractor: cssExtractor.execute,
  jsonExtractor: jsonExtractor.execute,
  llmExtractor: llmExtractor.execute,
  regexExtractor: regexExtractor.execute,
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
        name: 'Cosine Similarity Extractor',
        value: 'cosineExtractor',
        description: 'Extract content using semantic similarity clustering (requires transformers)',
        action: 'Extract with semantic clustering',
      },
      {
        name: 'CSS Selector Extractor',
        value: 'cssExtractor',
        description: 'Extract structured content using CSS selectors',
        action: 'Extract with CSS selectors',
      },
      {
        name: 'JSON Extractor',
        value: 'jsonExtractor',
        description: 'Extract JSON data from a webpage',
        action: 'Extract JSON data',
      },
      {
        name: 'LLM Extractor',
        value: 'llmExtractor',
        description: 'Extract structured content using LLM models',
        action: 'Extract with LLM',
      },
      {
        name: 'Regex Extractor',
        value: 'regexExtractor',
        description: 'Extract data using regex patterns (NEW in 0.7.x)',
        action: 'Extract with regex',
      },
    ],
    default: 'cssExtractor',
  },

  // Spread descriptions from each operation file
  ...cosineExtractor.description,
  ...cssExtractor.description,
  ...jsonExtractor.description,
  ...llmExtractor.description,
  ...regexExtractor.description,
];
