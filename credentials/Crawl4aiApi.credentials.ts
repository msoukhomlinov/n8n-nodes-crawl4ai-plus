import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class Crawl4aiApi implements ICredentialType {
	name = 'crawl4aiPlusApi';
	displayName = 'Crawl4AI Plus API';
	documentationUrl = 'https://github.com/msoukhomlinov/n8n-nodes-crawl4ai-plus';
	properties: INodeProperties[] = [
		// Docker REST API Settings
		{
			displayName: 'Docker Server URL',
			name: 'dockerUrl',
			type: 'string',
			default: 'http://crawl4ai:11235',
			placeholder: 'http://crawl4ai:11235',
			description: 'The URL of the Crawl4AI Docker REST API server. This node connects to Crawl4AI via Docker REST API.',
		},
		{
			displayName: 'Authentication Type',
			name: 'authenticationType',
			type: 'options',
			options: [
				{
					name: 'No Authentication',
					value: 'none',
					description: 'No authentication is required'
				},
				{
					name: 'Token Authentication',
					value: 'token',
					description: 'Use an API token for authentication'
				},
				{
					name: 'Username/Password Authentication',
					value: 'basic',
					description: 'Use username and password for authentication'
				},
			],
			default: 'none',
			description: 'The authentication method to use for the Docker REST API',
		},
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'The API token for Docker server authentication',
			displayOptions: {
				show: {
					authenticationType: ['token'],
				},
			},
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			description: 'The username for Docker server authentication',
			displayOptions: {
				show: {
					authenticationType: ['basic'],
				},
			},
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'The password for Docker server authentication',
			displayOptions: {
				show: {
					authenticationType: ['basic'],
				},
			},
		},
		// LLM Provider Settings
		{
			displayName: 'Enable LLM Features',
			name: 'enableLlm',
			type: 'boolean',
			default: false,
			description: 'Whether to enable LLM-based features',
		},
		{
			displayName: 'LLM Provider',
			name: 'llmProvider',
			type: 'options',
			options: [
				{
					name: 'OpenAI',
					value: 'openai',
				},
				{
					name: 'Ollama',
					value: 'ollama',
				},
				{
					name: 'Groq',
					value: 'groq',
				},
				{
					name: 'Anthropic',
					value: 'anthropic',
				},
				{
					name: 'LiteLLM / Custom',
					value: 'other',
				},
			],
			default: 'openai',
			description: 'The LLM provider to use for LLM-based features',
			displayOptions: {
				show: {
					enableLlm: [true],
				},
			},
		},
		{
			displayName: 'LLM Model ID',
			name: 'llmModel',
			type: 'string',
			default: 'gpt-4o',
			placeholder: 'gpt-4o-mini',
			description: 'Model identifier for the selected provider (e.g. gpt-4o-mini, claude-3-haiku, llama3-70b).',
			displayOptions: {
				show: {
					enableLlm: [true],
					llmProvider: ['openai', 'groq', 'anthropic'],
				},
			},
		},
		{
			displayName: 'Ollama Model ID',
			name: 'ollamaModel',
			type: 'string',
			default: 'llama3',
			placeholder: 'llama3.2',
			description: 'Model name served by your Ollama instance.',
			displayOptions: {
				show: {
					enableLlm: [true],
					llmProvider: ['ollama'],
				},
			},
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'The API key for the LLM provider',
			displayOptions: {
				show: {
					enableLlm: [true],
					llmProvider: ['openai', 'groq', 'anthropic'],
				},
			},
		},
		{
			displayName: 'Ollama URL',
			name: 'ollamaUrl',
			type: 'string',
			default: 'http://localhost:11434',
			description: 'The URL for Ollama server',
			displayOptions: {
				show: {
					enableLlm: [true],
					llmProvider: ['ollama'],
				},
			},
		},
		{
			displayName: 'Custom Provider',
			name: 'customProvider',
			type: 'string',
			default: '',
			placeholder: 'custom/llama-3-70b or provider/model',
			description: 'The custom provider in format "provider/model". Use "custom/" prefix for external LiteLLM proxies or custom endpoints (e.g., custom/llama-3-70b)',
			displayOptions: {
				show: {
					enableLlm: [true],
					llmProvider: ['other'],
				},
			},
		},
		{
			displayName: 'Custom Base URL',
			name: 'customBaseUrl',
			type: 'string',
			default: '',
			placeholder: 'https://litellm-proxy.company.com/v1',
			description: 'The base URL for your custom LLM provider, external LiteLLM proxy server, or custom inference endpoint. Required for external providers.',
			displayOptions: {
				show: {
					enableLlm: [true],
					llmProvider: ['other'],
				},
			},
		},
		{
			displayName: 'Custom Provider API Key',
			name: 'customApiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'The API key for the custom provider or LiteLLM proxy server',
			displayOptions: {
				show: {
					enableLlm: [true],
					llmProvider: ['other'],
				},
			},
		},
		// Cache Settings
		{
			displayName: 'Cache Directory',
			name: 'cacheDir',
			type: 'string',
			default: '',
			placeholder: '/path/to/cache',
			description: 'The directory to store cache files (leave empty for default)',
		},
	];
}
