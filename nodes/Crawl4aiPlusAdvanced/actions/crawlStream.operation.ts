import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions, CrawlerRunConfig } from '../helpers/interfaces';
import {
	getCrawl4aiClient,
	createBrowserConfig,
	createCrawlerRunConfig,
	isValidUrl,
} from '../../shared/utils';
import { formatCrawlResult } from '../helpers/formatters';
import {
	getBrowserSessionFields,
	getCrawlSettingsFields,
} from '../../shared/descriptions';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: 'URLs',
		name: 'streamUrls',
		type: 'string',
		typeOptions: {
			rows: 4,
		},
		required: true,
		default: '',
		placeholder: 'https://example.com\nhttps://example.com/page2',
		description: 'One URL per line to crawl via the streaming endpoint. Each URL produces one output item.',
		displayOptions: {
			show: {
				operation: ['crawlStream'],
			},
		},
	},
	...getBrowserSessionFields(['crawlStream']),
	...getCrawlSettingsFields(['crawlStream']),
];

// --- Execution Logic ---
export async function execute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
	_nodeOptions: Crawl4aiNodeOptions,
): Promise<INodeExecutionData[]> {
	const allResults: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		try {
			const rawUrls = this.getNodeParameter('streamUrls', i, '') as string;
			const bs = this.getNodeParameter('browserSession', i, {}) as IDataObject;
			const cs = this.getNodeParameter('crawlSettings', i, {}) as IDataObject;

			const urls = rawUrls
				.split('\n')
				.map((u) => u.trim())
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
			const config: CrawlerRunConfig = {
				...createBrowserConfig(bs),
				...createCrawlerRunConfig(cs),
			};

			const crawler = await getCrawl4aiClient(this);
			const results = await crawler.crawlStream(urls, config);

			for (const result of results) {
				const fetchedAt = new Date().toISOString();
				const formatted = formatCrawlResult(result, {
					cacheMode: cs.cacheMode as string | undefined,
					includeHtml: false,
					includeLinks: true,
					includeMedia: false,
					fetchedAt,
				});
				allResults.push({ json: formatted, pairedItem: { item: i } });
			}
		} catch (error) {
			if (this.continueOnFail()) {
				allResults.push({
					json: items[i].json,
					error: new NodeOperationError(this.getNode(), (error as Error).message, {
						itemIndex: (error as any).itemIndex ?? i,
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
