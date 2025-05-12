import { IDataObject } from 'n8n-workflow';

// Updated interface for credentials
export interface Crawl4aiApiCredentials {
	connectionMode: 'direct' | 'docker';
	// Docker settings
	dockerUrl?: string;
	authenticationType?: 'none' | 'token' | 'basic';
	apiToken?: string;
	username?: string;
	password?: string;
	// LLM settings
	enableLlm?: boolean;
	llmProvider?: string;
	apiKey?: string;
	ollamaUrl?: string;
	customProvider?: string;
	customApiKey?: string;
	// Cache settings
	cacheDir?: string;
}

// Node options interface
export interface Crawl4aiNodeOptions extends IDataObject {
	bypassCache?: boolean;
	includeMedia?: boolean;
	verboseResponse?: boolean;
	cacheMode?: 'enabled' | 'bypass' | 'only';
}

// Browser configuration interface
export interface BrowserConfig {
	headless?: boolean;
	javaScriptEnabled?: boolean;
	viewport?: {
		width: number;
		height: number;
	};
	timeout?: number;
	userAgent?: string;
}

// Crawler run configuration interface
export interface CrawlerRunConfig {
	cacheMode?: 'enabled' | 'bypass' | 'only';
	streamEnabled?: boolean;
	pageTimeout?: number;
	requestTimeout?: number;
	jsCode?: string | string[];
	jsOnly?: boolean;
	cssSelector?: string;
	excludedTags?: string[];
	excludeExternalLinks?: boolean;
	checkRobotsTxt?: boolean;
	wordCountThreshold?: number;
	sessionId?: string;
	maxRetries?: number;
	extractionStrategy?: any; // Will be defined based on extraction strategy
}

// Crawl result interface
export interface CrawlResult {
	url: string;
	success: boolean;
	statusCode?: number;
	title?: string;
	markdown?: string;
	html?: string;
	cleaned_html?: string;
	text?: string;
	links?: {
		internal: Link[];
		external: Link[];
	};
	media?: {
		images: Media[];
		videos: Media[];
	};
	extracted_content?: string;
	error_message?: string;
	crawl_time?: number;
	metadata?: Record<string, any>;
}

// Link interface
interface Link {
	href: string;
	text: string;
	title?: string;
}

// Media interface
interface Media {
	src: string;
	alt?: string;
	title?: string;
	type?: string;
}

// CSS Selector Schema Field
export interface CssSelectorField {
	name: string;
	selector: string;
	type: 'text' | 'attribute' | 'html';
	attribute?: string;
}

// CSS Selector Schema
export interface CssSelectorSchema {
	name: string;
	baseSelector: string;
	fields: CssSelectorField[];
}

// LLM Extraction Schema Field
export interface LlmSchemaField {
	name: string;
	type: string;
	description?: string;
}

// LLM Extraction Schema
export interface LlmSchema {
	title?: string;
	type: 'object';
	properties: Record<string, LlmSchemaField>;
	required?: string[];
}
