import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class Crawl4aiApi implements ICredentialType {
	name = 'crawl4aiApi';
	displayName = 'Crawl4AI API';
	documentationUrl = 'https://github.com/unclecode/crawl4ai';
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
			default: 'direct',
			description: 'The mode to connect to Crawl4AI'
		},
		// Docker Client Settings
		{
			displayName: 'Docker Server URL',
			name: 'dockerUrl',
			type: 'string',
			default: 'http://localhost:11235',
			placeholder: 'http://localhost:11235',
			description: 'The URL of the Crawl4AI Docker server',
			displayOptions: {
				show: {
					connectionMode: ['docker'],
				},
			},
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'boolean',
			default: false,
			description: 'Whether authentication is required for the Docker server',
			displayOptions: {
				show: {
					connectionMode: ['docker'],
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
					authentication: [true],
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
					authentication: [true],
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
			placeholder: 'provider/model',
			description: 'The custom provider in format "provider/model"',
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
			description: 'The API key for the custom provider',
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
