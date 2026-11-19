// ─────────────────────────────────────────────────────────────
// Paperclip MERN — Shared TypeScript Types
// Strictly aligned with Document 5 (Backend Database Schema)
// and Document 2 (Technical Requirements Document)
// ─────────────────────────────────────────────────────────────

// ── Enums ──────────────────────────────────────────────────

export type IssueStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'blocked'
  | 'cancelled';

export type IssuePriority = 'low' | 'medium' | 'high' | 'urgent';

export type AgentRole =
  | 'ceo'
  | 'cto'
  | 'engineer'
  | 'researcher'
  | 'marketer'
  | 'qa'
  | 'general';

export type AgentStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'budget_stopped'
  | 'error'
  | 'terminated';

export type AgentAdapterType = 'groq_llm' | 'gemini_llm' | 'http_webhook';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type ApprovalType = 'hire_agent' | 'strategy_plan' | 'budget_override';

export type HeartbeatRunStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'budget_stopped'
  | 'stalled';

export type WakeupTrigger =
  | 'manual'
  | 'assignment'
  | 'mention'
  | 'cron'
  | 'approval_resolved';

export type DeliverableKind = 'link' | 'markdown' | 'file';

export type AuthorType = 'user' | 'agent' | 'system';

// ── Sub-document Interfaces ────────────────────────────────

/** Single acceptance criterion on an Issue (Document 5 - §2.6) */
export interface AcceptanceCriterion {
  _id?: string;
  text: string;
  completed: boolean;
  /** Optional alias for convenience */
  met?: boolean;
}

/** Deliverable attachment on an Issue (Document 5 - §2.6) */
export interface Deliverable {
  _id?: string;
  kind: DeliverableKind;
  label?: string;
  url: string;                  // URL, Cloudinary secure_url, or raw markdown link
  mimeType?: string;
  byteSize?: number;
}

// ── Core Models ────────────────────────────────────────────

export interface User {
  _id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  _id: string;
  name: string;
  description?: string;
  issuePrefix: string;         // e.g. "PAP"
  issueCounter: number;        // atomic $inc counter
  budgetMonthlyCents: number;  // $5.00 default (500)
  spentMonthlyMicrocents: number;
  requireHireApproval: boolean;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  _id: string;
  companyId: string;
  name: string;
  role: AgentRole;
  title?: string;
  reportsTo?: string | null;    // parent agent _id
  instructionsMarkdown: string;
  adapterType: AgentAdapterType;
  adapterConfig: {
    model?: string;
    webhookUrl?: string;
    secretKeyName?: string;
    heartbeatCron?: string;
    autoHeartbeatEnabled?: boolean;
  };
  status: AgentStatus;
  budgetMonthlyCents: number;
  spentMonthlyMicrocents: number;
  lastHeartbeatAt?: string | null;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  _id: string;
  companyId: string;
  parentGoalId?: string | null;
  title: string;
  description?: string;
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface Issue {
  _id: string;
  companyId: string;
  identifier: string;           // e.g. "PAP-1"
  issueKey?: string;            // alias for identifier
  title: string;
  description?: string;
  status: IssueStatus;
  priority: IssuePriority;
  goalId?: string | null;
  goal?: Goal | null;
  parentIssueId?: string | null;
  assigneeAgentId?: string | null;
  assignee?: Agent | null;
  acceptanceCriteria: AcceptanceCriterion[];
  deliverables: Deliverable[];
  lastHydratedCommentCount: number;
  lockedByRunId?: string | null;
  lockExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueComment {
  _id: string;
  companyId: string;
  issueId: string;
  authorType: AuthorType;
  authorId: string;
  authorName?: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
}

export interface HeartbeatRun {
  _id: string;
  companyId: string;
  agentId: string;
  agent?: Agent | null;
  issueId?: string | null;
  issue?: Issue | null;
  triggerType: WakeupTrigger | string;
  status: HeartbeatRunStatus;
  logs: RunLogEntry[];
  inputTokens: number;
  outputTokens: number;
  costMicrocents: number;
  startedAt: string;
  finishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RunLogEntry {
  ts: string;
  level: 'INFO' | 'SYSTEM' | 'THOUGHT' | 'LLM_THOUGHT' | 'TOOL_CALL' | 'BUDGET' | 'ERROR' | 'SUCCESS';
  message: string;
}

export interface Approval {
  _id: string;
  companyId: string;
  type: ApprovalType;
  requestedByAgentId: string;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  decisionNote?: string;
  decidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── API Payloads & Contracts ───────────────────────────────

export interface QaReviewRequest {
  passed: boolean;
  feedback?: string;
}

export interface CloudinarySignResponse {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder?: string;
}

export interface PlanGenerateRequest {
  goalId?: string;
  objective: string;
  context?: string;
  agentId?: string;
}

export interface PlanTask {
  title: string;
  description: string;
  priority: IssuePriority;
  assigneeAgentId?: string;
  assigneeName?: string;
  acceptanceCriteria: string[];
  estimatedMicrocents?: number;
}

export interface PlanGenerateResponse {
  plan: {
    objective: string;
    tasks: PlanTask[];
    estimatedTotalMicrocents?: number;
  };
  runId?: string;
}

export interface IssueFilters {
  status?: IssueStatus | IssueStatus[];
  assigneeAgentId?: string;
  goalId?: string;
  search?: string;
}
