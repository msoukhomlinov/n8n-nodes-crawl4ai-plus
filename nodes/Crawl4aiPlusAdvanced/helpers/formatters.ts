import { IDataObject } from 'n8n-workflow';

// Re-export shared formatters
export { formatCrawlResult, formatExtractionResult, parseExtractedJson } from '../../shared/formatters';

/**
 * Format job submission response for async operations
 */
export function formatJobSubmission(taskId: string): IDataObject {
  return {
    taskId,
    status: 'pending',
    submittedAt: new Date().toISOString(),
  };
}
