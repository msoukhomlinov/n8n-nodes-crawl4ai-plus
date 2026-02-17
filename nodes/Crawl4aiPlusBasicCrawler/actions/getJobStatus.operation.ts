import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions, CrawlResult } from '../helpers/interfaces';
import { getCrawl4aiClient } from '../helpers/utils';
import { formatCrawlResult } from '../helpers/formatters';

// --- UI Definition ---
export const description: INodeProperties[] = [
  {
    displayName: 'Task ID',
    name: 'taskId',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'abc123-...',
    description: 'The task_id returned from Submit Crawl Job or Submit LLM Job',
    displayOptions: {
      show: {
        operation: ['getJobStatus'],
      },
    },
  },
];

// --- Execution Logic ---
export async function execute(
  this: IExecuteFunctions,
  items: INodeExecutionData[],
  _nodeOptions: Crawl4aiNodeOptions,
): Promise<INodeExecutionData[]> {
  const allResults: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    try {
      const taskId = this.getNodeParameter('taskId', i, '') as string;

      if (!taskId || !taskId.trim()) {
        throw new NodeOperationError(this.getNode(), 'Task ID cannot be empty.', { itemIndex: i });
      }

      const crawler = await getCrawl4aiClient(this);
      const statusResponse = await crawler.getJobStatus(taskId.trim());
      const checkedAt = new Date().toISOString();

      // If completed and result data available, format the crawl results
      if (statusResponse.status === 'completed' && statusResponse.result) {
        const rawResults = Array.isArray(statusResponse.result)
          ? statusResponse.result as CrawlResult[]
          : [statusResponse.result as CrawlResult];

        for (const result of rawResults) {
          const formatted = formatCrawlResult(result, {
            includeLinks: true,
            fetchedAt: checkedAt,
          });
          allResults.push({
            json: {
              ...formatted,
              task_id: statusResponse.task_id,
              status: statusResponse.status,
              checkedAt,
            } as IDataObject,
            pairedItem: { item: i },
          });
        }
      } else {
        allResults.push({
          json: {
            task_id: statusResponse.task_id,
            status: statusResponse.status,
            checkedAt,
            ...(statusResponse.message ? { message: statusResponse.message } : {}),
          } as IDataObject,
          pairedItem: { item: i },
        });
      }
    } catch (error) {
      if (this.continueOnFail()) {
        allResults.push({
          json: items[i].json,
          error: new NodeOperationError(this.getNode(), (error as Error).message, {
            itemIndex: (error as any).itemIndex ?? i,
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
