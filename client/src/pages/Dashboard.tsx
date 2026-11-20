import { useEffect, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, DollarSign, Inbox, Terminal } from 'lucide-react';
import type { Agent, Issue } from '../types/models';
import { apiGet } from '../lib/api';

export default function Dashboard({ companyId }: { companyId: string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiGet<{ agents: Agent[] }>(`/api/companies/${companyId}/agents`),
      apiGet<Issue[]>(`/api/companies/${companyId}/issues`),
    ]).then(([agentResponse, issueResponse]) => {
      setAgents(agentResponse.agents);
      setIssues(issueResponse);
    }).finally(() => setLoading(false));
  }, [companyId]);

  const running = agents.filter((agent) => agent.status === 'running').length;
  const done = issues.filter((issue) => issue.status === 'done').length;
  const spentMicrocents = agents.reduce((total, agent) => total + agent.spentMonthlyMicrocents, 0);
  const budgetCents = agents.reduce((total, agent) => total + agent.budgetMonthlyCents, 0);
  const spentDollars = spentMicrocents / 1_000_000;
  const budgetDollars = budgetCents / 100;
  const completion = issues.length ? (done / issues.length) * 100 : 0;

  const kpis = [
    { label: 'Active Agents', value: `${agents.length} Active`, detail: `${running} Running`, icon: Bot, color: 'text-violet-400' },
    { label: 'Ticket Progress', value: `${done} / ${issues.length} Done`, detail: `${Math.round(completion)}% complete`, icon: CheckCircle2, color: 'text-emerald-400' },
    { label: 'Monthly Spend', value: `$${spentDollars.toFixed(2)} / $${budgetDollars.toFixed(2)}`, detail: 'Microcent accounting', icon: DollarSign, color: 'text-blue-400' },
    { label: 'Pending Approvals', value: '2 Waiting', detail: 'Open governance inbox', icon: Inbox, color: 'text-amber-400' },
  ];

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-zinc-500">Loading command dashboard...</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 p-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Command Dashboard</h1>
        <p className="mt-1 text-xs text-zinc-500">Acme AI operational overview</p>
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
              {agents.slice(0, 5).map((agent, index) => (
                <tr key={agent._id}>
                  <td className="px-4 py-3 font-medium">{agent.name}</td>
                  <td className="px-4 py-3 text-zinc-500">{index === 0 ? 'manual' : index === 1 ? 'assignment' : 'cron'}</td>
                  <td className="px-4 py-3 font-mono text-zinc-400">{issues[index]?.identifier || '—'}</td>
                  <td className="px-4 py-3 font-mono text-zinc-500">${(agent.spentMonthlyMicrocents / 1_000_000).toFixed(3)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] ${agent.status === 'running' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {agent.status === 'running' ? <Terminal className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                      {agent.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="col-span-2 rounded-xl border border-zinc-800 bg-zinc-900">
          <header className="border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-200">Live Company Activity</h2>
          </header>
          <div className="divide-y divide-zinc-800">
            {[
              ['Atlas (CEO)', 'created 3 subtasks', 'Just now'],
              ['Nexus (Engineer)', 'submitted PAP-2 for QA', '12 min ago'],
              ['Vigil (QA)', 'rejected PAP-5 with feedback', '38 min ago'],
              ['Ada (CTO)', 'acquired an atomic lock', '1 hr ago'],
            ].map(([actor, action, time]) => (
              <div key={`${actor}-${action}`} className="px-4 py-3">
                <p className="text-xs text-zinc-300"><span className="font-semibold">{actor}</span> <span className="text-zinc-500">{action}</span></p>
                <p className="mt-1 text-[10px] text-zinc-600">{time}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
