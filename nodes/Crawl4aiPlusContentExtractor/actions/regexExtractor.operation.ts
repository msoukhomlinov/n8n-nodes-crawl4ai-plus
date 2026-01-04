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
	createBrowserConfig,
	createCrawlerRunConfig,
	isValidUrl
} from '../helpers/utils';
import { parseExtractedJson, formatExtractionResult } from '../../Crawl4aiPlusBasicCrawler/helpers/formatters';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com',
		description: 'The URL to extract content from using regex patterns',
		displayOptions: {
			show: {
				operation: ['regexExtractor'],
			},
		},
	},
	{
		displayName: 'Pattern Type',
		name: 'patternType',
		type: 'options',
		options: [
			{
				name: 'Built-in Patterns',
				value: 'builtin',
				description: 'Use pre-defined regex patterns for common data types',
			},
			{
				name: 'Custom Patterns',
				value: 'custom',
				description: 'Define your own regex patterns',
			},
			{
				name: 'LLM Generated Pattern',
				value: 'llm',
				description: 'Let LLM generate a regex pattern from natural language description',
			},
		],
		default: 'builtin',
		description: 'Choose between built-in, custom, or LLM-generated regex patterns',
		displayOptions: {
			show: {
				operation: ['regexExtractor'],
			},
		},
	},
	{
		displayName: 'Built-in Patterns',
		name: 'builtinPatterns',
		type: 'multiOptions',
		options: [
			{
				name: 'Credit Card',
				value: 'CreditCard',
				description: 'Extract credit card numbers',
			},
			{
				name: 'Currency',
				value: 'Currency',
				description: 'Extract currency values',
			},
			{
				name: 'Date (ISO)',
				value: 'DateIso',
				description: 'Extract ISO format dates',
			},
			{
				name: 'Date (US)',
				value: 'DateUS',
				description: 'Extract US format dates',
			},
			{
				name: 'Email',
				value: 'Email',
				description: 'Extract email addresses',
			},
			{
				name: 'Hashtag',
				value: 'Hashtag',
				description: 'Extract hashtags',
			},
			{
				name: 'Hex Color',
				value: 'HexColor',
				description: 'Extract HTML hex colors',
			},
			{
				name: 'IBAN',
				value: 'Iban',
				description: 'Extract bank account numbers (IBAN)',
			},
			{
				name: 'IP Address (IPv4)',
				value: 'IPv4',
				description: 'Extract IPv4 addresses',
			},
			{
				name: 'IP Address (IPv6)',
				value: 'IPv6',
				description: 'Extract IPv6 addresses',
			},
			{
				name: 'MAC Address',
				value: 'MacAddr',
				description: 'Extract MAC addresses',
			},
			{
				name: 'Number',
				value: 'Number',
				description: 'Extract numeric values',
			},
			{
				name: 'Percentage',
				value: 'Percentage',
				description: 'Extract percentage values',
			},
			{
				name: 'Phone (International)',
				value: 'PhoneIntl',
				description: 'Extract international phone numbers',
			},
			{
				name: 'Phone (US)',
				value: 'PhoneUS',
				description: 'Extract US phone numbers',
			},
			{
				name: 'Postal Code (UK)',
				value: 'PostalUK',
				description: 'Extract UK postal codes',
			},
			{
				name: 'Postal Code (US)',
				value: 'PostalUS',
				description: 'Extract US postal codes',
			},
			{
				name: 'Time (24h)',
				value: 'Time24h',
				description: 'Extract 24-hour time format',
			},
			{
				name: 'Twitter Handle',
				value: 'TwitterHandle',
				description: 'Extract Twitter handles',
			},
			{
				name: 'URL',
				value: 'Url',
				description: 'Extract HTTP/HTTPS URLs',
			},
			{
				name: 'UUID',
				value: 'Uuid',
				description: 'Extract UUIDs',
			},
		],
		default: ['Email', 'Url'],
		description: 'Select built-in patterns to use for extraction',
		displayOptions: {
			show: {
				operation: ['regexExtractor'],
				patternType: ['builtin'],
			},
		},
	},
	{
		displayName: 'Custom Patterns',
		name: 'customPatterns',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		default: {},
		required: true,
		displayOptions: {
			show: {
				operation: ['regexExtractor'],
				patternType: ['custom'],
			},
		},
		options: [
			{
				name: 'patternValues',
				displayName: 'Pattern',
				values: [
					{
						displayName: 'Label',
						name: 'label',
						type: 'string',
						required: true,
						default: '',
						placeholder: 'price',
						description: 'Label for this pattern (used to identify matches)',
					},
					{
						displayName: 'Regex Pattern',
						name: 'pattern',
						type: 'string',
						required: true,
						default: '',
						placeholder: '\\$\\s?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?',
						description: 'Regular expression pattern to match',
					},
				],
			},
		],
	},
	{
		displayName: 'Pattern Label',
		name: 'llmLabel',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'price',
		description: 'Label for the generated pattern (e.g., "price", "email", "product_id")',
		displayOptions: {
			show: {
				operation: ['regexExtractor'],
				patternType: ['llm'],
			},
		},
	},
	{
		displayName: 'Pattern Query',
		name: 'llmQuery',
		type: 'string',
		typeOptions: {
			rows: 3,
		},
		required: true,
		default: '',
		placeholder: 'Prices in US dollars (e.g., $1,299.00 or $200)',
		description: 'Natural language description of what you want to extract. Be specific with examples.',
		displayOptions: {
			show: {
				operation: ['regexExtractor'],
				patternType: ['llm'],
			},
		},
	},
	{
		displayName: 'Sample URL',
		name: 'llmSampleUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com/sample-page',
		description: 'URL of a sample page containing the data you want to extract (used to train the LLM)',
		displayOptions: {
			show: {
				operation: ['regexExtractor'],
				patternType: ['llm'],
			},
		},
	},
	{
		displayName: 'Browser Options',
		name: 'browserOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['regexExtractor'],
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
				name: 'java_script_enabled',
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
				displayName: 'JavaScript Code',
				name: 'jsCode',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				placeholder: 'document.querySelector("button.load-more").click();',
				description: 'JavaScript code to execute before extraction',
			},
			{
				displayName: 'Timeout (MS)',
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
				operation: ['regexExtractor'],
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
				displayName: 'CSS Selector',
				name: 'cssSelector',
				type: 'string',
				default: '',
				placeholder: 'article.content',
				description: 'CSS selector to focus extraction on a specific part of the page',
			},
			{
				displayName: 'Include Original Text',
				name: 'includeFullText',
				type: 'boolean',
				default: false,
				description: 'Whether to include the original webpage text in output',
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
			const patternType = this.getNodeParameter('patternType', i, 'builtin') as string;
			let browserOptions = this.getNodeParameter('browserOptions', i, {}) as IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;

			// Transform extraArgs from fixedCollection format to array
			if (browserOptions.extraArgs && typeof browserOptions.extraArgs === 'object') {
				const extraArgsCollection = browserOptions.extraArgs as any;
				if (extraArgsCollection.args && Array.isArray(extraArgsCollection.args)) {
					browserOptions = {
						...browserOptions,
						extraArgs: extraArgsCollection.args.map((arg: any) => arg.value).filter((v: string) => v)
					};
				}
			}

			if (!url) {
				throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
			}

			if (!isValidUrl(url)) {
				throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
			}

			// Build regex extraction strategy config
			const extractionStrategy: any = {
				type: 'RegexExtractionStrategy',
				params: {},
			};

			if (patternType === 'builtin') {
				const builtinPatterns = this.getNodeParameter('builtinPatterns', i, []) as string[];
				if (!builtinPatterns || builtinPatterns.length === 0) {
					throw new NodeOperationError(this.getNode(), 'At least one built-in pattern must be selected.', { itemIndex: i });
				}
				// Combine patterns with bitwise OR syntax for API
				extractionStrategy.params.patterns = builtinPatterns;
			} else if (patternType === 'llm') {
				// LLM-generated pattern
				const llmLabel = this.getNodeParameter('llmLabel', i, '') as string;
				const llmQuery = this.getNodeParameter('llmQuery', i, '') as string;
				const llmSampleUrl = this.getNodeParameter('llmSampleUrl', i, '') as string;

				if (!llmLabel) {
					throw new NodeOperationError(this.getNode(), 'Pattern label is required for LLM pattern generation.', { itemIndex: i });
				}

				if (!llmQuery) {
					throw new NodeOperationError(this.getNode(), 'Pattern query is required for LLM pattern generation.', { itemIndex: i });
				}

				if (!llmSampleUrl || !isValidUrl(llmSampleUrl)) {
					throw new NodeOperationError(this.getNode(), 'Valid sample URL is required for LLM pattern generation.', { itemIndex: i });
				}

				// Get LLM credentials
				const credentials = await this.getCredentials('crawl4aiPlusApi') as any;

				if (!credentials.enableLlm) {
					throw new NodeOperationError(
						this.getNode(),
						'LLM features must be enabled in Crawl4AI credentials to use LLM pattern generation.',
						{ itemIndex: i }
					);
				}

				// Build LLM provider config
				let provider = 'openai/gpt-4o';
				let apiKey = '';

				if (credentials.llmProvider === 'openai') {
					const model = credentials.llmModel || 'gpt-4o-mini';
					provider = `openai/${model}`;
					apiKey = credentials.apiKey || '';
				} else if (credentials.llmProvider === 'anthropic') {
					const model = credentials.llmModel || 'claude-3-haiku-20240307';
					provider = `anthropic/${model}`;
					apiKey = credentials.apiKey || '';
				} else if (credentials.llmProvider === 'groq') {
					const model = credentials.llmModel || 'llama3-70b-8192';
					provider = `groq/${model}`;
					apiKey = credentials.apiKey || '';
				} else if (credentials.llmProvider === 'ollama') {
					const model = credentials.ollamaModel || 'llama3';
					provider = `ollama/${model}`;
				} else if (credentials.llmProvider === 'other') {
					provider = credentials.customProvider || 'custom/model';
					apiKey = credentials.customApiKey || '';
				}

				if (!apiKey && credentials.llmProvider !== 'ollama') {
					throw new NodeOperationError(
						this.getNode(),
						`API key is required for ${credentials.llmProvider} provider. Please configure it in the Crawl4AI credentials.`,
						{ itemIndex: i }
					);
				}

				// First, crawl the sample URL to get HTML
				const crawler = await getCrawl4aiClient(this);
				const sampleBrowserConfig = createBrowserConfig(browserOptions);
				const sampleConfig: any = {
					...sampleBrowserConfig,
					cache_mode: 'BYPASS', // Always fetch fresh sample
				};

				const sampleResult = await crawler.crawlUrl(llmSampleUrl, sampleConfig);

				if (!sampleResult.success) {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to crawl sample URL: ${sampleResult.error_message || 'Unknown error'}`,
						{ itemIndex: i }
					);
				}

				// Use fit_html or cleaned_html for pattern generation
				const sampleHtml = (typeof sampleResult.markdown === 'object' && (sampleResult.markdown as any).fit_html)
					? (sampleResult.markdown as any).fit_html
					: sampleResult.cleaned_html || sampleResult.html || '';

				if (!sampleHtml) {
					throw new NodeOperationError(
						this.getNode(),
						'Failed to extract HTML from sample URL',
						{ itemIndex: i }
					);
				}

				// Call pattern generation endpoint
				// The API expects: POST /generate_pattern with { label, html, query, llm_config }
				const patternGenPayload: any = {
					label: llmLabel,
					html: sampleHtml,
					query: llmQuery,
					llm_config: {
						type: 'LLMConfig',
						params: {
							provider,
							api_token: apiKey,
							...(credentials.llmProvider === 'other' && credentials.customBaseUrl ?
								{ api_base: credentials.customBaseUrl } : {}),
							...(credentials.llmProvider === 'ollama' && credentials.ollamaUrl ?
								{ api_base: credentials.ollamaUrl } : {})
						}
					}
				};

				const generatedPattern = await crawler.generateRegexPattern(patternGenPayload);

				// Use the generated pattern as a custom pattern
				extractionStrategy.params.custom = generatedPattern;
			} else {
				// Custom patterns
				const customPatternsValues = this.getNodeParameter('customPatterns.patternValues', i, []) as IDataObject[];
				if (!customPatternsValues || customPatternsValues.length === 0) {
					throw new NodeOperationError(this.getNode(), 'At least one custom pattern must be defined.', { itemIndex: i });
				}

				// Build custom patterns object
				const customPatterns: Record<string, string> = {};
				customPatternsValues.forEach(pattern => {
					const label = pattern.label as string;
					const patternStr = pattern.pattern as string;
					if (label && patternStr) {
						customPatterns[label] = patternStr;
					}
				});

				extractionStrategy.params.custom_patterns = customPatterns;
			}

			// Build crawler config using standardized helper
			const crawlerOptions: any = {
				...browserOptions, // Include browser options
				cacheMode: options.cacheMode || 'ENABLED',
				jsCode: browserOptions.jsCode,
				cssSelector: options.cssSelector,
			};

			const crawlerConfig = createCrawlerRunConfig(crawlerOptions);
			// Set extraction strategy
			crawlerConfig.extractionStrategy = extractionStrategy;

			// Get crawler instance
			const crawler = await getCrawl4aiClient(this);

			// Run the extraction using standardized arun() method
			const result = await crawler.arun(url, crawlerConfig);

			// Parse extracted JSON
			const extractedData = parseExtractedJson(result);

			// Format extraction result
			const formattedResult = formatExtractionResult(
				result,
				extractedData,
				options.includeFullText as boolean
			);

			// Add processed result to output array
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

