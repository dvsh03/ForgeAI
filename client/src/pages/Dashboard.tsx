// ─────────────────────────────────────────────────────────────
// Dashboard.tsx — Command Dashboard & Telemetry Overview
// Developer 3 • Paperclip MERN (Days 9, 11, 12 & 13)
//
// Matches UI/UX Brief Screen 1:
// - Conditional Budget Hard-Stop Alert Banner with 1-click "Raise Budget & Resume"
// - 4 KPI Cards (Active Agents, Ticket Progress, Monthly Spend, Pending Approvals)
// - Two-Column Split:
//     Left (60%): Recent Heartbeat Runs table with Tokens + "Watch Console" button
//     Right (40%): Live Company Activity Feed
// - 1-click "Load Demo Company" button in header
// - Skeleton loading states & Toast notifications
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  DollarSign,
  Inbox,
  Loader2,
  RefreshCw,
  Sparkles,
  Terminal,
  XCircle,
} from 'lucide-react';
import type { Agent, BudgetIncident, Issue } from '../types/models';
import { apiGet, apiPost } from '../lib/api';
import RunConsole from '../components/RunConsole';
import { useToast } from '../components/ToastProvider';

interface ActivityLogItem {
  _id: string;
  actorName?: string;
  actorType: string;
  action: string;
  entityType?: string;
  createdAt: string;
}

interface RunItem {
  _id: string;
  agentId?: { name: string; role: string } | string;
  targetIssueId?: { issueKey?: string; identifier?: string; title?: string } | null;
  issueId?: { issueKey?: string; identifier?: string; title?: string } | null;
  triggerType?: string;
  status: string;
  inputTokens?: number;
  outputTokens?: number;
  costMicrocents?: number;
  createdAt?: string;
  startedAt?: string;
}

