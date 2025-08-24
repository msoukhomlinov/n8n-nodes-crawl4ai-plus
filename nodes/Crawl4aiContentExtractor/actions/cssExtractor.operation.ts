import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

// Import helpers and types
import type { Crawl4aiNodeOptions, CssSelectorSchema } from '../helpers/interfaces';
import {
  getCrawl4aiClient,
  createBrowserConfig,
  createCssSelectorExtractionStrategy,
  isValidUrl,
  cleanExtractedData
} from '../helpers/utils';
import {
  parseExtractedJson,
  formatExtractionResult
} from '../../Crawl4aiBasicCrawler/helpers/formatters';

// --- UI Definition ---
export const description: INodeProperties[] = [
  {
    displayName: 'URL',
    name: 'url',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'https://example.com',
    description: 'The URL to extract content from',
    displayOptions: {
      show: {
        operation: ['cssExtractor'],
      },
    },
  },
  {
    displayName: 'Base Selector',
    name: 'baseSelector',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'div.product-item',
    description: 'CSS selector for the repeating element (e.g., product items, article cards)',
    displayOptions: {
      show: {
        operation: ['cssExtractor'],
      },
    },
  },
  {
    displayName: 'Fields',
    name: 'fields',
    placeholder: 'Add Field',
    type: 'fixedCollection',
    typeOptions: {
      multipleValues: true,
    },
    default: {},
    displayOptions: {
      show: {
        operation: ['cssExtractor'],
      },
    },
    options: [
      {
        name: 'fieldsValues',
        displayName: 'Fields',
        values: [
          {
            displayName: 'Field Name',
            name: 'name',
            type: 'string',
            required: true,
            default: '',
            placeholder: 'title',
            description: 'Name of the field to extract',
          },
          {
            displayName: 'CSS Selector',
            name: 'selector',
            type: 'string',
            required: true,
            default: '',
            placeholder: 'h3.title',
            description: 'CSS selector relative to the base selector',
          },
          {
            displayName: 'Field Type',
            name: 'fieldType',
            type: 'options',
            options: [
              {
                name: 'Text',
                value: 'text',
                description: 'Extract text content',
              },
              {
                name: 'HTML',
                value: 'html',
                description: 'Extract HTML content',
              },
              {
                name: 'Attribute',
                value: 'attribute',
                description: 'Extract an attribute value',
              },
            ],
            default: 'text',
            description: 'Type of data to extract',
          },
          {
            displayName: 'Attribute Name',
            name: 'attribute',
            type: 'string',
            displayOptions: {
              show: {
                fieldType: ['attribute'],
              },
            },
            default: 'href',
            placeholder: 'href',
            description: 'Name of the attribute to extract',
          },
        ],
      },
    ],
  },
  {
    displayName: 'Browser Options',
    name: 'browserOptions',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['cssExtractor'],
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
        displayName: 'JavaScript Code',
        name: 'jsCode',
        type: 'string',
        typeOptions: {
          rows: 4,
        },
        default: '',
        placeholder: 'document.querySelector("button.load-more").click();',
        description: 'JavaScript code to execute before extraction (e.g., to click buttons, scroll)',
      },
      {
        displayName: 'Timeout (Ms)',
        name: 'timeout',
        type: 'number',
        default: 30000,
        description: 'Maximum time to wait for the browser to load the page',
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
    displayName: 'Options',
    name: 'options',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: {
      show: {
        operation: ['cssExtractor'],
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
        displayName: 'Include Original Text',
        name: 'includeFullText',
        type: 'boolean',
        default: false,
        description: 'Whether to include the original webpage text in output',
      },
      {
        displayName: 'Clean Text',
        name: 'cleanText',
        type: 'boolean',
        default: true,
        description: 'Whether to clean and normalize extracted text (remove extra spaces, newlines)',
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
      const baseSelector = this.getNodeParameter('baseSelector', i, '') as string;
      const fieldsValues = this.getNodeParameter('fields.fieldsValues', i, []) as IDataObject[];
      const browserOptions = this.getNodeParameter('browserOptions', i, {}) as IDataObject;
      const options = this.getNodeParameter('options', i, {}) as IDataObject;

      if (!url) {
        throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
      }

      if (!isValidUrl(url)) {
        throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
      }

      if (!baseSelector) {
        throw new NodeOperationError(this.getNode(), 'Base selector cannot be empty.', { itemIndex: i });
      }

      if (!fieldsValues || fieldsValues.length === 0) {
        throw new NodeOperationError(this.getNode(), 'At least one field must be defined.', { itemIndex: i });
      }

      // Prepare schema for CSS selector extraction
      const schema: CssSelectorSchema = {
        name: 'extracted_items',
        baseSelector,
        fields: fieldsValues.map(field => ({
          name: field.name as string,
          selector: field.selector as string,
          type: field.fieldType as 'text' | 'attribute' | 'html',
          attribute: field.attribute as string,
        })),
      };

      // Create browser config
      const browserConfig = createBrowserConfig(browserOptions);

      // Create extraction strategy
      const extractionStrategy = createCssSelectorExtractionStrategy(schema);

      // Get crawler client
      const crawler = await getCrawl4aiClient(this);

      // Run the extraction
      const result = await crawler.arun(url, {
        browserConfig,
        extractionStrategy,
        cacheMode: options.cacheMode || 'enabled',
        jsCode: browserOptions.jsCode,
      });

      // Parse extracted JSON
      const extractedData = parseExtractedJson(result);

      // Format extraction result
      const formattedResult = formatExtractionResult(
        result,
        extractedData,
        options.includeFullText as boolean
      );

      // Apply text cleaning if needed
      if (options.cleanText === true && extractedData) {
        formattedResult.data = cleanExtractedData(extractedData);
      }

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
