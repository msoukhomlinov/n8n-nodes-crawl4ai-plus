import {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
} from 'n8n-workflow';

import type { Crawl4aiApiCredentials } from '../shared/interfaces';
import { router } from './actions/router';
import { description as operationsDescription } from './actions/operations';

export class Crawl4aiPlusAdvanced implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Crawl4AI Plus Advanced',
		name: 'crawl4aiPlusAdvanced',
		icon: 'file:crawl4aiplus.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Advanced web crawling and extraction with full Crawl4AI API control',
		defaults: {
			name: 'Crawl4AI Plus Advanced',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'crawl4aiPlusApi',
				required: true,
			},
		],
		properties: [
			...operationsDescription,
		],
	};

	methods = {
		loadOptions: {
			async getLlmModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const credentials = (await this.getCredentials('crawl4aiPlusApi')) as unknown as Crawl4aiApiCredentials;
					if (!credentials.enableLlm) return [];

					const provider = credentials.llmProvider as string;

					if (provider === 'openai') {
						const response = await this.helpers.httpRequest({
							method: 'GET',
							url: 'https://api.openai.com/v1/models',
							headers: { Authorization: `Bearer ${credentials.apiKey}` },
						}) as { data: Array<{ id: string }> };
						return response.data
							.map((m) => ({ name: m.id, value: m.id }))
							.sort((a, b) => a.name.localeCompare(b.name));
					}

					if (provider === 'groq') {
						const response = await this.helpers.httpRequest({
							method: 'GET',
							url: 'https://api.groq.com/openai/v1/models',
							headers: { Authorization: `Bearer ${credentials.apiKey}` },
						}) as { data: Array<{ id: string }> };
						return response.data
							.map((m) => ({ name: m.id, value: m.id }))
							.sort((a, b) => a.name.localeCompare(b.name));
					}

					if (provider === 'ollama') {
						const baseUrl = credentials.ollamaUrl || 'http://localhost:11434';
						const response = await this.helpers.httpRequest({
							method: 'GET',
							url: `${baseUrl}/api/tags`,
						}) as { models: Array<{ name: string }> };
						return (response.models || [])
							.map((m) => ({ name: m.name, value: m.name }))
							.sort((a, b) => a.name.localeCompare(b.name));
					}

					if (provider === 'other') {
						const baseUrl = credentials.customBaseUrl;
						if (!baseUrl) return [];
						const headers: Record<string, string> = {};
						if (credentials.customApiKey) {
							headers.Authorization = `Bearer ${credentials.customApiKey}`;
						}
						const response = await this.helpers.httpRequest({
							method: 'GET',
							url: `${baseUrl}/models`,
							headers,
						}) as { data: Array<{ id: string }> };
						return (response.data || [])
							.map((m) => ({ name: m.id, value: m.id }))
							.sort((a, b) => a.name.localeCompare(b.name));
					}

					if (provider === 'anthropic') {
						return [
							{ name: 'claude-opus-4-5-20251101', value: 'claude-opus-4-5-20251101' },
							{ name: 'claude-sonnet-4-5-20251022', value: 'claude-sonnet-4-5-20251022' },
							{ name: 'claude-haiku-4-5-20251001', value: 'claude-haiku-4-5-20251001' },
							{ name: 'claude-3-5-sonnet-20241022', value: 'claude-3-5-sonnet-20241022' },
							{ name: 'claude-3-5-haiku-20241022', value: 'claude-3-5-haiku-20241022' },
							{ name: 'claude-3-opus-20240229', value: 'claude-3-opus-20240229' },
							{ name: 'claude-3-haiku-20240307', value: 'claude-3-haiku-20240307' },
						].sort((a, b) => a.name.localeCompare(b.name));
					}

					return [];
				} catch {
					return [];
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await router.call(this);
	}
}
