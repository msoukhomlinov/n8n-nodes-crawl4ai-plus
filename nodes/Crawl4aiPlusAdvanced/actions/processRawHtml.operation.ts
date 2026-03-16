import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions, FullCrawlConfig } from '../helpers/interfaces';
import {
	getCrawl4aiClient,
	createCrawlerRunConfig,
	applyOutputFilteringConfig,
} from '../../shared/utils';
import { formatCrawlResult } from '../helpers/formatters';
import {
	getCrawlSettingsFields,
	getOutputFilteringFields,
} from '../../shared/descriptions';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: '',
		name: 'processRawHtmlNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				operation: ['processRawHtml'],
			},
		},
		description: 'Screenshot and PDF output options have no effect when processing raw HTML, as no browser navigation occurs',
	},
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
		description: 'The raw HTML content to process. Maximum size: 5MB.',
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
	...getCrawlSettingsFields(['processRawHtml']),
	...getOutputFilteringFields(['processRawHtml']),
];

// --- Execution Logic ---
export async function execute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_nodeOptions: Crawl4aiNodeOptions,
): Promise<INodeExecutionData[]> {
	const allResults: INodeExecutionData[] = [];
	const crawler = await getCrawl4aiClient(this);

	for (let i = 0; i < items.length; i++) {
		try {
			const html = this.getNodeParameter('html', i, '') as string;
			const baseUrl = this.getNodeParameter('baseUrl', i, 'https://example.com') as string;
			const cs = this.getNodeParameter('crawlSettings', i, {}) as IDataObject;
			const of = this.getNodeParameter('outputFiltering', i, {}) as IDataObject;

			if (!html) {
				throw new NodeOperationError(this.getNode(), 'HTML content cannot be empty.', { itemIndex: i });
			}

			// Build config from crawl settings (no browser session for raw HTML)
			const config: FullCrawlConfig = {
				...createCrawlerRunConfig(cs),
				// Output options from outputFiltering
				screenshot: of.screenshot as boolean,
				pdf: of.pdf as boolean,
				fetchSslCertificate: of.fetchSslCertificate as boolean,
				...(of.verbose === true ? { verbose: true } : {}),
			};

			// Apply content filter and table extraction from output filtering
			const filteringConfig = await applyOutputFilteringConfig(of, this, i);
			if (filteringConfig.markdownGenerator) {
				config.markdownGenerator = filteringConfig.markdownGenerator;
			}
			if (filteringConfig.tableExtraction) {
				config.tableExtraction = filteringConfig.tableExtraction;
			}

			const fetchedAt = new Date().toISOString();
			const result = await crawler.processRawHtml(html, baseUrl, config);

			const formattedResult = formatCrawlResult(result, {
				markdownOutput: (of.markdownOutput as 'raw' | 'fit' | 'both') || 'both',
				includeHtml: of.includeHtml === true,
				includeLinks: of.includeLinks !== false,
				includeMedia: of.includeMedia as boolean,
				includeScreenshot: of.screenshot as boolean,
				includePdf: of.pdf as boolean,
				includeSslCertificate: of.fetchSslCertificate as boolean,
				includeTables: of.includeTables as boolean,
				fetchedAt,
			});

			allResults.push({
				json: formattedResult,
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
