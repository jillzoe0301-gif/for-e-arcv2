import type { BatchStatus, CaseStatus } from '../types';
import { batchStatusLabels, caseStatusLabels } from '../utils/status';

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return <span className={`status-badge status-${status}`}>{caseStatusLabels[status]}</span>;
}

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  return <span className={`status-badge batch-${status}`}>{batchStatusLabels[status]}</span>;
}
