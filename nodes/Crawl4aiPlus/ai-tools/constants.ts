export const ALL_OPERATIONS = [
	'crawl', 'askQuestion', 'extractWithLlm', 'extractWithCss',
	'extractSeo', 'discoverLinks', 'healthCheck',
] as const;

export type AiToolOperation = typeof ALL_OPERATIONS[number];
