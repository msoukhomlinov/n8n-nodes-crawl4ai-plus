import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class Crawl4aiApi implements ICredentialType {
	name = 'crawl4aiPlusApi';
	displayName = 'Crawl4AI Plus API';
	documentationUrl = 'https://github.com/msoukhomlinov/n8n-nodes-crawl4ai';
	properties: INodeProperties[] = [
		// Connection Mode
		{
			displayName: 'Connection Mode',
			name: 'connectionMode',
			type: 'options',
			options: [
				{
					name: 'Direct Python Package',
					value: 'direct',
					description: 'Use Crawl4AI directly as a Python package'
				},
				{
					name: 'Docker Client',
					value: 'docker',
					description: 'Connect to a Crawl4AI Docker container'
				},
			],
			default: 'docker',
			description: 'The mode to connect to Crawl4AI'
		},
		// Docker Client Settings
		{
			displayName: 'Docker Server URL',
			name: 'dockerUrl',
			type: 'string',
			default: 'http://crawl4ai:11235',
			placeholder: 'http://crawl4ai:11235',
			description: 'The URL of the Crawl4AI Docker server',
			displayOptions: {
				show: {
					connectionMode: ['docker'],
				},
			},
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
			default: 'token',
			description: 'The authentication method to use',
			displayOptions: {
				show: {
					connectionMode: ['docker'],
				},
			},
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
					connectionMode: ['docker'],
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
					connectionMode: ['docker'],
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
					connectionMode: ['docker'],
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
					name: 'Other',
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
