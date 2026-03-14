import type { INodeProperties, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { Crawl4aiNodeOptions } from '../../shared/interfaces';

import * as getPageContent from './getPageContent.operation';
import * as askQuestion from './askQuestion.operation';
import * as extractData from './extractData.operation';
import * as cssExtractor from './cssExtractor.operation';

type OperationExecuteFunction = (
	this: IExecuteFunctions,
	items: INodeExecutionData[],
	nodeOptions: Crawl4aiNodeOptions,
) => Promise<INodeExecutionData[]>;

export const operations: { [key: string]: OperationExecuteFunction } = {
	getPageContent: getPageContent.execute,
	askQuestion: askQuestion.execute,
	extractData: extractData.execute,
	cssExtractor: cssExtractor.execute,
};

export const operationDescriptions: INodeProperties[] = [
	...getPageContent.description,
	...askQuestion.description,
	...extractData.description,
	...cssExtractor.description,
];
