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
	createBrowserConfig,
	createCrawlerRunConfig,
	applyOutputFilteringConfig,
	isValidUrl,
	normalizeUrlProtocol,
} from '../../shared/utils';
import { formatCrawlResult } from '../helpers/formatters';
import {
	getBrowserSessionFields,
	getCrawlSettingsFields,
	getOutputFilteringFields,
} from '../../shared/descriptions';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: 'URLs',
		name: 'urls',
		type: 'string',
		typeOptions: {
			rows: 4,
		},
		required: true,
		default: '',
		placeholder: 'https://example.com\nhttps://example.com/page2',
		description: 'URLs to crawl via the streaming endpoint, one per line or comma-separated. Each URL produces one output item.',
		displayOptions: {
			show: {
				operation: ['crawlStream'],
			},
		},
	},
	...getBrowserSessionFields(['crawlStream']),
	...getCrawlSettingsFields(['crawlStream']),
	...getOutputFilteringFields(['crawlStream']),
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
			const rawUrls = this.getNodeParameter('urls', i, '') as string;
			const bs = this.getNodeParameter('browserSession', i, {}) as IDataObject;
			const cs = this.getNodeParameter('crawlSettings', i, {}) as IDataObject;
			const of = this.getNodeParameter('outputFiltering', i, {}) as IDataObject;

			const urls = rawUrls
				.split(/[\n,]/)
				.map((u) => normalizeUrlProtocol(u.trim()))
				.filter((u) => u.length > 0);

			if (urls.length === 0) {
				throw new NodeOperationError(this.getNode(), 'At least one URL is required.', { itemIndex: i });
			}

			for (const url of urls) {
				if (!isValidUrl(url)) {
					throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
				}
			}

			// Build config from shared collections
			const config: FullCrawlConfig = {
				...createBrowserConfig(bs),
				...createCrawlerRunConfig(cs),
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

			const { results, parseErrors } = await crawler.crawlStream(urls, config);

			if (results.length === 0) {
				allResults.push({
					json: {
						success: false,
						error: 'Stream returned no results. The URLs may be inaccessible or blocked.',
						...(parseErrors > 0 ? { parseErrors } : {}),
					},
					pairedItem: { item: i },
				});
				continue;
			}

			for (let ri = 0; ri < results.length; ri++) {
				const result = results[ri];
				const fetchedAt = new Date().toISOString();
				const formatted = formatCrawlResult(result, {
					cacheMode: cs.cacheMode as string | undefined,
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
				// Surface parse errors on the last result so users know about discarded stream chunks
				if (ri === results.length - 1 && parseErrors > 0) {
					(formatted as IDataObject).streamParseErrors = parseErrors;
				}
				allResults.push({ json: formatted, pairedItem: { item: i } });
			}
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
