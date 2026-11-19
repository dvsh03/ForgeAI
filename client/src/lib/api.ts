// ─────────────────────────────────────────────────────────────
// Paperclip MERN — API Client Helpers
// Wraps fetch with Bearer-token auth and base URL.
// Includes transparent offline mock store so frontend can be
// interacted with and evaluated before backend is launched!
// ─────────────────────────────────────────────────────────────

import type {
  Issue,
  Agent,
  Goal,
  IssueComment,
  HeartbeatRun,
  PlanGenerateResponse,
} from '../types/models';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

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

// ── In-Memory Demo Data Store (Document 6 - Day 13 Demo Seed) ──

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
    instructionsMarkdown: 'Coordinate team, break high-level goals into atomic tickets.',
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
    instructionsMarkdown: 'Architect backend, enforce atomic locks and microcent accounting.',
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
    instructionsMarkdown: 'Implement components, write tests, attach deliverables.',
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
    instructionsMarkdown: 'Verify acceptance criteria and inspect deliverables before closing tickets.',
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
    description: 'Verify 409 atomic lock contention and microcent circuit breakers.',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let mockIssues: Issue[] = [
  {
    _id: 'issue_1',
    companyId: 'demo_company_1',
    identifier: 'PAP-1',
    title: 'Implement AES-256-GCM encrypted secrets vault',
    description: 'Protect Groq and Gemini API keys with 12-byte IV and 16-byte auth tag. Ensure zero plaintext leaks.',
    status: 'done',
    priority: 'urgent',
    goalId: 'goal_1',
    assigneeAgentId: 'agent_cto',
    acceptanceCriteria: [
      { text: 'AES-256-GCM encryption with 32-byte master key', completed: true },
      { text: 'Masked preview showing only first 4 and last 4 characters', completed: true },
      { text: 'Keys decrypted in memory only inside adapterExecutor', completed: true },
    ],
    deliverables: [
      { kind: 'link', label: 'Vault PR & Security Specs', url: 'https://github.com/paperclipai/paperclip' },
    ],
    lastHydratedCommentCount: 2,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    _id: 'issue_2',
    companyId: 'demo_company_1',
    identifier: 'PAP-2',
    title: 'Build 5-Column Kanban Board & Task Planner Modal',
    description: 'Construct Linear-inspired task management workspace with drag-and-drop and AI task decomposition.',
    status: 'in_review',
    priority: 'high',
    goalId: 'goal_1',
    assigneeAgentId: 'agent_dev',
    acceptanceCriteria: [
      { text: '5 Kanban columns: Backlog, Todo, In Progress, In Review, Done', completed: true },
      { text: 'Optimistic mutations with TanStack Query', completed: true },
      { text: 'TaskPlannerModal 2-step wizard', completed: true },
      { text: 'Evidence-Based QA Review Controls', completed: false },
    ],
    deliverables: [
      { kind: 'file', label: 'Kanban_Architecture_Wireframe.png', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80', byteSize: 345000 },
      { kind: 'link', label: 'Live Vercel Preview URL', url: 'https://paperclip-mern.vercel.app' },
    ],
    lastHydratedCommentCount: 1,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'issue_3',
    companyId: 'demo_company_1',
    identifier: 'PAP-3',
    title: 'Atomic 5-minute checkout lock with 409 guard',
    description: 'Prevent duplicate agent runs with findOneAndUpdate atomic lease and 30s zombie watchdog.',
    status: 'in_progress',
    priority: 'urgent',
    goalId: 'goal_2',
    assigneeAgentId: 'agent_cto',
    lockedByRunId: 'run_sample_1',
    lockExpiresAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
    acceptanceCriteria: [
      { text: 'Atomic findOneAndUpdate query', completed: true },
      { text: '409 Conflict return when ticket already locked', completed: true },
      { text: '30s watchdog sweep resetting stalled runs', completed: false },
    ],
    deliverables: [],
    lastHydratedCommentCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'issue_4',
    companyId: 'demo_company_1',
    identifier: 'PAP-4',
    title: 'Live SSE Heartbeat Terminal Console',
    description: 'Connect EventSource to GET /api/runs/:id/stream and stream [SYSTEM], [THOUGHT], [TOOL_CALL], and [BUDGET].',
    status: 'todo',
    priority: 'medium',
    goalId: 'goal_2',
    assigneeAgentId: 'agent_dev',
    acceptanceCriteria: [
      { text: '520px dark slate terminal (#0F172A)', completed: true },
      { text: 'Real-time color-coded log levels', completed: true },
      { text: 'Live microcent spend and elapsed timer', completed: true },
    ],
    deliverables: [],
    lastHydratedCommentCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'issue_5',
    companyId: 'demo_company_1',
    identifier: 'PAP-5',
    title: 'Microcent budget auto-stop circuit breaker',
    description: 'Pre-flight budget check blocking runs when spentMonthlyMicrocents exceeds monthly cap.',
    status: 'backlog',
    priority: 'low',
    goalId: 'goal_1',
    acceptanceCriteria: [
      { text: 'Integer microcents (1 cent = 10,000 microcents)', completed: false },
      { text: '80% yellow warning threshold', completed: false },
      { text: '100% emergency brake flipping agent to budget_stopped', completed: false },
    ],
    deliverables: [],
    lastHydratedCommentCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let mockComments: Record<string, IssueComment[]> = {
  issue_2: [
    {
      _id: 'comm_1',
      companyId: 'demo_company_1',
      issueId: 'issue_2',
      authorType: 'agent',
      authorId: 'agent_dev',
      authorName: 'Nexus (Engineer)',
      body: 'I have finished implementing the Kanban drag-and-drop and attached the wireframe preview. Submitting for QA review!',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      _id: 'comm_2',
      companyId: 'demo_company_1',
      issueId: 'issue_2',
      authorType: 'agent',
      authorId: 'agent_qa',
      authorName: 'Vigil (QA Gatekeeper)',
      body: '@Atlas I am currently inspecting the acceptance checklist before marking this ticket Done.',
      createdAt: new Date(Date.now() - 1800000).toISOString(),
    },
  ],
};

// ── Generic API Fetch with Mock Fallback ──────────────────

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response | undefined;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: authHeaders((init.headers as Record<string, string>) ?? {}),
    });
  } catch {
    // Backend offline / connecting to free tier cold start -> fall through to mock store.
  }

  if (response?.ok) {
    return (await response.json()) as T;
  }
  if (response && !(
    !getToken() && (response.status === 401 || response.status === 404)
  )) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      typeof errorBody.error === 'string' ? errorBody.error : `Request failed with status ${response.status}`,
    );
  }

  // ── Offline Demo Mock Router ──────────────────────────────
  // Issues listing
  if (path.includes('/issues') && (!init.method || init.method === 'GET')) {
    return [...mockIssues] as unknown as T;
  }

  // Issue detail
  if (path.startsWith('/api/issues/') && (!init.method || init.method === 'GET')) {
    const issueId = path.split('/')[3];
    const found = mockIssues.find((i) => i._id === issueId);
    if (found) return found as unknown as T;
  }

  // Issue PATCH
  if (path.startsWith('/api/issues/') && init.method === 'PATCH') {
    const issueId = path.split('/')[3];
    const patch = JSON.parse(String(init.body || '{}'));
    mockIssues = mockIssues.map((i) =>
      i._id === issueId ? { ...i, ...patch, updatedAt: new Date().toISOString() } : i,
    );
    const updated = mockIssues.find((i) => i._id === issueId);
    return updated as unknown as T;
  }

  // Issue Create
  if (path.endsWith('/issues') && init.method === 'POST') {
    const body = JSON.parse(String(init.body || '{}'));
    const newIssue: Issue = {
      _id: `issue_${Date.now()}`,
      companyId: 'demo_company_1',
      identifier: `PAP-${mockIssues.length + 1}`,
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
      i._id === issueId ? { ...i, status: targetStatus } : i,
    );
    const updated = mockIssues.find((i) => i._id === issueId);
    return { issue: updated, message: `QA Review completed: ${targetStatus}` } as unknown as T;
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
      authorName: 'Board Operator (You)',
      body: body.body || '',
      createdAt: new Date().toISOString(),
    };
    if (!mockComments[issueId]) mockComments[issueId] = [];
    mockComments[issueId].push(newComment);
    return newComment as unknown as T;
  }

  // Agent config revision history
  if (/^\/api\/agents\/[^/]+\/revisions/.test(path) && (!init.method || init.method === 'GET')) {
    return [
      {
        _id: 'rev_initial',
        changedKeys: ['instructionsMarkdown', 'adapterType'],
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ] as unknown as T;
  }

  // Agent actions
  if (/^\/api\/agents\/[^/]+\/(pause|resume|invoke)$/.test(path) && init.method === 'POST') {
    const [, , , agentId, action] = path.split('/');
    const agent = DEMO_AGENTS.find((item) => item._id === agentId);
    if (action === 'invoke') {
      return { status: 'queued', wakeupId: `wakeup_${Date.now()}` } as unknown as T;
    }
    if (agent) {
      agent.status = action === 'pause' ? 'paused' : 'idle';
      agent.updatedAt = new Date().toISOString();
      return { agent } as unknown as T;
    }
    return {} as T;
  }

  // Agent config rollback
  if (/^\/api\/agents\/[^/]+\/revisions\/[^/]+\/rollback$/.test(path) && init.method === 'POST') {
    const agentId = path.split('/')[3];
    const agent = DEMO_AGENTS.find((item) => item._id === agentId) || DEMO_AGENTS[0];
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
  if (/^\/api\/companies\/[^/]+\/agents$/.test(path) && init.method === 'POST') {
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
    return {
      approvals: [
        {
          _id: 'approval_hire_1',
          companyId: 'demo_company_1',
          type: 'hire_agent',
          requestedByAgentId: 'agent_cto',
          payload: { name: 'Mira', role: 'researcher', title: 'Competitive Research Analyst', budgetMonthlyCents: 250 },
          status: 'pending',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          _id: 'approval_plan_1',
          companyId: 'demo_company_1',
          type: 'strategy_plan',
          requestedByAgentId: 'agent_ceo',
          payload: { objective: 'Prepare Q4 developer launch campaign', targetDate: '2026-11-30', estimatedBudgetCents: 150 },
          status: 'pending',
          createdAt: new Date(Date.now() - 7200000).toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    } as unknown as T;
  }
  if (/^\/api\/approvals\/[^/]+\/decide$/.test(path) && init.method === 'POST') {
    const body = JSON.parse(String(init.body || '{}'));
    return { status: body.decision, decisionNote: body.decisionNote || '' } as unknown as T;
  }

  // Company settings
  if (/^\/api\/companies\/[^/]+$/.test(path) && (!init.method || init.method === 'GET')) {
    return {
      company: {
        _id: 'demo_company_1',
        name: 'Acme AI',
        description: 'Autonomous AI workforce',
        issuePrefix: 'ACM',
        issueCounter: mockIssues.length,
        budgetMonthlyCents: 500,
        spentMonthlyMicrocents: 415000,
        requireHireApproval: true,
        ownerUserId: 'user_1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    } as unknown as T;
  }
  if (/^\/api\/companies\/[^/]+$/.test(path) && init.method === 'PATCH') {
    const patch = JSON.parse(String(init.body || '{}'));
    return {
      company: {
        _id: 'demo_company_1',
        name: 'Acme AI',
        description: 'Autonomous AI workforce',
        issuePrefix: 'ACM',
        issueCounter: mockIssues.length,
        budgetMonthlyCents: 500,
        spentMonthlyMicrocents: 415000,
        requireHireApproval: true,
        ownerUserId: 'user_1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...patch,
      },
    } as unknown as T;
  }

  // Encrypted vault mock routes
  if (path.includes('/secrets') && (!init.method || init.method === 'GET')) {
    return {
      secrets: [
        { _id: 'secret_groq', key: 'GROQ_API_KEY', maskedPreview: 'gsk_••••8f1a', createdAt: new Date().toISOString() },
      ],
    } as unknown as T;
  }
  if (path.includes('/secrets') && init.method === 'POST') {
    const body = JSON.parse(String(init.body || '{}'));
    const value = String(body.value || '');
    const preview = value.length > 8 ? `${value.slice(0, 4)}••••${value.slice(-4)}` : '••••••••';
    return {
      secret: { _id: `secret_${Date.now()}`, key: String(body.key || 'API_KEY'), maskedPreview: preview, createdAt: new Date().toISOString() },
    } as unknown as T;
  }
  if (path.includes('/secrets/') && init.method === 'DELETE') {
    return { message: 'Secret deleted' } as unknown as T;
  }

  if (/\/budget-incidents\/[^/]+\/resolve$/.test(path) && init.method === 'POST') {
    const body = JSON.parse(String(init.body || '{}'));
    return { incident: { status: 'resolved', ...body }, agent: {} } as unknown as T;
  }

  if (/^\/api\/companies\/[^/]+\/budget-incidents$/.test(path) && (!init.method || init.method === 'GET')) {
    return {
      incidents: [
        {
          _id: 'incident_demo_1',
          companyId: 'demo_company_1',
          agentId: 'agent_ceo',
          agentName: 'Atlas (CEO)',
          threshold: 100,
          spentMonthlyMicrocents: 5000000,
          budgetMonthlyCents: 500,
          status: 'open',
          createdAt: new Date().toISOString(),
        },
      ],
    } as unknown as T;
  }

  // Demo seed and audit log
  if (/\/seed-demo$/.test(path) && init.method === 'POST') {
    return { company: {}, agents: DEMO_AGENTS, goals: DEMO_GOALS, issues: mockIssues } as unknown as T;
  }
  if (/^\/api\/companies\/[^/]+\/audit$/.test(path) && (!init.method || init.method === 'GET')) {
    return [
      { _id: 'log_1', actorType: 'user', actorId: 'user_1', action: 'update_company', entityType: 'Company', entityId: 'demo_company_1', details: { budgetMonthlyCents: 500 }, createdAt: new Date(Date.now() - 600000).toISOString() },
      { _id: 'log_2', actorType: 'agent', actorId: 'agent_cto', action: 'submit_for_review', entityType: 'Issue', entityId: 'PAP-3', details: { status: 'in_review' }, createdAt: new Date(Date.now() - 1800000).toISOString() },
    ] as unknown as T;
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
            title: `Analyze requirements for: ${body.objective.slice(0, 40)}`,
            description: 'Evaluate technical scope, external dependencies, and token budget.',
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
            description: 'Write implementation with atomic findOneAndUpdate checkout lock.',
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
            description: 'Perform evidence inspection before transitioning ticket to Done.',
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

  // HeartbeatRun detail
  if (path.startsWith('/api/runs/')) {
    const runResp: HeartbeatRun = {
      _id: 'run_sample_1',
      companyId: 'demo_company_1',
      agentId: 'agent_cto',
      agent: DEMO_AGENTS[1],
      issueId: 'issue_3',
      triggerType: 'assignment',
      status: 'running',
      inputTokens: 1420,
      outputTokens: 380,
      costMicrocents: 2800,
      startedAt: new Date(Date.now() - 45000).toISOString(),
      logs: [
        { ts: new Date(Date.now() - 40000).toISOString(), level: 'SYSTEM', message: 'Heartbeat initialized. Adapter: Groq Llama 3.3 70B.' },
        { ts: new Date(Date.now() - 35000).toISOString(), level: 'LLM_THOUGHT', message: 'Reading target ticket PAP-3. Checking active lease on lockedByRunId...' },
        { ts: new Date(Date.now() - 25000).toISOString(), level: 'TOOL_CALL', message: 'Executing atomic findOneAndUpdate lock lease (5 min lease acquired).' },
        { ts: new Date(Date.now() - 15000).toISOString(), level: 'BUDGET', message: 'Microcent check: spentMonthlyMicrocents = 185,000 / 3,000,000 (6.1% of budget cap).' },
        { ts: new Date().toISOString(), level: 'INFO', message: 'Hydrating unread comments. 0 new comments found since last check.' },
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

export async function apiDownload(path: string, filename: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(response.status, `Download failed with status ${response.status}`);
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
