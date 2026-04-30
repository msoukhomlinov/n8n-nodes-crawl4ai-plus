import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { findNumbers } from 'libphonenumber-js';

import type { Crawl4aiApiCredentials, Crawl4aiNodeOptions, CrawlResult, FullCrawlConfig } from '../../shared/interfaces';
import { checkLlmExtractionError } from '../../shared/formatters';
import { Crawl4aiClient } from '../../shared/apiClient';
import {
	getCrawl4aiClient,
	getSimpleDefaults,
	executeCrawl,
	validateLlmCredentials,
	buildLlmConfig,
	createLlmExtractionStrategy,
} from '../helpers/utils';
import { formatExtractedDataResult } from '../helpers/formatters';

// --- Regex patterns for contact info extraction ---
const ADDRESS_PATTERNS: RegExp[] = [
	// AU/US/CA: street + state abbreviation + numeric postcode
	/\d{1,5}\s+[\w\s]{2,40}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Parade|Pde|Highway|Hwy|Crescent|Cres|Terrace|Tce|Circuit|Cct)\.?(?:\s*,?\s*(?:Suite|Ste|Apt|Unit|Level|#)\s*[\w\d-]+)?(?:\s*,?\s*[\w\s]{2,30})?\s*,?\s*(?:VIC|NSW|QLD|WA|SA|TAS|ACT|NT|[A-Z]{2})\s*\d{4,6}(?:-\d{4})?/gi,
	// UK: street + town/city + UK postcode (e.g. SW1A 1AA, EC1A 1BB, W1A 0AX)
	/\d{1,5}\s+[\w\s]{2,40}(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Court|Ct|Way|Place|Pl|Crescent|Cres|Terrace|Tce)\.?(?:\s*,?\s*(?:Flat|Apt|Unit|Floor)\s*[\w\d-]+)?(?:\s*,?\s*[\w\s]{2,30})?\s*,?\s*[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/gi,
];

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const FINANCIAL_PATTERNS: Record<string, RegExp[]> = {
	currencies: [/[$\u00A3\u20AC\u00A5]\s?\d{1,3}(?:[,. ]\d{3})*(?:[.,]\d{1,2})?/g],
	creditCards: [/\b(?:\d[ -]*?){13,19}\b/g],
	ibans: [/[A-Z]{2}\d{2}[\s-]?[\dA-Z]{4}[\s-]?(?:[\dA-Z]{4}[\s-]?){2,7}[\dA-Z]{1,4}/g],
	percentages: [/\d+(?:\.\d+)?%/g],
	numbers: [/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/g],
};

/**
 * Extract contact info from crawl results using libphonenumber-js for phones
 * and targeted regex for emails and addresses.
 */
function extractContactInfo(
	results: CrawlResult[],
	defaultCountry: string,
): { emails: string[]; phones: string[]; addresses: string[] } {
	const emails = new Set<string>();
	const phoneMap = new Map<string, string>(); // E.164 → formatted
	const addresses = new Set<string>();

	for (const result of results) {
		let text = '';
		if (typeof result.markdown === 'object' && result.markdown !== null) {
			text = result.markdown.raw_markdown || '';
		} else if (typeof result.markdown === 'string') {
			text = result.markdown;
		}
		if (!text) continue;

		// Emails
		EMAIL_PATTERN.lastIndex = 0;
		const emailMatches = text.match(EMAIL_PATTERN);
		if (emailMatches) {
			for (const e of emailMatches) emails.add(e.toLowerCase());
		}

		// Phones via libphonenumber-js — finds and validates in one pass
		const found = findNumbers(text, { defaultCountry: defaultCountry as import('libphonenumber-js').CountryCode, v2: true });
		for (const match of found) {
			if (match.number.isValid()) {
				const e164 = match.number.format('E.164');
				if (!phoneMap.has(e164)) {
					phoneMap.set(e164, match.number.formatInternational());
				}
			}
		}

		// Addresses
		for (const pattern of ADDRESS_PATTERNS) {
			pattern.lastIndex = 0;
			const addrMatches = text.match(pattern);
			if (addrMatches) {
				for (const a of addrMatches) addresses.add(a.trim());
			}
		}
	}

	return {
		emails: [...emails],
		phones: [...phoneMap.values()],
		addresses: [...addresses],
	};
}

const LLM_VALIDATION_SCHEMA = {
	type: 'object',
	properties: {
		emails: {
			type: 'array',
			items: { type: 'string' },
			description: 'Validated email addresses — real contact emails only, no noreply/system addresses unless clearly a contact',
		},
		phones: {
			type: 'array',
			items: { type: 'string' },
			description: 'Validated phone numbers in international format (+XX XX XXXX XXXX)',
		},
		addresses: {
			type: 'array',
			items: { type: 'string' },
			description: 'Validated physical postal addresses — complete addresses only',
		},
	},
	required: ['emails', 'phones', 'addresses'],
};

const LLM_VALIDATION_INSTRUCTION = `You are a contact information validator. You receive a list of extracted emails, phone numbers, and addresses that may contain false positives. Your task:
1. Remove any items that are clearly NOT real contact details (e.g. example@domain.com, placeholder numbers, version strings mistaken for phones)
2. Remove duplicate entries (same number in different formats)
3. Format phone numbers consistently in international format (+XX XX XXXX XXXX)
4. Return only genuine contact information
Return the cleaned data as JSON matching the provided schema.`;

async function runLlmContactValidation(
	this: IExecuteFunctions,
	contacts: { emails: string[]; phones: string[]; addresses: string[] },
	credentials: Crawl4aiApiCredentials,
	crawler: Crawl4aiClient,
	modelOverride: string | undefined,
	itemIndex: number,
): Promise<{ emails: string[]; phones: string[]; addresses: string[] }> {
	const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride);

	const jsonStr = JSON.stringify(contacts, null, 2)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const syntheticHtml = `<pre>${jsonStr}</pre>`;
	const rawUrl = `raw:${syntheticHtml}`;

	const config: FullCrawlConfig = {
		extractionStrategy: createLlmExtractionStrategy(
			LLM_VALIDATION_SCHEMA,
			LLM_VALIDATION_INSTRUCTION,
			provider,
			apiKey,
			baseUrl,
		),
	};

	try {
		const result = await crawler.crawlUrl(rawUrl, config);
		const llmError = checkLlmExtractionError(result);
		if (llmError) {
			throw new NodeOperationError(
				this.getNode(),
				`LLM validation failed: ${llmError}`,
				{ itemIndex },
			);
		}
		if (!result.extracted_content) return contacts;
		const parsed = JSON.parse(result.extracted_content) as unknown;
		const items = Array.isArray(parsed)
			? (parsed as IDataObject[]).filter((c) => !c.error)
			: parsed && !(parsed as IDataObject).error
				? [(parsed as IDataObject)]
				: [];
		if (items.length === 0) return contacts;
		const merged = {
			emails: [...new Set(items.flatMap((c) => Array.isArray(c.emails) ? (c.emails as string[]) : []))],
			phones: [...new Set(items.flatMap((c) => Array.isArray(c.phones) ? (c.phones as string[]) : []))],
			addresses: [...new Set(items.flatMap((c) => Array.isArray(c.addresses) ? (c.addresses as string[]) : []))],
		};
		const anyHas = (key: string) => items.some((c) => key in c);
		return {
			emails: anyHas('emails') ? merged.emails : contacts.emails,
			phones: anyHas('phones') ? merged.phones : contacts.phones,
			addresses: anyHas('addresses') ? merged.addresses : contacts.addresses,
		};
	} catch (err) {
		if (err instanceof NodeOperationError) throw err;
		return contacts;
	}
}

/**
 * Extract data using regex patterns from markdown content
 */
function extractWithRegex(
	results: CrawlResult[],
	patterns: Record<string, RegExp[]>,
): IDataObject {
	const extracted: Record<string, string[]> = {};

	for (const [category, regexList] of Object.entries(patterns)) {
		const matches = new Set<string>();

		for (const result of results) {
			// Get markdown text from result
			let text = '';
			if (typeof result.markdown === 'object' && result.markdown !== null) {
				text = result.markdown.raw_markdown || '';
			} else if (typeof result.markdown === 'string') {
				text = result.markdown;
			}
			for (const regex of regexList) {
				// Reset regex lastIndex for global patterns
				regex.lastIndex = 0;
				const found = text.match(regex);
				if (found) {
					for (const match of found) {
						matches.add(match.trim());
					}
				}
			}
		}

		extracted[category] = [...matches];
	}

	// Mask credit card numbers for security
	if (extracted.creditCards) {
		extracted.creditCards = extracted.creditCards.map((card) => {
			const digits = card.replace(/[\s-]/g, '');
			if (digits.length >= 13) {
				return '*'.repeat(digits.length - 4) + digits.slice(-4);
			}
			return card;
		});
	}

	return extracted as unknown as IDataObject;
}

/**
 * Merge extracted data from multiple pages, deduplicating arrays by value
 */
function mergeExtractedData(items: IDataObject[]): IDataObject {
	const merged: IDataObject = {};

	for (const item of items) {
		for (const [key, value] of Object.entries(item)) {
			if (Array.isArray(value)) {
				const existing = (merged[key] as string[] | undefined) || [];
				const combined = [...existing, ...(value as string[])];
				merged[key] = [...new Set(combined)];
			} else if (merged[key] === undefined || merged[key] === null || merged[key] === '') {
				merged[key] = value;
			}
		}
	}

	return merged;
}

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com',
		description: 'The URL to extract data from',
		displayOptions: {
			show: {
				operation: ['extractData'],
			},
		},
	},
	{
		displayName: 'Extraction Type',
		name: 'extractionType',
		type: 'options',
		options: [
			{
				name: 'Contact Info',
				value: 'contactInfo',
				description: 'Extract emails, phone numbers, and addresses (no LLM required)',
			},
			{
				name: 'Financial Data',
				value: 'financialData',
				description: 'Extract currencies, credit cards, IBANs, percentages (no LLM required)',
			},
			{
				name: 'Custom (LLM)',
				value: 'customLlm',
				description: 'Define custom extraction with natural language instructions (requires LLM)',
			},
		],
		default: 'contactInfo',
		description: 'What type of data to extract',
		displayOptions: {
			show: {
				operation: ['extractData'],
			},
		},
	},
	{
		displayName: 'Extraction Instructions',
		name: 'instruction',
		type: 'string',
		typeOptions: { rows: 3 },
		required: true,
		default: '',
		placeholder: 'Extract product names and prices',
		description: 'Natural language description of what to extract',
		displayOptions: {
			show: {
				operation: ['extractData'],
				extractionType: ['customLlm'],
			},
		},
	},
	{
		displayName: 'Schema Fields',
		name: 'schemaFields',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		default: {},
		description: 'Define the fields to extract',
		displayOptions: {
			show: {
				operation: ['extractData'],
				extractionType: ['customLlm'],
			},
		},
		options: [
			{
				name: 'fields',
				displayName: 'Field',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						required: true,
						default: '',
						placeholder: 'productName',
						description: 'Field name in the output',
					},
					{
						displayName: 'Type',
						name: 'fieldType',
						type: 'options',
						options: [
							{ name: 'String', value: 'string' },
							{ name: 'Number', value: 'number' },
							{ name: 'Boolean', value: 'boolean' },
							{ name: 'Array', value: 'array' },
						],
						default: 'string',
						description: 'Data type of the field',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						placeholder: 'The name of the product',
						description: 'Description of what this field should contain',
					},
				],
			},
		],
	},
	{
		displayName:
			'Custom extraction requires LLM credentials to be configured in the Crawl4AI Plus credentials.',
		name: 'llmNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				operation: ['extractData'],
				extractionType: ['customLlm'],
			},
		},
	},
	{
		displayName:
			'LLM validation requires LLM credentials to be configured in the Crawl4AI Plus credentials.',
		name: 'llmValidationNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				operation: ['extractData'],
				extractionType: ['contactInfo'],
			},
		},
	},
	{
		displayName: 'Crawl Scope',
		name: 'crawlScope',
		type: 'options',
		options: [
			{
				name: 'Single Page',
				value: 'singlePage',
				description: 'Extract from just this one page',
			},
			{
				name: 'Follow Links',
				value: 'followLinks',
				description: 'Extract across this page and linked pages (depth 1)',
			},
			{
				name: 'Full Site',
				value: 'fullSite',
				description: 'Extract across the entire website (depth 3)',
			},
		],
		default: 'singlePage',
		description: 'How many pages to extract data from',
		displayOptions: {
			show: {
				operation: ['extractData'],
			},
		},
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['extractData'],
			},
		},
		options: [
			{
				displayName: 'Cache Mode',
				name: 'cacheMode',
				type: 'options',
				options: [
					{ name: 'Bypass (Skip Cache)', value: 'BYPASS' },
					{ name: 'Disabled (No Cache)', value: 'DISABLED' },
					{ name: 'Enabled (Read/Write)', value: 'ENABLED' },
					{ name: 'Read Only', value: 'READ_ONLY' },
					{ name: 'Write Only', value: 'WRITE_ONLY' },
				],
				default: 'ENABLED',
				description: 'How to use the cache when crawling',
			},
			{
				displayName: 'Default Country Code',
				name: 'defaultCountry',
				type: 'string',
				default: 'AU',
				placeholder: 'AU',
				description: 'ISO 3166-1 alpha-2 country code (two uppercase letters) used to interpret local phone numbers that have no country prefix. Examples: AU, US, GB, NZ, DE.',
				displayOptions: {
					show: {
						'/extractionType': ['contactInfo'],
					},
				},
			},
			{
				displayName: 'Exclude URL Patterns',
				name: 'excludePatterns',
				type: 'string',
				default: '',
				placeholder: '*/admin/*,*/login/*',
				description: 'Comma-separated URL patterns to exclude from crawling',
				displayOptions: {
					show: {
						'/crawlScope': ['followLinks', 'fullSite'],
					},
				},
			},
			{
				displayName: 'LLM Validation',
				name: 'llmValidation',
				type: 'boolean',
				default: false,
				description: 'Whether to send extracted contacts to the configured LLM for a final validation and cleanup pass. Removes false positives and normalises formats. Requires LLM credentials.',
				displayOptions: {
					show: {
						'/extractionType': ['contactInfo'],
					},
				},
			},
			{
				displayName: 'Max Pages',
				name: 'maxPages',
				type: 'number',
				default: 10,
				description: 'Maximum number of pages to crawl',
				displayOptions: {
					show: {
						'/crawlScope': ['followLinks', 'fullSite'],
					},
				},
			},
			{
				displayName: 'Model Name or ID',
				name: 'llmModel',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getLlmModels',
				},
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				displayOptions: {
					show: {
						'/extractionType': ['customLlm', 'contactInfo'],
					},
				},
			},
			{
				displayName: 'Wait For',
				name: 'waitFor',
				type: 'string',
				default: '',
				placeholder: '.content-loaded or js:() => document.readyState === "complete"',
				description:
					'CSS selector or JS expression (prefixed with js:) to wait for before extracting content',
			},
		],
	},
];

