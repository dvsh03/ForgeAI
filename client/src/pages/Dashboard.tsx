import { useEffect, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, DollarSign, Inbox, Terminal } from 'lucide-react';
import type { Agent, Issue } from '../types/models';
import { apiGet } from '../lib/api';

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
  triggerType?: string;
  status: string;
  costMicrocents?: number;
  createdAt: string;
}

export default function Dashboard({ companyId }: { companyId: string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [activities, setActivities] = useState<ActivityLogItem[]>([]);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiGet<{ agents: Agent[] }>(`/api/companies/${companyId}/agents`).catch(() => ({ agents: [] })),
      apiGet<Issue[]>(`/api/companies/${companyId}/issues`).catch(() => []),
      apiGet<{ approvals?: Array<{ status: string }> }>(`/api/companies/${companyId}/approvals`).catch(() => ({ approvals: [] })),
      apiGet<{ logs?: ActivityLogItem[] } | ActivityLogItem[]>(`/api/companies/${companyId}/audit`).catch(() => []),
      apiGet<RunItem[]>(`/api/runs?companyId=${companyId}`).catch(() => []),
    ])
      .then(([agentResponse, issueResponse, approvalResponse, auditResponse, runResponse]) => {
        setAgents(agentResponse.agents || []);
        setIssues(Array.isArray(issueResponse) ? issueResponse : []);
        const approvals = approvalResponse?.approvals || [];
        setPendingApprovalsCount(approvals.filter((a) => a.status === 'pending').length);

        const logs = Array.isArray(auditResponse)
          ? auditResponse
          : auditResponse?.logs || [];
        setActivities(logs.slice(0, 8));

        setRuns(Array.isArray(runResponse) ? runResponse.slice(0, 5) : []);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  const running = agents.filter((agent) => agent.status === 'running').length;
  const done = issues.filter((issue) => issue.status === 'done').length;
  const spentMicrocents = agents.reduce((total, agent) => total + (agent.spentMonthlyMicrocents || 0), 0);
  const budgetCents = agents.reduce((total, agent) => total + (agent.budgetMonthlyCents || 0), 0);
  const spentDollars = spentMicrocents / 1_000_000;
  const budgetDollars = budgetCents / 100;
  const completion = issues.length ? (done / issues.length) * 100 : 0;

  const kpis = [
    { label: 'Active Agents', value: `${agents.length} Active`, detail: `${running} Running`, icon: Bot, color: 'text-violet-400' },
    { label: 'Ticket Progress', value: `${done} / ${issues.length} Done`, detail: `${Math.round(completion)}% complete`, icon: CheckCircle2, color: 'text-emerald-400' },
    { label: 'Monthly Spend', value: `$${spentDollars.toFixed(2)} / $${budgetDollars.toFixed(2)}`, detail: 'Microcent accounting', icon: DollarSign, color: 'text-blue-400' },
    { label: 'Pending Approvals', value: `${pendingApprovalsCount} Waiting`, detail: 'Open governance inbox', icon: Inbox, color: 'text-amber-400' },
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
    return <div className="flex h-full items-center justify-center text-sm text-zinc-500">Loading command dashboard...</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 p-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Command Dashboard</h1>
        <p className="mt-1 text-xs text-zinc-500">Forge AI operational overview</p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map(({ label, value, detail, icon: Icon, color }) => (
          <article key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">{label}</p>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="mt-3 text-lg font-semibold text-zinc-100">{value}</p>
            <p className="mt-1 text-[10px] text-zinc-500">{detail}</p>
            {label === 'Ticket Progress' && (
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full bg-emerald-500" style={{ width: `${completion}%` }} />
              </div>
            )}
          </article>
        ))}
      </div>

      {agents.some((agent) => agent.status === 'budget_stopped') && (
        <div className="mb-5 flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <p className="flex-1 text-xs text-red-300">An agent is paused at 100% of its monthly budget.</p>
          <button type="button" className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-300">Raise Budget & Resume</button>
        </div>
      )}

      <div className="grid grid-cols-5 gap-4">
        <section className="col-span-3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <header className="border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-200">Recent Heartbeat Runs</h2>
          </header>
          <table className="w-full text-left">
            <thead className="text-[10px] uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Trigger</th>
                <th className="px-4 py-3">Ticket</th>
                <th className="px-4 py-3">Cost</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-xs text-zinc-300">
              {runs.length > 0 ? (
                runs.map((run) => {
                  const agentName = typeof run.agentId === 'object' && run.agentId ? run.agentId.name : 'Agent';
                  const ticketKey = run.targetIssueId?.issueKey || run.targetIssueId?.identifier || '—';
                  const cost = ((run.costMicrocents || 0) / 1_000_000).toFixed(3);
                  return (
                    <tr key={run._id}>
                      <td className="px-4 py-3 font-medium">{agentName}</td>
                      <td className="px-4 py-3 text-zinc-500">{run.triggerType || 'manual'}</td>
                      <td className="px-4 py-3 font-mono text-zinc-400">{ticketKey}</td>
                      <td className="px-4 py-3 font-mono text-zinc-500">${cost}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] ${run.status === 'running' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {run.status === 'running' ? <Terminal className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                          {run.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-zinc-500">
                    No heartbeat runs executed yet. Trigger a run from Org Chart or assign a ticket.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="col-span-2 rounded-xl border border-zinc-800 bg-zinc-900">
          <header className="border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-200">Live Company Activity</h2>
          </header>
          <div className="divide-y divide-zinc-800">
            {activities.length > 0 ? (
              activities
                .filter((act, idx, arr) => {
                  // Prefer explicit domain events over raw HTTP endpoint names
                  if (act.action.startsWith('post_') && arr.some((o) => o.createdAt === act.createdAt && !o.action.startsWith('post_'))) {
                    return false;
                  }
                  return true;
                })
                .slice(0, 6)
                .map((activity) => {
                  const actor = activity.actorName || activity.actorType || 'System';
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
                    };
                    return dict[act] || act.replace(/^(post_|get_|patch_|delete_)/i, '').replace(/_/g, ' ');
                  };
                  const actionText = formatActionText(activity.action);
                  const timeText = formatTimeAgo(activity.createdAt);
                  return (
                    <div key={activity._id} className="px-4 py-3">
                      <p className="text-xs text-zinc-300">
                        <span className="font-semibold text-zinc-200">{actor}</span>{' '}
                        <span className="text-zinc-400">{actionText}</span>
                      </p>
                      <p className="mt-1 text-[10px] text-zinc-600">{timeText}</p>
                    </div>
                  );
                })
            ) : (
              <div className="px-4 py-8 text-center text-xs text-zinc-500">
                No activity recorded yet. System operational.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
