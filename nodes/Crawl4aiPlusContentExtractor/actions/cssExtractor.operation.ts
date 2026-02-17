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
  createCrawlerRunConfig,
  createCssSelectorExtractionStrategy,
  isValidUrl,
  cleanExtractedData
} from '../helpers/utils';
import {
  parseExtractedJson,
  formatExtractionResult
} from '../../Crawl4aiPlusBasicCrawler/helpers/formatters';

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
    required: true,
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
				displayName: 'Browser Type',
				name: 'browserType',
				type: 'options',
				options: [
					{
						name: 'Chromium',
						value: 'chromium',
						description: 'Use Chromium browser (default, most compatible)',
					},
					{
						name: 'Firefox',
						value: 'firefox',
						description: 'Use Firefox browser',
					},
					{
						name: 'Webkit',
						value: 'webkit',
						description: 'Use Webkit browser (Safari engine)',
					},
				],
				default: 'chromium',
				description: 'Which browser engine to use for crawling. Default: Chromium (if not specified).',
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
        description: 'Whether to enable stealth mode to bypass basic bot detection (hides webdriver properties and modifies browser fingerprints)',
      },
      {
        displayName: 'Extra Browser Arguments',
        name: 'extraArgs',
        type: 'fixedCollection',
        typeOptions: {
          multipleValues: true,
        },
        default: {},
        description: 'Additional command-line arguments to pass to the browser (advanced users only)',
        options: [
          {
            name: 'args',
            displayName: 'Arguments',
            values: [
              {
                displayName: 'Argument',
                name: 'value',
                type: 'string',
                default: '',
                placeholder: '--disable-blink-features=AutomationControlled',
                description: 'Browser command-line argument (e.g., --disable-blink-features=AutomationControlled)',
              },
            ],
          },
        ],
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
        description: 'JavaScript snippets injected before page load for stealth or setup',
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
    displayName: 'Session & Authentication',
    name: 'sessionOptions',
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
        displayName: 'Cookies',
        name: 'cookies',
        type: 'json',
        default: '',
        placeholder: '[{"name": "session_id", "value": "abc123", "domain": ".example.com", "path": "/"}]',
        description: 'Array of cookie objects to inject. Alternative to storage state for simple cookie-based auth.',
      },
      {
        displayName: 'Storage State (JSON)',
        name: 'storageState',
        type: 'string',
        typeOptions: {
          rows: 6,
        },
        default: '',
        placeholder: '{"cookies": [...], "origins": [...]}',
        description: 'Browser storage state as JSON (cookies, localStorage, sessionStorage). Captures authenticated session state. Works in all n8n environments.',
      },
      {
        displayName: 'Use Managed Browser',
        name: 'useManagedBrowser',
        type: 'boolean',
        default: false,
        description: 'Whether to use managed browser mode (required for persistent contexts). Advanced option.',
        displayOptions: {
          show: {
            usePersistentContext: [true],
          },
        },
      },
      {
        displayName: 'Use Persistent Browser Context',
        name: 'usePersistentContext',
        type: 'boolean',
        default: false,
        description: 'Whether to use a persistent browser context (requires user data directory). Only use in self-hosted environments with persistent storage.',
      },
      {
        displayName: 'User Data Directory',
        name: 'userDataDir',
        type: 'string',
        default: '',
        placeholder: '/data/browser-profiles/profile1',
        description: 'Path to browser profile directory for persistent sessions. Advanced: Only works in self-hosted n8n with persistent volumes. Use Storage State for cloud deployments.',
        displayOptions: {
          show: {
            usePersistentContext: [true],
          },
        },
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
            name: 'Bypass (Skip Cache)',
            value: 'BYPASS',
            description: 'Skip cache for this operation, fetch fresh content',
          },
          {
            name: 'Disabled (No Cache)',
            value: 'DISABLED',
            description: 'No caching at all',
          },
          {
            name: 'Enabled (Read/Write)',
            value: 'ENABLED',
            description: 'Use cache if available, save new results to cache',
          },
          {
            name: 'Read Only',
            value: 'READ_ONLY',
            description: 'Only read from cache, do not write new results',
          },
          {
            name: 'Write Only',
            value: 'WRITE_ONLY',
            description: 'Only write to cache, do not read existing cache',
          },
        ],
        default: 'ENABLED',
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
      const sessionOptions = this.getNodeParameter('sessionOptions', i, {}) as IDataObject;
      const options = this.getNodeParameter('options', i, {}) as IDataObject;

      // Merge session options into browser options for unified config
      let mergedBrowserOptions = { ...browserOptions, ...sessionOptions };

      // Transform extraArgs from fixedCollection format to array
      if (browserOptions.extraArgs && typeof browserOptions.extraArgs === 'object') {
        const extraArgsCollection = browserOptions.extraArgs as any;
        if (extraArgsCollection.args && Array.isArray(extraArgsCollection.args)) {
          mergedBrowserOptions.extraArgs = extraArgsCollection.args.map((arg: any) => arg.value).filter((v: string) => v);
        }
      }

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

      // Create extraction strategy
      const extractionStrategy = createCssSelectorExtractionStrategy(schema);

      // Build crawler config using standardized helper
      const crawlerOptions: any = {
        ...mergedBrowserOptions, // Include browser options
        cacheMode: options.cacheMode || 'ENABLED',
        jsCode: browserOptions.jsCode,
      };

      const crawlerConfig = createCrawlerRunConfig(crawlerOptions);
      // Set extraction strategy
      crawlerConfig.extractionStrategy = extractionStrategy;

      // Get crawler client
      const crawler = await getCrawl4aiClient(this);

      // Run the extraction using standardized arun() method
      const fetchedAt = new Date().toISOString();
      const result = await crawler.arun(url, crawlerConfig);

      // Parse extracted JSON
      const extractedData = parseExtractedJson(result);

      // Format extraction result
      const formattedResult = formatExtractionResult(result, extractedData, {
        fetchedAt,
        extractionStrategy: 'JsonCssExtractionStrategy',
        includeFullText: options.includeFullText as boolean,
        includeLinks: true,
      });

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