export default function Dashboard({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [activities, setActivities] = useState<ActivityLogItem[]>([]);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [incidents, setIncidents] = useState<BudgetIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [resolvingBudget, setResolvingBudget] = useState(false);
  const [activeConsoleRunId, setActiveConsoleRunId] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const [
        agentResponse,
        issueResponse,
        approvalResponse,
        auditResponse,
        runResponse,
        incidentResponse,
      ] = await Promise.all([
        apiGet<{ agents: Agent[] }>(`/api/companies/${companyId}/agents`).catch(
          () => ({ agents: [] }),
        ),
        apiGet<Issue[]>(`/api/companies/${companyId}/issues`).catch(() => []),
        apiGet<{ approvals?: Array<{ status: string }> }>(
          `/api/companies/${companyId}/approvals`,
        ).catch(() => ({ approvals: [] })),
        apiGet<{ logs?: ActivityLogItem[] } | ActivityLogItem[]>(
          `/api/companies/${companyId}/audit`,
        ).catch(() => []),
        apiGet<RunItem[]>(`/api/runs?companyId=${companyId}`).catch(() => []),
        apiGet<{ incidents?: BudgetIncident[] }>(
          `/api/companies/${companyId}/budget-incidents`,
        ).catch(() => ({ incidents: [] })),
      ]);

      setAgents(agentResponse.agents || []);
      setIssues(Array.isArray(issueResponse) ? issueResponse : []);
      const approvals = approvalResponse?.approvals || [];
      setPendingApprovalsCount(
        approvals.filter((a) => a.status === 'pending').length,
      );

      const logs = Array.isArray(auditResponse)
        ? auditResponse
        : auditResponse?.logs || [];
      setActivities(logs.slice(0, 10));

      setRuns(Array.isArray(runResponse) ? runResponse.slice(0, 8) : []);
      setIncidents(incidentResponse?.incidents || []);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setLoading(true);
    void loadDashboard();
  }, [loadDashboard]);

  // Listen for Demo Seeder events triggered from Sidebar or Settings
  useEffect(() => {
    const onSeeded = () => {
      void loadDashboard();
    };
    window.addEventListener('company:seeded', onSeeded);
    return () => window.removeEventListener('company:seeded', onSeeded);
  }, [loadDashboard]);

  const handleLoadDemo = async () => {
    setSeeding(true);
    try {
      await apiPost(`/api/companies/${companyId}/seed-demo`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['issues'] }),
        queryClient.invalidateQueries({ queryKey: ['agents'] }),
        queryClient.invalidateQueries({ queryKey: ['goals'] }),
      ]);
      await loadDashboard();
      toast.success(
        'Demo Company Loaded',
        'Seeded 4 AI agents, 2 goals, and 3 starter tickets.',
      );
    } catch (err) {
      toast.error(
        'Demo seed failed',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setSeeding(false);
    }
  };

  const handleRaiseBudgetAndResume = async () => {
    const stoppedAgent = agents.find((a) => a.status === 'budget_stopped');
    const openIncident = incidents[0];
    setResolvingBudget(true);
    try {
      if (openIncident) {
        const nextBudget = Math.max(
          (openIncident.budgetMonthlyCents || 100) + 200,
          Math.ceil((openIncident.spentMonthlyMicrocents || 0) / 10000) + 100,
        );
        await apiPost(`/api/budget-incidents/${openIncident._id}/resolve`, {
          newBudgetMonthlyCents: nextBudget,
          resolutionNote: 'Raised monthly cap from Command Dashboard alert.',
        });
        toast.success(
          'Budget Increased & Agent Resumed',
          `${openIncident.agentName || stoppedAgent?.name || 'Agent'} limit raised to $${(nextBudget / 100).toFixed(2)}.`,
        );
        await loadDashboard();
      } else if (stoppedAgent) {
        // Fallback: jump to approvals where budget incidents are managed
        window.location.hash = '#/approvals';
      }
    } catch (err) {
      toast.error(
        'Unable to resolve budget stop',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setResolvingBudget(false);
    }
  };

  const running = agents.filter((agent) => agent.status === 'running').length;
  const idleCount = agents.filter((agent) => agent.status === 'idle').length;
  const done = issues.filter((issue) => issue.status === 'done').length;
  const spentMicrocents = agents.reduce(
    (total, agent) => total + (agent.spentMonthlyMicrocents || 0),
    0,
  );
  const budgetCents = agents.reduce(
    (total, agent) => total + (agent.budgetMonthlyCents || 0),
    0,
  );
  const spentDollars = spentMicrocents / 1_000_000;
  const budgetDollars = budgetCents / 100;
  const completion = issues.length ? (done / issues.length) * 100 : 0;
  const stoppedAgent = agents.find((agent) => agent.status === 'budget_stopped');

  const kpis = [
    {
      label: 'Active Agents',
      value: `${agents.length} Active`,
      detail: `${running} Running, ${idleCount} Idle`,
      icon: Bot,
      color: 'text-violet-400',
    },
    {
      label: 'Ticket Progress',
      value: `${done} / ${issues.length} Done`,
      detail: `${Math.round(completion)}% complete`,
      icon: CheckCircle2,
      color: 'text-emerald-400',
    },
    {
      label: 'Monthly Spend',
      value: `$${spentDollars.toFixed(2)} / $${budgetDollars.toFixed(2)}`,
      detail: `${spentMicrocents.toLocaleString()} microcents`,
      icon: DollarSign,
      color: 'text-blue-400',
    },
    {
      label: 'Pending Approvals',
      value: `${pendingApprovalsCount} Waiting`,
      detail: 'Open governance inbox',
      icon: Inbox,
      color: 'text-amber-400',
      href: '#/approvals',
    },
  ];

  const formatTimeAgo = (dateStr: string) => {
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    } catch {
      return 'Recently';
    }
  };

  if (loading) {
    return (
      <div className="h-full overflow-y-auto bg-zinc-950 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-48 animate-pulse rounded bg-zinc-800" />
            <div className="h-3 w-36 animate-pulse rounded bg-zinc-900" />
          </div>
          <div className="h-8 w-40 animate-pulse rounded-lg bg-zinc-800" />
        </div>
        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="h-3 w-24 rounded bg-zinc-800" />
              <div className="mt-4 h-6 w-32 rounded bg-zinc-800" />
              <div className="mt-3 h-2.5 w-20 rounded bg-zinc-800/70" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="h-72 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900 lg:col-span-3" />
          <div className="h-72 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900 lg:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">
            Command Dashboard
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Real-time agent fleet telemetry &amp; microcent budget control
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
            title="Refresh telemetry"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleLoadDemo}
            disabled={seeding}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
          >
            {seeding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {seeding ? 'Seeding…' : 'Load Demo Company'}
          </button>
        </div>
      </header>

      {/* Conditional Budget Hard-Stop Alert Banner */}
      {(stoppedAgent || incidents.length > 0) && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <p className="flex-1 text-xs text-red-200">
            Agent{' '}
            <span className="font-semibold">
              {stoppedAgent?.name || incidents[0]?.agentName || 'Worker'}
            </span>{' '}
            paused at 100% monthly budget.
          </p>
          <button
            type="button"
            disabled={resolvingBudget}
            onClick={handleRaiseBudgetAndResume}
            className="rounded-md border border-red-500/40 bg-red-950/60 px-3 py-1.5 text-xs font-semibold text-red-200 transition-colors hover:bg-red-900/60 disabled:opacity-50"
          >
            {resolvingBudget ? 'Resuming…' : 'Raise Budget & Resume'}
          </button>
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, detail, icon: Icon, color, href }) => {
          const cardContent = (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">{label}</p>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <p className="mt-3 text-lg font-semibold text-zinc-100">
                {value}
              </p>
              <p className="mt-1 text-[10px] text-zinc-500">{detail}</p>
              {label === 'Ticket Progress' && (
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${completion}%` }}
                  />
                </div>
              )}
            </>
          );

          return href ? (
            <button
              key={label}
              type="button"
              onClick={() => {
                window.location.hash = href;
              }}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left transition-colors hover:border-amber-500/40 hover:bg-zinc-900/80"
            >
              {cardContent}
            </button>
          ) : (
            <article
              key={label}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
            >
              {cardContent}
            </article>
          );
        })}
      </div>

      {/* Two-Column Activity Split */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Left (60%): Recent Heartbeat Runs */}
        <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 lg:col-span-3">
          <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-200">
              Recent Heartbeat Runs
            </h2>
            <span className="text-[11px] text-zinc-500">
              {runs.length} recent
            </span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-[10px] uppercase text-zinc-500">
                <tr className="border-b border-zinc-800/60">
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3">Trigger</th>
                  <th className="px-4 py-3">Ticket</th>
                  <th className="px-4 py-3">Tokens</th>
                  <th className="px-4 py-3">Cost</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Console</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 text-xs text-zinc-300">
                {runs.length > 0 ? (
                  runs.map((run) => {
                    const agentName =
                      typeof run.agentId === 'object' && run.agentId
                        ? run.agentId.name
                        : 'Agent';
                    const ticketObj = run.targetIssueId || run.issueId;
                    const ticketKey =
                      ticketObj?.issueKey || ticketObj?.identifier || '—';
                    const totalTokens =
                      (run.inputTokens || 0) + (run.outputTokens || 0);
                    const cost = ((run.costMicrocents || 0) / 1_000_000).toFixed(
                      4,
                    );
                    const isFailed =
                      run.status === 'failed' ||
                      run.status === 'budget_stopped' ||
                      run.status === 'stalled';

                    return (
                      <tr
                        key={run._id}
                        className="transition-colors hover:bg-zinc-800/30"
                      >
                        <td className="px-4 py-3 font-medium text-zinc-200">
                          {agentName}
                        </td>
                        <td className="px-4 py-3 text-zinc-500">
                          {run.triggerType || 'manual'}
                        </td>
                        <td className="px-4 py-3 font-mono text-zinc-400">
                          {ticketKey}
                        </td>
                        <td className="px-4 py-3 font-mono text-zinc-400">
                          {totalTokens.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono text-zinc-400">
                          ${cost}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              run.status === 'running'
                                ? 'bg-blue-500/10 text-blue-400'
                                : isFailed
                                  ? 'bg-red-500/10 text-red-400'
                                  : 'bg-emerald-500/10 text-emerald-400'
                            }`}
                          >
                            {run.status === 'running' ? (
                              <Terminal className="h-3 w-3 animate-pulse" />
                            ) : isFailed ? (
                              <XCircle className="h-3 w-3" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3" />
                            )}
                            {run.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setActiveConsoleRunId(run._id)}
                            className="inline-flex items-center gap-1 rounded border border-cyan-800/60 bg-cyan-950/40 px-2 py-1 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-900/50"
                          >
                            <Terminal className="h-3 w-3 text-cyan-400" />
                            Watch Console
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-xs text-zinc-500"
                    >
                      No heartbeat runs executed yet. Trigger a run from Org
                      Chart or click &quot;Load Demo Company&quot;.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right (40%): Live Company Activity Feed */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 lg:col-span-2">
          <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-200">
              Live Company Activity
            </h2>
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
          </header>
          <div className="divide-y divide-zinc-800">
            {activities.length > 0 ? (
              activities
                .filter((act, _idx, arr) => {
                  if (
                    act.action.startsWith('post_') &&
                    arr.some(
                      (o) =>
                        o.createdAt === act.createdAt &&
                        !o.action.startsWith('post_'),
                    )
                  ) {
                    return false;
                  }
                  return true;
                })
                .slice(0, 7)
                .map((activity) => {
                  const actor =
                    activity.actorName || activity.actorType || 'System';
                  const formatActionText = (act: string) => {
                    const dict: Record<string, string> = {
                      approval_approved: 'approved governance proposal',
                      approval_rejected: 'rejected governance proposal',
                      hire_agent: 'hired an AI agent',
                      create_company: 'created company workspace',
                      update_company: 'updated company settings',
                      seed_demo_company: 'initialized starter org',
                      create_issue: 'created a new task',
                      post_approvals: 'submitted governance decision',
                      post_issues: 'created ticket',
                      invoke_agent: 'triggered agent heartbeat',
                      resolve_budget_incident: 'raised budget and resumed agent',
                    };
                    return (
                      dict[act] ||
                      act
                        .replace(/^(post_|get_|patch_|delete_)/i, '')
                        .replace(/_/g, ' ')
                    );
                  };
                  const actionText = formatActionText(activity.action);
                  const timeText = formatTimeAgo(activity.createdAt);
                  return (
                    <div key={activity._id} className="px-4 py-3">
                      <p className="text-xs text-zinc-300">
                        <span className="font-semibold text-zinc-200">
                          {actor}
                        </span>{' '}
                        <span className="text-zinc-400">{actionText}</span>
                      </p>
                      <p className="mt-1 text-[10px] text-zinc-600">
                        {timeText}
                      </p>
                    </div>
                  );
                })
            ) : (
              <div className="px-4 py-10 text-center text-xs text-zinc-500">
                No activity recorded yet. System operational.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Live SSE Terminal Console Drawer */}
      <RunConsole
        runId={activeConsoleRunId}
        companyId={companyId}
        onClose={() => setActiveConsoleRunId(null)}
      />
    </div>
  );
}
