// ─────────────────────────────────────────────────────────────
// Paperclip MERN — API Client Helpers
// Wraps fetch with Bearer-token auth, VITE_API_URL base URL,
// Render Free-Tier Cold-Start detection (>3s), and offline mock
// store fallback for local frontend evaluation.
// ─────────────────────────────────────────────────────────────

import type {
  Issue,
  Agent,
  Goal,
  Company,
  IssueComment,
  HeartbeatRun,
  PlanGenerateResponse,
} from '../types/models';

export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export function getApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/** Retrieve JWT from localStorage */
function getToken(): string | null {
  return localStorage.getItem('token');
}

/** Build standard headers with Bearer auth */
function authHeaders(extra: Record<string, string> = {}): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/** Ping /api/health to verify control plane readiness */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(getApiUrl('/api/health'), { method: 'GET' });
    if (res.ok) {
      window.dispatchEvent(
        new CustomEvent('api:cold-start', { detail: { active: false } }),
      );
      return true;
    }
  } catch {
    // Still waking up
  }
  return false;
}

// ── In-Memory Demo Data Store (Document 6 - Day 13 Demo Seed) ──

let mockCompanies: Company[] = [
  {
    _id: 'demo_company_1',
    name: 'Forge AI',
    description: 'Autonomous AI workforce control plane',
    issuePrefix: 'FORGE',
    issueCounter: 3,
    budgetMonthlyCents: 500,
    spentMonthlyMicrocents: 415000,
    requireHireApproval: true,
    ownerUserId: 'user_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const DEMO_AGENTS: Agent[] = [
  {
    _id: 'agent_ceo',
    companyId: 'demo_company_1',
    name: 'Atlas (CEO)',
    role: 'ceo',
    title: 'Chief Executive Agent',
    adapterType: 'groq_llm',
    adapterConfig: { model: 'llama-3.3-70b-versatile' },
    status: 'idle',
    budgetMonthlyCents: 500,
    spentMonthlyMicrocents: 124000,
    instructionsMarkdown:
      'Coordinate team, break high-level goals into atomic tickets.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'agent_cto',
    companyId: 'demo_company_1',
    name: 'Ada (CTO)',
    role: 'cto',
    title: 'Chief Technical Agent',
    reportsTo: 'agent_ceo',
    adapterType: 'groq_llm',
    adapterConfig: { model: 'llama-3.3-70b-versatile' },
    status: 'running',
    budgetMonthlyCents: 300,
    spentMonthlyMicrocents: 185000,
    instructionsMarkdown:
      'Architect backend, enforce atomic locks and microcent accounting.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'agent_dev',
    companyId: 'demo_company_1',
    name: 'Nexus (Engineer)',
    role: 'engineer',
    title: 'Full-Stack Worker',
    reportsTo: 'agent_cto',
    adapterType: 'gemini_llm',
    adapterConfig: { model: 'gemini-2.5-flash' },
    status: 'idle',
    budgetMonthlyCents: 200,
    spentMonthlyMicrocents: 72000,
    instructionsMarkdown:
      'Implement components, write tests, attach deliverables.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'agent_qa',
    companyId: 'demo_company_1',
    name: 'Vigil (QA Gatekeeper)',
    role: 'qa',
    title: 'Quality & Governance Specialist',
    reportsTo: 'agent_cto',
    adapterType: 'groq_llm',
    adapterConfig: { model: 'llama-3.3-70b-versatile' },
    status: 'idle',
    budgetMonthlyCents: 150,
    spentMonthlyMicrocents: 34000,
    instructionsMarkdown:
      'Verify acceptance criteria and inspect deliverables before closing tickets.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const DEMO_GOALS: Goal[] = [
  {
    _id: 'goal_1',
    companyId: 'demo_company_1',
    title: 'Launch Paperclip MERN MVP on Free-Tier Cloud',
    description: 'Deploy control plane with $0 monthly operational budget.',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'goal_2',
    companyId: 'demo_company_1',
    title: 'Autonomous Multi-Agent Heartbeat Loop',
    description:
      'Verify 409 atomic lock contention and microcent circuit breakers.',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let mockIssues: Issue[] = [];
let mockComments: Record<string, IssueComment[]> = {};
let mockRuns: HeartbeatRun[] = [];

function seedDemoMockStore(companyId: string) {
  const prefix =
    mockCompanies.find((c) => c._id === companyId)?.issuePrefix || 'FORGE';
  const now = new Date().toISOString();
  const seededIssues: Issue[] = [
    {
      _id: `issue_seed_1_${Date.now()}`,
      companyId,
      issueKey: `${prefix}-1`,
      identifier: `${prefix}-1`,
      title: 'Architect zero-setup cloud AI adapters & atomic checkout lock',
      description:
        'Implement Groq and Gemini adapters with 5-minute checkout lease and 409 conflict handling.',
      status: 'todo',
      priority: 'high',
      goalId: 'goal_1',
      assigneeAgentId: 'agent_cto',
      acceptanceCriteria: [
        {
          id: 'ac1',
          text: 'Groq LLM adapter supports llama-3.3-70b JSON tool calls',
          completed: true,
        },
        {
          id: 'ac2',
          text: 'Atomic findOneAndUpdate locks ticket with 5-minute TTL',
          completed: false,
        },
        {
          id: 'ac3',
          text: 'Returns 409 Conflict if locked by concurrent run',
          completed: false,
        },
      ],
      deliverables: [],
      lastHydratedCommentCount: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: `issue_seed_2_${Date.now()}`,
      companyId,
      issueKey: `${prefix}-2`,
      identifier: `${prefix}-2`,
      title: 'Implement Delta-Only Comment Hydration & 30s Watchdog',
      description:
        'Only send unread comments to LLM prompt to save 70% tokens, and sweep stalled zombie runs.',
      status: 'in_review',
      priority: 'urgent',
      goalId: 'goal_2',
      assigneeAgentId: 'agent_dev',
      acceptanceCriteria: [
        {
          id: 'ac1',
          text: 'Track lastHydratedCommentCount per ticket',
          completed: true,
        },
        {
          id: 'ac2',
          text: 'Skip hydrated comments during prompt assembly',
          completed: true,
        },
      ],
      deliverables: [
        {
          type: 'url',
          title: 'Delta Hydration Benchmark Report',
          contentOrUrl: 'https://github.com/paperclipai/paperclip',
        },
      ],
      lastHydratedCommentCount: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: `issue_seed_3_${Date.now()}`,
      companyId,
      issueKey: `${prefix}-3`,
      identifier: `${prefix}-3`,
      title: 'Verify Microcent Budget Hard-Stop & Approvals Flow',
      description:
        'Ensure agents transition to budget_stopped at 100% cap and manager hire requests wait in Approvals.',
      status: 'backlog',
      priority: 'medium',
      goalId: 'goal_1',
      assigneeAgentId: 'agent_qa',
      acceptanceCriteria: [
        {
          id: 'ac1',
          text: 'Verify 80% warning and 100% hard-stop circuit breaker',
          completed: false,
        },
      ],
      deliverables: [],
      lastHydratedCommentCount: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];
  mockIssues = [...seededIssues, ...mockIssues];
  mockRuns = [
    {
      _id: 'run_sample_1',
      companyId,
      agentId: { _id: 'agent_cto', name: 'Ada (CTO)', role: 'cto' },
      targetIssueId: seededIssues[0],
      triggerType: 'assignment',
      status: 'completed',
      inputTokens: 1420,
      outputTokens: 380,
      costMicrocents: 2800,
      startedAt: new Date(Date.now() - 45000).toISOString(),
      logs: [
        {
          ts: new Date(Date.now() - 40000).toISOString(),
          level: 'SYSTEM',
          message: 'Heartbeat initialized. Adapter: Groq Llama 3.3 70B.',
        },
        {
          ts: new Date(Date.now() - 35000).toISOString(),
          level: 'THOUGHT',
          message: 'Inspecting target ticket and verifying 5-min checkout lease...',
        },
        {
          ts: new Date(Date.now() - 25000).toISOString(),
          level: 'TOOL',
          message: 'Executed atomic findOneAndUpdate checkout lock.',
        },
        {
          ts: new Date(Date.now() - 15000).toISOString(),
          level: 'BUDGET',
          message: 'Microcent check: 2,800 microcents consumed.',
        },
      ],
    },
    ...mockRuns,
  ];
  return seededIssues;
}

// ── Generic API Fetch with Cold-Start Watch & Mock Fallback ─

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response | undefined;
  let coldStartTriggered = false;

  const coldStartTimer = window.setTimeout(() => {
    coldStartTriggered = true;
    window.dispatchEvent(
      new CustomEvent('api:cold-start', { detail: { active: true } }),
    );
  }, 3000);

  try {
    response = await fetch(getApiUrl(path), {
      ...init,
      headers: authHeaders((init.headers as Record<string, string>) ?? {}),
    });
  } catch {
    // Backend offline / connecting to free tier cold start -> fall through to mock store.
  } finally {
    window.clearTimeout(coldStartTimer);
    if (coldStartTriggered && response?.ok) {
      window.dispatchEvent(
        new CustomEvent('api:cold-start', { detail: { active: false } }),
      );
    }
  }

  if (response?.ok) {
    return (await response.json()) as T;
  }
  if (
    response &&
    !(!getToken() && (response.status === 401 || response.status === 404))
  ) {
    const errorBody = await response.json().catch(() => ({}));
    if (response.status === 401 && getToken()) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('auth:logout'));
    }
    throw new ApiError(
      response.status,
      typeof errorBody.error === 'string'
        ? errorBody.error
        : `Request failed with status ${response.status}`,
    );
  }

  // ── Offline Demo Mock Router ──────────────────────────────
  // Companies list / create
  if (path === '/api/companies' && (!init.method || init.method === 'GET')) {
    return { companies: mockCompanies } as unknown as T;
  }
  if (path === '/api/companies' && init.method === 'POST') {
    const body = JSON.parse(String(init.body || '{}'));
    const created: Company = {
      _id: `company_${Date.now()}`,
      name: String(body.name || 'New Workspace'),
      description: String(body.description || ''),
      issuePrefix: String(body.issuePrefix || 'PAP').toUpperCase(),
      issueCounter: 0,
      budgetMonthlyCents: Number(body.budgetMonthlyCents ?? 500),
      spentMonthlyMicrocents: 0,
      requireHireApproval: body.requireHireApproval ?? true,
      ownerUserId: 'user_1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockCompanies = [created, ...mockCompanies];
    return { company: created } as unknown as T;
  }

  // Issues listing
  if (path.includes('/issues') && (!init.method || init.method === 'GET')) {
    return [...mockIssues] as unknown as T;
  }

  // Issue detail
  if (
    path.startsWith('/api/issues/') &&
    !path.includes('/comments') &&
    (!init.method || init.method === 'GET')
  ) {
    const issueId = path.split('/')[3];
    const found = mockIssues.find((i) => i._id === issueId);
    if (found) return found as unknown as T;
  }

  // Issue PATCH
  if (path.startsWith('/api/issues/') && init.method === 'PATCH') {
    const issueId = path.split('/')[3];
    const patch = JSON.parse(String(init.body || '{}'));
    mockIssues = mockIssues.map((i) =>
      i._id === issueId
        ? { ...i, ...patch, updatedAt: new Date().toISOString() }
        : i,
    );
    const updated = mockIssues.find((i) => i._id === issueId);
    return updated as unknown as T;
  }

  // Issue Atomic Checkout
  if (path.includes('/checkout') && init.method === 'POST') {
    const issueId = path.split('/')[3];
    const existing = mockIssues.find((i) => i._id === issueId);
    if (
      existing?.lockedByRunId &&
      existing.lockExpiresAt &&
      new Date(existing.lockExpiresAt).getTime() > Date.now()
    ) {
      throw new ApiError(409, 'Ticket already locked by another active run');
    }
    const runId = `run_${Date.now()}`;
    const lockExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    mockIssues = mockIssues.map((i) =>
      i._id === issueId
        ? { ...i, status: 'in_progress', lockedByRunId: runId, lockExpiresAt }
        : i,
    );
    const updated = mockIssues.find((i) => i._id === issueId);
    return { message: 'Lock acquired', issue: updated } as unknown as T;
  }

  // Issue Create
  if (path.endsWith('/issues') && init.method === 'POST') {
    const body = JSON.parse(String(init.body || '{}'));
    const cid = path.split('/')[3] || 'demo_company_1';
    const prefix =
      mockCompanies.find((c) => c._id === cid)?.issuePrefix || 'FORGE';
    const newIssue: Issue = {
      _id: `issue_${Date.now()}`,
      companyId: cid,
      issueKey: `${prefix}-${mockIssues.length + 1}`,
      identifier: `${prefix}-${mockIssues.length + 1}`,
      title: body.title || 'Untitled Issue',
      description: body.description || '',
      status: body.status || 'todo',
      priority: body.priority || 'medium',
      goalId: body.goalId || null,
      assigneeAgentId: body.assigneeAgentId || null,
      acceptanceCriteria: body.acceptanceCriteria || [],
      deliverables: body.deliverables || [],
      lastHydratedCommentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockIssues = [newIssue, ...mockIssues];
    return newIssue as unknown as T;
  }

  // QA Review
  if (path.includes('/qa-review') && init.method === 'POST') {
    const issueId = path.split('/')[3];
    const body = JSON.parse(String(init.body || '{}'));
    const targetStatus = body.passed ? 'done' : 'todo';
    mockIssues = mockIssues.map((i) =>
      i._id === issueId
        ? { ...i, status: targetStatus, lockedByRunId: null, lockExpiresAt: null }
        : i,
    );
    const updated = mockIssues.find((i) => i._id === issueId);
    return {
      issue: updated,
      message: `QA Review completed: ${targetStatus}`,
    } as unknown as T;
  }

  // Comments GET
  if (path.includes('/comments') && (!init.method || init.method === 'GET')) {
    const issueId = path.split('/')[3];
    return (mockComments[issueId] || []) as unknown as T;
  }

  // Comments POST
  if (path.includes('/comments') && init.method === 'POST') {
    const issueId = path.split('/')[3];
    const body = JSON.parse(String(init.body || '{}'));
    const newComment: IssueComment = {
      _id: `comm_${Date.now()}`,
      companyId: 'demo_company_1',
      issueId,
      authorType: body.authorType || 'user',
      authorId: body.authorId || 'user_1',
      authorName: body.authorName || 'Board Operator (You)',
      body: body.body || body.content || '',
      content: body.content || body.body || '',
      createdAt: new Date().toISOString(),
    };
    if (!mockComments[issueId]) mockComments[issueId] = [];
    mockComments[issueId].push(newComment);
    return newComment as unknown as T;
  }

  // Uploads Sign (Mock)
  if (path === '/api/uploads/sign' && init.method === 'POST') {
    return {
      mock: true,
      cloudName: 'demo-cloud',
      apiKey: 'mock-api-key',
      timestamp: Math.round(Date.now() / 1000),
      folder: 'paperclip_deliverables',
      signature: 'mock_signature',
    } as unknown as T;
  }

  // Agent config revision history
  if (
    /^\/api\/agents\/[^/]+\/revisions/.test(path) &&
    (!init.method || init.method === 'GET')
  ) {
    return [
      {
        _id: 'rev_initial',
        changedKeys: ['instructionsMarkdown', 'adapterType'],
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ] as unknown as T;
  }

  // Agent actions
  if (
    /^\/api\/agents\/[^/]+\/(pause|resume|invoke)$/.test(path) &&
    init.method === 'POST'
  ) {
    const [, , , agentId, action] = path.split('/');
    const agent = DEMO_AGENTS.find((item) => item._id === agentId);
    if (action === 'invoke') {
      return {
        status: 'queued',
        wakeupId: `wakeup_${Date.now()}`,
      } as unknown as T;
    }
    if (agent) {
      agent.status = action === 'pause' ? 'paused' : 'idle';
      agent.updatedAt = new Date().toISOString();
      return { agent } as unknown as T;
    }
    return {} as T;
  }

  // Agent config rollback
  if (
    /^\/api\/agents\/[^/]+\/revisions\/[^/]+\/rollback$/.test(path) &&
    init.method === 'POST'
  ) {
    const agentId = path.split('/')[3];
    const agent =
      DEMO_AGENTS.find((item) => item._id === agentId) || DEMO_AGENTS[0];
    return { ...agent, updatedAt: new Date().toISOString() } as unknown as T;
  }

  // Agent config updates
  if (/^\/api\/agents\/[^/]+$/.test(path) && init.method === 'PATCH') {
    const agentId = path.split('/')[3];
    const patch = JSON.parse(String(init.body || '{}'));
    const agent = DEMO_AGENTS.find((item) => item._id === agentId);
    const { heartbeatCron, ...agentPatch } = patch;
    const updated = {
      ...(agent || DEMO_AGENTS[0]),
      ...agentPatch,
      adapterConfig: {
        ...(agent || DEMO_AGENTS[0]).adapterConfig,
        ...(heartbeatCron !== undefined ? { heartbeatCron } : {}),
      },
      updatedAt: new Date().toISOString(),
    };
    const index = DEMO_AGENTS.findIndex((item) => item._id === agentId);
    if (index >= 0) DEMO_AGENTS[index] = updated;
    return updated as unknown as T;
  }

  // Hire an agent in the offline demo workspace
  if (
    /^\/api\/companies\/[^/]+\/agents$/.test(path) &&
    init.method === 'POST'
  ) {
    const body = JSON.parse(String(init.body || '{}'));
    const now = new Date().toISOString();
    const agent: Agent = {
      _id: `agent_${Date.now()}`,
      companyId: path.split('/')[3],
      name: body.name,
      role: body.role,
      title: body.title,
      reportsTo: body.reportsTo || null,
      adapterType: body.adapterType || 'groq_llm',
      adapterConfig: { model: body.model || 'llama-3.3-70b-versatile' },
      status: 'idle',
      budgetMonthlyCents: Number(body.budgetMonthlyCents) || 0,
      spentMonthlyMicrocents: 0,
      instructionsMarkdown: '',
      createdAt: now,
      updatedAt: now,
    };
    DEMO_AGENTS.push(agent);
    return { agent } as unknown as T;
  }

  // Agents listing
  if (path.includes('/agents') && (!init.method || init.method === 'GET')) {
    return { agents: DEMO_AGENTS, tree: DEMO_AGENTS } as unknown as T;
  }

  // Approvals listing and decisions
  if (path.includes('/approvals') && (!init.method || init.method === 'GET')) {
    return { approvals: [] } as unknown as T;
  }
  if (
    /^\/api\/approvals\/[^/]+\/decide$/.test(path) &&
    init.method === 'POST'
  ) {
    const body = JSON.parse(String(init.body || '{}'));
    return {
      status: body.decision,
      decisionNote: body.decisionNote || '',
    } as unknown as T;
  }

  // Company settings
  if (
    /^\/api\/companies\/[^/]+$/.test(path) &&
    (!init.method || init.method === 'GET')
  ) {
    const cid = path.split('/')[3];
    const company =
      mockCompanies.find((c) => c._id === cid) || mockCompanies[0];
    return { company } as unknown as T;
  }
  if (/^\/api\/companies\/[^/]+$/.test(path) && init.method === 'PATCH') {
    const cid = path.split('/')[3];
    const patch = JSON.parse(String(init.body || '{}'));
    mockCompanies = mockCompanies.map((c) =>
      c._id === cid ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c,
    );
    const company =
      mockCompanies.find((c) => c._id === cid) || mockCompanies[0];
    return { company } as unknown as T;
  }

  // Encrypted vault mock routes
  if (path.includes('/secrets') && (!init.method || init.method === 'GET')) {
    return {
      secrets: [
        {
          _id: 'secret_groq',
          key: 'GROQ_API_KEY',
          maskedPreview: 'gsk_••••8f1a',
          createdAt: new Date().toISOString(),
        },
      ],
    } as unknown as T;
  }
  if (path.includes('/secrets') && init.method === 'POST') {
    const body = JSON.parse(String(init.body || '{}'));
    const value = String(body.value || '');
    const preview =
      value.length > 8
        ? `${value.slice(0, 4)}••••${value.slice(-4)}`
        : '••••••••';
    return {
      secret: {
        _id: `secret_${Date.now()}`,
        key: String(body.key || 'API_KEY'),
        maskedPreview: preview,
        createdAt: new Date().toISOString(),
      },
    } as unknown as T;
  }
  if (path.includes('/secrets/') && init.method === 'DELETE') {
    return { message: 'Secret deleted' } as unknown as T;
  }

  if (
    /\/budget-incidents\/[^/]+\/resolve$/.test(path) &&
    init.method === 'POST'
  ) {
    const body = JSON.parse(String(init.body || '{}'));
    return { incident: { status: 'resolved', ...body }, agent: {} } as unknown as T;
  }

  if (
    /^\/api\/companies\/[^/]+\/budget-incidents$/.test(path) &&
    (!init.method || init.method === 'GET')
  ) {
    return { incidents: [] } as unknown as T;
  }

  // Demo seed and audit log
  if (/\/seed-demo$/.test(path) && init.method === 'POST') {
    const cid = path.split('/')[3] || 'demo_company_1';
    const seededIssues = seedDemoMockStore(cid);
    return {
      company: mockCompanies.find((c) => c._id === cid) || mockCompanies[0],
      agents: DEMO_AGENTS,
      goals: DEMO_GOALS,
      issues: seededIssues,
    } as unknown as T;
  }
  if (
    /^\/api\/companies\/[^/]+\/audit$/.test(path) &&
    (!init.method || init.method === 'GET')
  ) {
    return [] as unknown as T;
  }

  // Goals listing
  if (path.includes('/goals')) {
    return DEMO_GOALS as unknown as T;
  }

  // AI Plan Generation
  if (path.includes('/plans/generate')) {
    const body = JSON.parse(String(init.body || '{}'));
    const planResp: PlanGenerateResponse = {
      plan: {
        objective: body.objective || 'Autonomous Work Plan',
        estimatedTotalMicrocents: 48000,
        tasks: [
          {
            title: `Analyze requirements for: ${String(body.objective || '').slice(0, 40)}`,
            description:
              'Evaluate technical scope, external dependencies, and token budget.',
            priority: 'high',
            assigneeAgentId: 'agent_ceo',
            assigneeName: 'Atlas (CEO)',
            acceptanceCriteria: [
              'Technical scope definition written',
              'Sub-agent delegation targets selected',
            ],
          },
          {
            title: 'Implement core business logic & test harness',
            description:
              'Write implementation with atomic findOneAndUpdate checkout lock.',
            priority: 'urgent',
            assigneeAgentId: 'agent_dev',
            assigneeName: 'Nexus (Engineer)',
            acceptanceCriteria: [
              'Code matches Mongoose schema',
              'All acceptance checklist items pass',
            ],
          },
          {
            title: 'Audit deliverables & execute QA sign-off',
            description:
              'Perform evidence inspection before transitioning ticket to Done.',
            priority: 'medium',
            assigneeAgentId: 'agent_qa',
            assigneeName: 'Vigil (QA Gatekeeper)',
            acceptanceCriteria: [
              'Deliverables attached and verified',
              'Zero unaddressed feedback items',
            ],
          },
        ],
      },
      runId: 'run_plan_1',
    };
    return planResp as unknown as T;
  }

  // HeartbeatRun listing
  if (path.startsWith('/api/runs?') || path === '/api/runs') {
    return mockRuns as unknown as T;
  }

  // HeartbeatRun detail
  if (path.startsWith('/api/runs/')) {
    const runId = path.split('/')[3];
    const existing = mockRuns.find((r) => r._id === runId);
    if (existing) return existing as unknown as T;

    const runResp: HeartbeatRun = {
      _id: runId || 'run_sample_1',
      companyId: 'demo_company_1',
      agentId: 'agent_cto',
      agent: DEMO_AGENTS[1],
      issueId: 'issue_3',
      triggerType: 'assignment',
      status: 'completed',
      inputTokens: 1420,
      outputTokens: 380,
      costMicrocents: 2800,
      startedAt: new Date(Date.now() - 45000).toISOString(),
      logs: [
        {
          ts: new Date(Date.now() - 40000).toISOString(),
          level: 'SYSTEM',
          message: 'Heartbeat initialized. Adapter: Groq Llama 3.3 70B.',
        },
        {
          ts: new Date(Date.now() - 35000).toISOString(),
          level: 'THOUGHT',
          message:
            'Reading target ticket FORGE-1. Checking active lease on lockedByRunId...',
        },
        {
          ts: new Date(Date.now() - 25000).toISOString(),
          level: 'TOOL',
          message:
            'Executing atomic findOneAndUpdate lock lease (5 min lease acquired).',
        },
        {
          ts: new Date(Date.now() - 15000).toISOString(),
          level: 'BUDGET',
          message:
            'Microcent check: spentMonthlyMicrocents = 185,000 / 3,000,000 (6.1% of budget cap).',
        },
        {
          ts: new Date().toISOString(),
          level: 'INFO',
          message:
            'Hydrating unread comments. 0 new comments found since last check.',
        },
      ],
    };
    return runResp as unknown as T;
  }

  return {} as unknown as T;
}

/** Typed API error with HTTP status */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Exported request helpers ───────────────────────────────

export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiDelete<T = void>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE' });
}

export async function apiDownload(
  path: string,
  filename: string,
): Promise<void> {
  const response = await fetch(getApiUrl(path), {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Download failed with status ${response.status}`,
    );
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
