import type { INodeProperties, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { Crawl4aiNodeOptions } from '../helpers/interfaces';

// Import definitions for each operation
import * as cssExtractor from './cssExtractor.operation';
import * as llmExtractor from './llmExtractor.operation';
import * as jsonExtractor from './jsonExtractor.operation';

// Type definition for the execute function of an operation
type OperationExecuteFunction = (
  this: IExecuteFunctions,
  items: INodeExecutionData[],
  nodeOptions: Crawl4aiNodeOptions,
) => Promise<INodeExecutionData[]>;

// Export an object containing the execute function for each operation
// This allows the router to dynamically call the correct execute function
export const operations: { [key: string]: OperationExecuteFunction } = {
  cssExtractor: cssExtractor.execute,
  llmExtractor: llmExtractor.execute,
  jsonExtractor: jsonExtractor.execute,
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
        name: 'CSS Selector Extractor',
        value: 'cssExtractor',
        description: 'Extract structured content using CSS selectors',
        action: 'Extract with CSS selectors',
      },
      {
        name: 'LLM Extractor',
        value: 'llmExtractor',
        description: 'Extract structured content using LLM models',
        action: 'Extract with LLM',
      },
      {
        name: 'JSON Extractor',
        value: 'jsonExtractor',
        description: 'Extract JSON data from a webpage',
        action: 'Extract JSON data',
      },
    ],
    default: 'cssExtractor',
  },

  // Spread descriptions from each operation file
  ...cssExtractor.description,
  ...llmExtractor.description,
  ...jsonExtractor.description,
];
