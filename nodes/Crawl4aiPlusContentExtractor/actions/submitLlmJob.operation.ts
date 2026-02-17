import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions, LlmJobRequest, WebhookConfig } from '../../Crawl4aiPlusBasicCrawler/helpers/interfaces';
import { getCrawl4aiClient, isValidUrl, buildLlmConfig } from '../../Crawl4aiPlusBasicCrawler/helpers/utils';

// --- UI Definition ---
export const description: INodeProperties[] = [
  {
    displayName: 'URL',
    name: 'llmJobUrl',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'https://example.com/article',
    description: 'The URL to crawl and extract from asynchronously',
    displayOptions: {
      show: {
        operation: ['submitLlmJob'],
      },
    },
  },
  {
    displayName: 'Extraction Query',
    name: 'llmJobQuery',
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
    name: 'llmJobOptions',
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
        default: 0,
        typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 2 },
        description: 'Sampling temperature (0 = deterministic, higher = more creative)',
      },
    ],
  },
  {
    displayName: 'Webhook Config',
    name: 'llmJobWebhookConfig',
    type: 'collection',
    placeholder: 'Add Webhook',
    default: {},
    displayOptions: {
      show: {
        operation: ['submitLlmJob'],
      },
    },
    options: [
      {
        displayName: 'Webhook URL',
        name: 'webhookUrl',
        type: 'string',
        default: '',
        placeholder: 'https://your-n8n.com/webhook/...',
        description: 'URL to POST results to when the LLM job completes',
      },
      {
        displayName: 'Include Data in Payload',
        name: 'webhookDataInPayload',
        type: 'boolean',
        default: true,
        description: 'Whether to include extraction result data in the webhook payload',
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
      const url = this.getNodeParameter('llmJobUrl', i, '') as string;
      const query = this.getNodeParameter('llmJobQuery', i, '') as string;
      const llmOptions = this.getNodeParameter('llmJobOptions', i, {}) as IDataObject;
      const webhookConfigOptions = this.getNodeParameter('llmJobWebhookConfig', i, {}) as IDataObject;

      if (!url || !url.trim()) {
        throw new NodeOperationError(this.getNode(), 'URL cannot be empty.', { itemIndex: i });
      }
      if (!isValidUrl(url)) {
        throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
      }
      if (!query || !query.trim()) {
        throw new NodeOperationError(this.getNode(), 'Extraction Query cannot be empty.', { itemIndex: i });
      }

      const crawler = await getCrawl4aiClient(this);
      const credentials = await this.getCredentials('crawl4aiPlusApi') as any;

      // Build provider — use override if provided, else fall back to credentials
      let provider: string | undefined;
      if (llmOptions.providerOverride && String(llmOptions.providerOverride).trim()) {
        provider = String(llmOptions.providerOverride).trim();
      } else if (credentials.enableLlm) {
        const llmCfg = buildLlmConfig(credentials);
        provider = llmCfg.provider;
      }

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

      const llmJobRequest: LlmJobRequest = {
        url: url.trim(),
        q: query.trim(),
        ...(provider ? { provider } : {}),
        ...(llmOptions.temperature !== undefined ? { temperature: Number(llmOptions.temperature) } : {}),
        ...(webhookConfig ? { webhook_config: webhookConfig } : {}),
      };

      const taskId = await crawler.submitLlmJob(llmJobRequest);

      allResults.push({
        json: {
          task_id: taskId,
          submittedAt: new Date().toISOString(),
          url: url.trim(),
          message: 'LLM extraction job submitted. Use Get Job Status with the task_id to poll for results.',
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
