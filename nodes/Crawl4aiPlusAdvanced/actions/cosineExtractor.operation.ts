import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions, ExtractionStrategy, FullCrawlConfig } from '../helpers/interfaces';
import {
	getCrawl4aiClient,
	createBrowserConfig,
	createCrawlerRunConfig,
	cleanExtractedData,
	isValidUrl,
} from '../../shared/utils';
import { formatExtractionResult, parseExtractedJson } from '../../shared/formatters';
import {
	urlField,
	getBrowserSessionFields,
	getCrawlSettingsFields,
} from '../../shared/descriptions';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: '',
		name: 'cosineNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				operation: ['cosineExtractor'],
			},
		},
		description: 'This operation requires the crawl4ai:all Docker image. The standard latest image does not include torch/sentence-transformers.',
	},
	{
		...urlField,
		description: 'The URL to extract content from using semantic similarity clustering',
		placeholder: 'https://example.com/reviews',
		displayOptions: {
			show: {
				operation: ['cosineExtractor'],
			},
		},
	},
	{
		displayName: 'Semantic Filter',
		name: 'semanticFilter',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'product reviews, user feedback',
		description: 'Keywords or topic to filter content semantically. Example: "pricing information", "technical specifications", "customer testimonials".',
		displayOptions: {
			show: {
				operation: ['cosineExtractor'],
			},
		},
	},
	{
		displayName: 'Clustering Options',
		name: 'clusteringOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['cosineExtractor'],
			},
		},
		options: [
			{
				displayName: 'Linkage Method',
				name: 'linkageMethod',
				type: 'options',
				options: [
					{
						name: 'Ward',
						value: 'ward',
						description: 'Minimises variance within clusters (recommended for most use cases)',
					},
					{
						name: 'Complete',
						value: 'complete',
						description: 'Uses maximum distances between clusters',
					},
					{
						name: 'Average',
						value: 'average',
						description: 'Uses average distances between all pairs',
					},
					{
						name: 'Single',
						value: 'single',
						description: 'Uses minimum distances between clusters',
					},
				],
				default: 'ward',
				description: 'Clustering algorithm linkage method for grouping similar content',
			},
			{
				displayName: 'Max Distance',
				name: 'maxDist',
				type: 'number',
				default: 0.2,
				typeOptions: {
					minValue: 0,
					maxValue: 1,
					numberPrecision: 2,
				},
				description: 'Maximum distance threshold for clustering (0.0 to 1.0). Lower values create tighter clusters.',
			},
			{
				displayName: 'Model Name',
				name: 'modelName',
				type: 'string',
				default: 'sentence-transformers/all-MiniLM-L6-v2',
				placeholder: 'sentence-transformers/all-MiniLM-L6-v2',
				description: 'Sentence transformer model for generating embeddings. Use multilingual models for non-English content.',
			},
			{
				displayName: 'Similarity Threshold',
				name: 'simThreshold',
				type: 'number',
				default: 0.3,
				typeOptions: {
					minValue: 0,
					maxValue: 1,
					numberPrecision: 2,
				},
				description: 'Minimum similarity score for content to be included (0.0 to 1.0). Higher values = stricter matching.',
			},
			{
				displayName: 'Top K Clusters',
				name: 'topK',
				type: 'number',
				default: 3,
				typeOptions: {
					minValue: 1,
				},
				description: 'Number of top-ranked content clusters to return',
			},
			{
				displayName: 'Verbose',
				name: 'verbose',
				type: 'boolean',
				default: false,
				description: 'Whether to enable detailed logging for debugging clustering behaviour',
			},
			{
				displayName: 'Word Count Threshold',
				name: 'wordCountThreshold',
				type: 'number',
				default: 10,
				typeOptions: {
					minValue: 1,
				},
				description: 'Minimum number of words per content block to be included in clustering',
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['cosineExtractor'],
			},
		},
		options: [
			{
				displayName: 'Clean Extracted Text',
				name: 'cleanText',
				type: 'boolean',
				default: false,
				description: 'Whether to normalise whitespace in all extracted string values',
			},
			{
				displayName: 'Include Full Text',
				name: 'includeFullText',
				type: 'boolean',
				default: false,
				description: 'Whether to include the full crawled markdown text in the output',
			},
		],
	},
	...getBrowserSessionFields(['cosineExtractor']),
	...getCrawlSettingsFields(['cosineExtractor']),
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

	for (let i = 0; i < items.length; i++) {
		try {
			const url = this.getNodeParameter('url', i, '') as string;
			const semanticFilter = this.getNodeParameter('semanticFilter', i, '') as string;
			const co = this.getNodeParameter('clusteringOptions', i, {}) as IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const bs = this.getNodeParameter('browserSession', i, {}) as IDataObject;
			const cs = this.getNodeParameter('crawlSettings', i, {}) as IDataObject;

			if (!url || !isValidUrl(url)) {
				throw new NodeOperationError(this.getNode(), 'Please provide a valid URL.', { itemIndex: i });
			}

			if (!semanticFilter || semanticFilter.trim().length === 0) {
				throw new NodeOperationError(
					this.getNode(),
					'Semantic Filter is required for CosineStrategy. Provide keywords or topics to guide content clustering.',
					{ itemIndex: i },
				);
			}

			// Build CosineStrategy config inline (no shared helper exists)
			const strategyParams: Record<string, unknown> = { semantic_filter: semanticFilter };

			if (co.wordCountThreshold !== undefined) strategyParams.word_count_threshold = Number(co.wordCountThreshold);
			if (co.maxDist !== undefined) strategyParams.max_dist = Number(co.maxDist);
			if (co.simThreshold !== undefined) strategyParams.sim_threshold = Number(co.simThreshold);
			if (co.topK !== undefined) strategyParams.top_k = Number(co.topK);
			if (co.linkageMethod) strategyParams.linkage_method = String(co.linkageMethod);
			if (co.modelName) strategyParams.model_name = String(co.modelName);
			if (co.verbose !== undefined) strategyParams.verbose = Boolean(co.verbose);

			const extractionStrategy: ExtractionStrategy = { type: 'CosineStrategy', params: strategyParams };

			const config: FullCrawlConfig = {
				...createBrowserConfig(bs),
				...createCrawlerRunConfig(cs),
				extractionStrategy,
			};

			const fetchedAt = new Date().toISOString();
			const result = await crawler.crawlUrl(url, config);

			let extractedData = parseExtractedJson(result);

			if (options.cleanText === true && extractedData) {
				extractedData = cleanExtractedData(extractedData) as IDataObject;
			}

			const formattedResult = formatExtractionResult(result, extractedData, {
				fetchedAt,
				extractionStrategy: 'CosineStrategy',
				includeFullText: options.includeFullText as boolean,
				includeLinks: true,
			});

			allResults.push({
				json: formattedResult,
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
