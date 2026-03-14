import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions } from '../helpers/interfaces';
import type { WebhookConfig } from '../../shared/interfaces';
import {
	getCrawl4aiClient,
	createBrowserConfig,
	createCrawlerRunConfig,
	isValidUrl,
} from '../../shared/utils';
import {
	urlsField,
	getBrowserSessionFields,
	getCrawlSettingsFields,
} from '../../shared/descriptions';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		...urlsField,
		displayOptions: {
			show: {
				operation: ['submitCrawlJob'],
			},
		},
	},
	...getBrowserSessionFields(['submitCrawlJob']),
	...getCrawlSettingsFields(['submitCrawlJob']),
	{
		displayName: 'Webhook Config',
		name: 'webhookConfig',
		type: 'collection',
		placeholder: 'Add Webhook',
		default: {},
		displayOptions: {
			show: {
				operation: ['submitCrawlJob'],
			},
		},
		options: [
			{
				displayName: 'Webhook URL',
				name: 'webhookUrl',
				type: 'string',
				default: '',
				placeholder: 'https://your-n8n.com/webhook/...',
				description: 'URL to POST results to when the crawl job completes',
			},
			{
				displayName: 'Include Data in Payload',
				name: 'webhookDataInPayload',
				type: 'boolean',
				default: true,
				description: 'Whether to include crawl result data directly in the webhook payload',
			},
			{
				displayName: 'Webhook Headers',
				name: 'webhookHeaders',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				default: {},
				description: 'Custom headers to send with the webhook request',
				options: [
					{
						name: 'header',
						displayName: 'Header',
						values: [
							{
								displayName: 'Key',
								name: 'key',
								type: 'string',
								default: '',
								description: 'Header key',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Header value',
							},
						],
					},
				],
			},
		],
	},
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
			const rawUrls = this.getNodeParameter('urls', i, '') as string;
			const bs = this.getNodeParameter('browserSession', i, {}) as IDataObject;
			const cs = this.getNodeParameter('crawlSettings', i, {}) as IDataObject;
			const webhookConfigOptions = this.getNodeParameter('webhookConfig', i, {}) as IDataObject;

			// Parse and validate URLs
			const urls = rawUrls.split('\n').map((u) => u.trim()).filter((u) => u.length > 0);
			if (urls.length === 0) {
				throw new NodeOperationError(this.getNode(), 'At least one URL is required.', { itemIndex: i });
			}

			for (const url of urls) {
				if (!isValidUrl(url)) {
					throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
				}
			}

			// Build config from shared collections
			const config = {
				...createBrowserConfig(bs),
				...createCrawlerRunConfig(cs),
			};

			const crawler = await getCrawl4aiClient(this);
			const browserCfg = crawler.formatBrowserConfig(config);
			const crawlerCfg = crawler.formatCrawlerConfig(config);

			// Build webhook config if URL provided
			let webhookConfig: WebhookConfig | undefined;
			if (webhookConfigOptions.webhookUrl) {
				const headers: Record<string, string> = {};
				const webhookHeaders = webhookConfigOptions.webhookHeaders as any;
				if (webhookHeaders?.header && Array.isArray(webhookHeaders.header)) {
					for (const h of webhookHeaders.header) {
						if (h.key && h.value) headers[h.key] = h.value;
					}
				}
				webhookConfig = {
					webhook_url: String(webhookConfigOptions.webhookUrl),
					webhook_data_in_payload: webhookConfigOptions.webhookDataInPayload !== false,
					...(Object.keys(headers).length > 0 ? { webhook_headers: headers } : {}),
				};
			}

			const taskId = await crawler.submitCrawlJob({
				urls,
				browser_config: Object.keys(browserCfg).length > 0 ? browserCfg : {},
				crawler_config: Object.keys(crawlerCfg).length > 0 ? crawlerCfg : {},
				...(webhookConfig ? { webhook_config: webhookConfig } : {}),
			});

			allResults.push({
				json: {
					task_id: taskId,
					submittedAt: new Date().toISOString(),
					urlCount: urls.length,
					message: 'Crawl job submitted. Use Get Job Status with the task_id to poll for results.',
				} as IDataObject,
				pairedItem: { item: i },
			});
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
