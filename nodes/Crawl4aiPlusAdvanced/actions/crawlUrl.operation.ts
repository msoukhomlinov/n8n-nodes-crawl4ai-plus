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
} from '../../shared/utils';
import { formatCrawlResult } from '../helpers/formatters';
import {
	urlField,
	getBrowserSessionFields,
	getCrawlSettingsFields,
	getOutputFilteringFields,
} from '../../shared/descriptions';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		...urlField,
		displayOptions: {
			show: {
				operation: ['crawlUrl'],
			},
		},
	},
	...getBrowserSessionFields(['crawlUrl']),
	...getCrawlSettingsFields(['crawlUrl']),
	...getOutputFilteringFields(['crawlUrl']),
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
			const url = this.getNodeParameter('url', i, '') as string;
			const bs = this.getNodeParameter('browserSession', i, {}) as IDataObject;
			const cs = this.getNodeParameter('crawlSettings', i, {}) as IDataObject;
			const of = this.getNodeParameter('outputFiltering', i, {}) as IDataObject;

			if (!url) {
				throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
			}

			if (!isValidUrl(url)) {
				throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
			}

			// Build config from shared collections
			const config: FullCrawlConfig = {
				...createBrowserConfig(bs),
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
			const result = await crawler.crawlUrl(url, config);

			const formattedResult = formatCrawlResult(result, {
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