// --- Execution Logic ---
export async function execute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_nodeOptions: Crawl4aiNodeOptions,
): Promise<INodeExecutionData[]> {
	const allResults: INodeExecutionData[] = [];
	const client = await getCrawl4aiClient(this);
	const credentials = (await this.getCredentials('crawl4aiPlusApi')) as unknown as Crawl4aiApiCredentials;

	for (let i = 0; i < items.length; i++) {
		try {
			const url = this.getNodeParameter('url', i, '') as string;
			const extractionType = this.getNodeParameter('extractionType', i, 'contactInfo') as string;
			const crawlScope = this.getNodeParameter('crawlScope', i, 'singlePage') as string;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;

			if (!url) {
				throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
			}

			// Build base config
			const config: FullCrawlConfig = {
				...getSimpleDefaults(),
				cacheMode: (options.cacheMode as FullCrawlConfig['cacheMode']) || 'ENABLED',
			};

			if (options.waitFor) {
				config.waitFor = String(options.waitFor);
			}

			// For customLlm, build LLM extraction strategy
			if (extractionType === 'customLlm') {
				try {
					validateLlmCredentials(credentials, 'Custom extraction');
				} catch (err) {
					throw new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i });
				}

				const instruction = this.getNodeParameter('instruction', i, '') as string;
				if (!instruction) {
					throw new NodeOperationError(
						this.getNode(),
						'Extraction instruction cannot be empty.',
						{ itemIndex: i },
					);
				}

				// Build schema from fields
				const schemaFieldsRaw = this.getNodeParameter(
					'schemaFields.fields',
					i,
					[],
				) as IDataObject[];
				const properties: Record<string, IDataObject> = {};
				const required: string[] = [];

				for (const field of schemaFieldsRaw) {
					const name = field.name as string;
					const fieldType = field.fieldType as string;
					if (!name) continue;

					const prop: IDataObject = {};
					if (fieldType === 'array') {
						prop.type = 'array';
						prop.items = { type: 'string' };
					} else {
						prop.type = fieldType;
					}
					if (field.description) {
						prop.description = field.description;
					}
					properties[name] = prop;
					required.push(name);
				}

				// Fallback generic schema if no fields defined
				if (Object.keys(properties).length === 0) {
					properties.data = { type: 'array', items: { type: 'string' } };
					required.push('data');
				}

				const schema = { type: 'object', properties, required };
				const modelOverride = options.llmModel as string | undefined;
				const { provider, apiKey, baseUrl } = buildLlmConfig(credentials, modelOverride || undefined);

				config.extractionStrategy = createLlmExtractionStrategy(
					schema,
					instruction,
					provider,
					apiKey,
					baseUrl,
				);
			}

			const results = await executeCrawl(
				client,
				url,
				crawlScope as 'singlePage' | 'followLinks' | 'fullSite',
				config,
				{
					maxPages: options.maxPages as number | undefined,
					excludePatterns: options.excludePatterns as string | undefined,
				},
			);

			// Extract data based on type
			let data: IDataObject | IDataObject[];

			if (extractionType === 'contactInfo') {
				const defaultCountry = (options.defaultCountry as string) || 'AU';
				let contacts = extractContactInfo(results, defaultCountry);

				if (options.llmValidation === true) {
					try {
						validateLlmCredentials(credentials, 'LLM validation');
					} catch (err) {
						throw new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i });
					}
					const modelOverride = options.llmModel as string | undefined;
					contacts = await runLlmContactValidation.call(
						this,
						contacts,
						credentials,
						client,
						modelOverride,
						i,
					);
				}

				data = contacts;
			} else if (extractionType === 'financialData') {
				data = extractWithRegex(results, FINANCIAL_PATTERNS);
			} else {
				// customLlm — parse extracted JSON from each result and merge
				const extractedItems: IDataObject[] = [];
				let parseFailures = 0;
				const llmPageErrors: string[] = [];
				let pagesWithContent = 0;
				for (const result of results) {
					if (result.extracted_content) {
						pagesWithContent++;
						const llmError = checkLlmExtractionError(result);
						if (llmError) {
							llmPageErrors.push(llmError);
						} else {
							try {
								const parsed = JSON.parse(result.extracted_content) as IDataObject | IDataObject[];
								// LLM extraction returns an array of chunk results; flatten and skip error envelopes
								const items = Array.isArray(parsed) ? parsed : [parsed];
								for (const item of items) {
									// Skip Crawl4AI error envelopes (error:true + string content + tags array)
									if (item && !(item.error === true && typeof item.content === 'string' && Array.isArray(item.tags))) {
										extractedItems.push(item);
									}
								}
							} catch {
								parseFailures++;
							}
						}
					}
				}
				// Only throw when every page with content returned LLM errors (no usable data at all)
				if (llmPageErrors.length > 0 && llmPageErrors.length === pagesWithContent) {
					throw new NodeOperationError(this.getNode(), `LLM extraction failed: ${llmPageErrors[0]}`, { itemIndex: i });
				}

				if (extractedItems.length > 1) {
					data = mergeExtractedData(extractedItems);
				} else if (extractedItems.length === 1) {
					data = extractedItems[0];
				} else {
					data = {
						extractionSuccess: false,
						warning: 'Failed to parse extracted content as JSON',
					};
				}

				// Surface parse failures so users know some pages' data was lost
				if (parseFailures > 0 && typeof data === 'object' && !Array.isArray(data)) {
					(data as IDataObject)._parseWarning = `${parseFailures} page(s) returned content that could not be parsed as JSON`;
				}
			}

			const formatted = formatExtractedDataResult(results, data, extractionType);

			allResults.push({
				json: formatted,
				pairedItem: { item: i },
			});
		} catch (error) {
			if (this.continueOnFail()) {
				allResults.push({
					json: items[i].json,
					error: new NodeOperationError(this.getNode(), (error as Error).message, {
						itemIndex: i,
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
