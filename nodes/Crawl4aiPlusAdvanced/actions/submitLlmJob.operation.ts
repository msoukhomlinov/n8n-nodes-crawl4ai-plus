import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiApiCredentials, Crawl4aiNodeOptions } from '../helpers/interfaces';
import {
	getCrawl4aiClient,
	isValidUrl,
	buildLlmConfig,
	validateLlmCredentials,
	buildWebhookConfig,
	normalizeUrlProtocol,
} from '../../shared/utils';
import { urlField, getWebhookFields } from '../../shared/descriptions';
import { formatJobSubmission } from '../helpers/formatters';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		...urlField,
		description: 'The URL to crawl and extract from asynchronously',
		displayOptions: {
			show: {
				operation: ['submitLlmJob'],
			},
		},
	},
	{
		displayName: 'Extraction Query',
		name: 'extractionQuery',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Extract the article title, author, and publication date',
		typeOptions: {
			rows: 4,
		},
		description: 'Natural language prompt describing what to extract from the page',
		displayOptions: {
			show: {
				operation: ['submitLlmJob'],
			},
		},
	},
	{
		displayName: 'LLM Options',
		name: 'llmOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['submitLlmJob'],
			},
		},
		options: [
			{
				displayName: 'Provider Override',
				name: 'providerOverride',
				type: 'string',
				default: '',
				placeholder: 'openai/gpt-4o-mini',
				description: 'Override the LLM provider from credentials (e.g. openai/gpt-4o-mini, anthropic/claude-3-haiku-20240307)',
			},
			{
				displayName: 'Temperature',
				name: 'temperature',
				type: 'number',
				default: '',
				typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 2 },
				description: 'Sampling temperature (0 = deterministic, higher = more creative). Leave empty to use API default.',
			},
		],
	},
	...getWebhookFields(['submitLlmJob'], 'LLM'),
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
	const credentials = await this.getCredentials('crawl4aiPlusApi') as unknown as Crawl4aiApiCredentials;

	for (let i = 0; i < items.length; i++) {
		try {
			const url = normalizeUrlProtocol(this.getNodeParameter('url', i, '') as string);
			const query = this.getNodeParameter('extractionQuery', i, '') as string;
			const llmOptions = this.getNodeParameter('llmOptions', i, {}) as IDataObject;
			const webhookConfigOptions = this.getNodeParameter('webhookConfig', i, {}) as IDataObject;

			if (!url || !url.trim()) {
				throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
			}
			if (!isValidUrl(url)) {
				throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
			}
			if (!query || !query.trim()) {
				throw new NodeOperationError(this.getNode(), 'Extraction Query cannot be empty.', { itemIndex: i });
			}

			try {
				validateLlmCredentials(credentials, 'Submit LLM Job');
			} catch (err) {
				throw new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i });
			}

			// Build provider — use override if provided, else fall back to credentials
			let provider: string | undefined;
			if (llmOptions.providerOverride && String(llmOptions.providerOverride).trim()) {
				provider = String(llmOptions.providerOverride).trim();
			} else if (credentials.enableLlm) {
				const llmCfg = buildLlmConfig(credentials);
				provider = llmCfg.provider;
			}

			// Build webhook config if URL provided
			const webhookConfig = buildWebhookConfig(webhookConfigOptions);

			const taskId = await crawler.submitLlmJob({
				url: url.trim(),
				q: query.trim(),
				...(provider ? { provider } : {}),
				...(llmOptions.temperature !== undefined && llmOptions.temperature !== '' ? { temperature: Number(llmOptions.temperature) } : {}),
				...(webhookConfig ? { webhook_config: webhookConfig } : {}),
			});

			allResults.push({
				json: formatJobSubmission(taskId),
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
