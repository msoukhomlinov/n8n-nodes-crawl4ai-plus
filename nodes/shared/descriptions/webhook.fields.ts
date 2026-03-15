import { INodeProperties } from 'n8n-workflow';

/**
 * Returns a "Webhook Config" collection with fields for webhook URL, headers, and payload toggle.
 * Used by submitCrawlJob and submitLlmJob operations.
 *
 * @param operations - operation values for which this collection is shown
 * @param jobType - type of job for description text (e.g., 'crawl', 'LLM')
 */
export function getWebhookFields(operations: string[], jobType = 'crawl'): INodeProperties[] {
	return [
		{
			displayName: 'Webhook Config',
			name: 'webhookConfig',
			type: 'collection',
			placeholder: 'Add Webhook',
			default: {},
			displayOptions: {
				show: {
					operation: operations,
				},
			},
			options: [
				{
					displayName: 'Include Data in Payload',
					name: 'webhookDataInPayload',
					type: 'boolean',
					default: true,
					description: `Whether to include ${jobType} result data directly in the webhook payload`,
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
				{
					displayName: 'Webhook URL',
					name: 'webhookUrl',
					type: 'string',
					default: '',
					placeholder: 'https://your-n8n.com/webhook/...',
					description: `URL to POST results to when the ${jobType} job completes`,
				},
			],
		},
	];
}
