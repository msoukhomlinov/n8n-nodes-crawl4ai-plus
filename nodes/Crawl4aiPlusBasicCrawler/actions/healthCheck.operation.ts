import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Crawl4aiNodeOptions } from '../helpers/interfaces';
import { getCrawl4aiClient } from '../helpers/utils';

// --- UI Definition ---
export const description: INodeProperties[] = [
  // No parameters — server URL comes from credentials
  {
    displayName: 'Health Check has no additional parameters. The server URL and auth are taken from credentials.',
    name: 'healthCheckNotice',
    type: 'notice',
    default: '',
    displayOptions: {
      show: {
        operation: ['healthCheck'],
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
      const crawler = await getCrawl4aiClient(this);
      const credentials = await this.getCredentials('crawl4aiPlusApi') as any;
      const checkedAt = new Date().toISOString();

      let healthData: IDataObject = {};
      let endpointStats: IDataObject = {};
      let healthError: string | undefined;
      let statsError: string | undefined;

      try {
        const health = await crawler.getMonitorHealth();
        healthData = {
          status: health.status,
          memoryPercent: health.memory_percent,
          cpuPercent: health.cpu_percent,
          uptimeSeconds: health.uptime_seconds,
          activeRequests: health.active_requests,
          ...(health.pool_info ? { poolInfo: health.pool_info } : {}),
        };
      } catch (err) {
        healthError = (err as Error).message;
      }

      try {
        endpointStats = await crawler.getEndpointStats() as IDataObject;
      } catch (err) {
        statsError = (err as Error).message;
      }

      allResults.push({
        json: {
          serverUrl: credentials.dockerUrl || 'http://crawl4ai:11235',
          checkedAt,
          ...healthData,
          ...(healthError ? { healthError } : {}),
          endpointStats,
          ...(statsError ? { statsError } : {}),
        } as IDataObject,
        pairedItem: { item: i },
      });
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
