import { NodeOperationError } from 'n8n-workflow';
import type {
	NodeConnectionType, IDataObject, IExecuteFunctions,
	INodeType, INodeTypeDescription, INodeExecutionData,
	ISupplyDataFunctions, SupplyData,
} from 'n8n-workflow';
import { executeAiTool } from './ai-tools/tool-executor';
import { buildUnifiedDescription } from './ai-tools/description-builders';
import { getRuntimeSchemaBuilders } from './ai-tools/schema-generator';
import { RuntimeDynamicStructuredTool, runtimeZod } from './ai-tools/runtime';
import { wrapError, ERROR_TYPES } from './ai-tools/error-formatter';
import { ALL_OPERATIONS } from './ai-tools/constants';

const runtimeSchemas = getRuntimeSchemaBuilders(runtimeZod);

function parseToolResult(resultJson: string): IDataObject {
	try { return JSON.parse(resultJson) as IDataObject; }
	catch {
		return {
			schemaVersion: '1',
			success: false,
			operation: 'unknown',
			resource: 'crawl4ai',
			error: {
				errorType: 'INTERNAL_ERROR',
				message: 'Tool returned unparseable response',
				nextAction: 'This is a bug in the tool node. Report it to the developer.',
			},
			_rawResponse: typeof resultJson === 'string' ? resultJson.substring(0, 500) : String(resultJson),
		} as unknown as IDataObject;
	}
}

export class Crawl4aiPlusAiTools implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Crawl4AI Plus AI Tools',
		name: 'crawl4aiPlusAiTools',
		icon: 'file:crawl4aiplus.svg',
		group: ['output'],
		version: 1,
		description: 'Expose Crawl4AI web crawling and extraction as AI tools for AI Agent and MCP Trigger',
		defaults: { name: 'Crawl4AI Plus AI Tools' },
		usableAsTool: true,
		inputs: [],
		outputs: [{ type: 'ai_tool' as NodeConnectionType, displayName: 'Tools' }],
		credentials: [{ name: 'crawl4aiPlusApi', required: true }],
		properties: [
			{
				displayName: 'Note: Operations that use LLM (Ask Question, Extract with LLM) require LLM to be enabled in the Crawl4AI credentials.',
				name: 'llmNotice',
				type: 'notice',
				default: '',
			},
		],
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async supplyData(this: ISupplyDataFunctions, _itemIndex: number): Promise<SupplyData> {
		const enabledOperations = ALL_OPERATIONS as readonly string[];

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const unifiedSchema = runtimeSchemas.buildUnifiedSchema('crawl4ai', [...enabledOperations]) as any;
		const unifiedDescription = buildUnifiedDescription([...enabledOperations]);

		// Tool name complies with MCP regex ^[a-zA-Z0-9_-]{1,128}$
		const toolName = 'crawl4ai';

		const unifiedTool = new RuntimeDynamicStructuredTool({
			name: toolName,
			description: unifiedDescription,
			schema: unifiedSchema,
			func: async (params: Record<string, unknown>) => {
				const operationFromArgs = params.operation;
				const operation = typeof operationFromArgs === 'string' ? operationFromArgs : undefined;

				if (!operation || !enabledOperations.includes(operation)) {
					return JSON.stringify(wrapError(
						'crawl4ai', (operationFromArgs as string) ?? 'unknown',
						ERROR_TYPES.INVALID_OPERATION,
						'Missing or unsupported operation.',
						`Allowed operations: ${enabledOperations.join(', ')}.`,
					));
				}

				const { operation: _op, ...operationParams } = params;
				void _op;
				return executeAiTool(this, operation, operationParams);
			},
		});

		return { response: unifiedTool };
	}

	/**
	 * execute() serves two purposes:
	 * 1. "Test step" in the editor — no tool/operation field, return friendly stub
	 * 2. Real tool invocation (n8n 2.14+ routes tool calls here with params in item.json)
	 */
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		// Detect real tool invocation vs "Test step" in the editor.
		// n8n 2.14+ routes tool calls through execute() with params in item.json
		// (including 'operation'). Older n8n versions set a 'tool' field. If neither
		// is present, this is an editor test step — return a friendly stub.
		const firstItem = items[0]?.json ?? {};
		const hasToolCall = !!(firstItem['tool'] || firstItem['operation']);
		if (!hasToolCall) {
			return [[{
				json: {
					message: 'This is an AI Tool node. Connect it to an AI Agent node to use it.',
					configured: { operations: ALL_OPERATIONS },
				},
				pairedItem: { item: 0 },
			}]];
		}

		const response: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const item = items[itemIndex];
			if (!item) continue;

			const requestedOp = item.json.operation as string | undefined;

			// Validate operation
			if (requestedOp && !(ALL_OPERATIONS as readonly string[]).includes(requestedOp)) {
				response.push({
					json: parseToolResult(JSON.stringify(wrapError(
						'crawl4ai', requestedOp, ERROR_TYPES.INVALID_OPERATION,
						`Operation '${requestedOp}' is not supported.`,
						`Use one of: ${ALL_OPERATIONS.join(', ')}`,
					))),
					pairedItem: { item: itemIndex },
				});
				continue;
			}

			if (!requestedOp) {
				response.push({
					json: parseToolResult(JSON.stringify(wrapError(
						'crawl4ai', 'unknown', ERROR_TYPES.MISSING_REQUIRED_FIELD,
						'No operation specified.',
						`Provide an operation field. Use one of: ${ALL_OPERATIONS.join(', ')}`,
					))),
					pairedItem: { item: itemIndex },
				});
				continue;
			}
			const effectiveOp = requestedOp;

			try {
				const resultJson = await executeAiTool(this, effectiveOp, item.json as Record<string, unknown>);
				response.push({ json: parseToolResult(resultJson), pairedItem: { item: itemIndex } });
			} catch (error) {
				throw new NodeOperationError(this.getNode(), error instanceof Error ? error.message : String(error), { itemIndex });
			}
		}

		return [response];
	}
}
