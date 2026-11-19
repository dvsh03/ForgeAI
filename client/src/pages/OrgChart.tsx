import { useEffect, useState } from 'react';
import { Edit3, Pause, Play, Plus, RotateCw } from 'lucide-react';
import type { Agent, AgentAdapterType, AgentRole } from '../types/models';
import { apiGet, apiPost } from '../lib/api';
import AgentDrawer from '../components/AgentDrawer';
import AnimatedDialog from '../components/AnimatedDialog';

export default function OrgChart({ companyId }: { companyId: string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [hireOpen, setHireOpen] = useState(false);
  const [hiring, setHiring] = useState(false);
  const [hireError, setHireError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [hireForm, setHireForm] = useState({
    name: '',
    title: '',
    role: 'engineer' as AgentRole,
    adapterType: 'groq_llm' as AgentAdapterType,
    model: 'llama-3.3-70b-versatile',
    budgetMonthlyCents: 250,
    reportsTo: '',
  });

  useEffect(() => {
    apiGet<{ agents: Agent[] }>(`/api/companies/${companyId}/agents`)
      .then((response) => setAgents(response.agents))
      .finally(() => setLoading(false));
  }, [companyId]);

  const updateStatus = async (agent: Agent, action: 'pause' | 'resume' | 'invoke') => {
    setActionMessage('');
    try {
      if (action === 'invoke') {
        await apiPost(`/api/agents/${agent._id}/invoke`);
        setActionMessage(`Heartbeat queued for ${agent.name}.`);
        return;
      }
      const response = await apiPost<{ agent: Agent }>(`/api/agents/${agent._id}/${action}`);
      setAgents((current) => current.map((item) => item._id === agent._id ? response.agent : item));
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Unable to update agent.');
    }
  };

  const hireAgent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHiring(true);
    setHireError('');
    try {
      const response = await apiPost<{ agent: Agent }>(`/api/companies/${companyId}/agents`, {
        ...hireForm,
        reportsTo: hireForm.reportsTo || null,
      });
      setAgents((current) => [...current, response.agent]);
      setHireOpen(false);
      setHireForm({
        name: '',
        title: '',
        role: 'engineer',
        adapterType: 'groq_llm',
        model: 'llama-3.3-70b-versatile',
        budgetMonthlyCents: 250,
        reportsTo: '',
      });
    } catch (error) {
      setHireError(error instanceof Error ? error.message : 'Unable to hire agent.');
    } finally {
      setHiring(false);
    }
  };

  const roots = agents.filter((agent) => !agent.reportsTo);

  return (
    <div className="h-full overflow-auto bg-zinc-950 p-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Interactive Org Chart</h1>
          <p className="mt-1 text-xs text-zinc-500">{agents.length} agents across the workforce</p>
        </div>
        <button type="button" onClick={() => setHireOpen(true)} className="flex items-center gap-2 rounded-md bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-500">
          <Plus className="h-3.5 w-3.5" />Hire Agent
        </button>
      </header>
      {actionMessage && <p role="status" className="mb-4 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">{actionMessage}</p>}

      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-zinc-500">Loading organizational structure...</div>
      ) : (
        <div className="flex min-w-max justify-center">
          {roots.map((root) => (
            <OrgBranch key={root._id} agent={root} agents={agents} onSelect={setSelected} onAction={updateStatus} />
          ))}
        </div>
      )}

      {selected && (
        <AgentDrawer
          agent={selected}
          onClose={() => setSelected(null)}
          onUpdated={(updated) => {
            setSelected(updated);
            setAgents((current) => current.map((item) => item._id === updated._id ? updated : item));
          }}
        />
      )}
      {hireOpen && (
        <AnimatedDialog
          title="Hire an agent"
          description="Add a specialist to this company and configure its first monthly budget."
          onClose={() => setHireOpen(false)}
        >
          <form onSubmit={hireAgent} className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-zinc-400">Agent name
                <input required maxLength={100} value={hireForm.name} onChange={(event) => setHireForm({ ...hireForm, name: event.target.value })} placeholder="e.g. Nova" className="dialog-input" />
              </label>
              <label className="text-xs text-zinc-400">Title
                <input required maxLength={100} value={hireForm.title} onChange={(event) => setHireForm({ ...hireForm, title: event.target.value })} placeholder="e.g. Product Analyst" className="dialog-input" />
              </label>
              <label className="text-xs text-zinc-400">Role
                <select value={hireForm.role} onChange={(event) => setHireForm({ ...hireForm, role: event.target.value as AgentRole })} className="dialog-input">
                  {(['ceo', 'cto', 'engineer', 'researcher', 'marketer', 'qa', 'general'] as AgentRole[]).map((role) => <option key={role} value={role}>{role[0].toUpperCase() + role.slice(1)}</option>)}
                </select>
              </label>
              <label className="text-xs text-zinc-400">Reports to
                <select value={hireForm.reportsTo} onChange={(event) => setHireForm({ ...hireForm, reportsTo: event.target.value })} className="dialog-input">
                  <option value="">No manager</option>
                  {agents.map((agent) => <option key={agent._id} value={agent._id}>{agent.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-zinc-400">AI adapter
                <select value={hireForm.adapterType} onChange={(event) => {
                  const adapterType = event.target.value as AgentAdapterType;
                  setHireForm({ ...hireForm, adapterType, model: adapterType === 'gemini_llm' ? 'gemini-2.5-flash' : 'llama-3.3-70b-versatile' });
                }} className="dialog-input">
                  <option value="groq_llm">Groq</option>
                  <option value="gemini_llm">Gemini</option>
                  <option value="http_webhook">HTTP Webhook</option>
                </select>
              </label>
              <label className="text-xs text-zinc-400">Monthly budget (cents)
                <input type="number" min="0" required value={hireForm.budgetMonthlyCents} onChange={(event) => setHireForm({ ...hireForm, budgetMonthlyCents: Number(event.target.value) })} className="dialog-input" />
              </label>
            </div>
            <label className="block text-xs text-zinc-400">Model
              <input required value={hireForm.model} onChange={(event) => setHireForm({ ...hireForm, model: event.target.value })} className="dialog-input" />
            </label>
            {hireError && <p role="alert" className="text-xs text-red-400">{hireError}</p>}
            <div className="flex justify-end gap-2 border-t border-zinc-800 pt-4">
              <button type="button" onClick={() => setHireOpen(false)} className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">Cancel</button>
              <button type="submit" disabled={hiring} className="rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50">{hiring ? 'Hiring...' : 'Create agent'}</button>
            </div>
          </form>
        </AnimatedDialog>
      )}
    </div>
  );
}

function OrgBranch({
  agent,
  agents,
  onSelect,
  onAction,
}: {
  agent: Agent;
  agents: Agent[];
  onSelect: (agent: Agent) => void;
  onAction: (agent: Agent, action: 'pause' | 'resume' | 'invoke') => Promise<void>;
}) {
  const children = agents.filter((item) => item.reportsTo === agent._id);
  const limit = agent.budgetMonthlyCents * 10000;
  const percent = limit ? Math.min(100, (agent.spentMonthlyMicrocents / limit) * 100) : 0;
  const statusStyles: Record<Agent['status'], string> = {
    idle: 'bg-emerald-500',
    running: 'animate-pulse bg-blue-500',
    paused: 'bg-slate-500',
    budget_stopped: 'bg-red-500',
    error: 'bg-red-500',
    terminated: 'bg-zinc-600',
  };

  return (
    <div className="flex flex-col items-center">
      <div className="content-rise-in w-[260px] rounded-xl border border-zinc-800 bg-zinc-900 p-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600/20 text-sm font-bold text-violet-300">
            {agent.name.charAt(0)}
            <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-900 ${statusStyles[agent.status]}`} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-zinc-100">{agent.name}</p>
            <p className="mt-0.5 truncate text-[10px] uppercase text-zinc-500">{agent.title || agent.role}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-[10px]">
          <span className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-zinc-400">{agent.adapterType.replace('_llm', '').toUpperCase()}</span>
          <span className="text-zinc-500">${(agent.spentMonthlyMicrocents / 1000000).toFixed(2)} / ${(agent.budgetMonthlyCents / 100).toFixed(2)}</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-violet-500" style={{ width: `${percent}%` }} /></div>
        <div className="mt-3 flex gap-1.5">
          <button type="button" onClick={() => onAction(agent, 'invoke')} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-zinc-700 py-1.5 text-[10px] text-zinc-300 hover:bg-zinc-800"><Play className="h-3 w-3" />Run</button>
          <button type="button" onClick={() => onAction(agent, agent.status === 'paused' ? 'resume' : 'pause')} className="rounded-md border border-zinc-700 px-2 py-1.5 text-zinc-400 hover:bg-zinc-800">{agent.status === 'paused' ? <RotateCw className="h-3 w-3" /> : <Pause className="h-3 w-3" />}</button>
          <button type="button" onClick={() => onSelect(agent)} className="rounded-md border border-zinc-700 px-2 py-1.5 text-zinc-400 hover:bg-zinc-800"><Edit3 className="h-3 w-3" /></button>
        </div>
      </div>
      {children.length > 0 && (
        <>
          <div className="h-8 w-px bg-zinc-700" />
          <div className="flex gap-8 border-t border-zinc-700 pt-8">
            {children.map((child) => (
              <div key={child._id} className="relative before:absolute before:-top-8 before:left-1/2 before:h-8 before:w-px before:bg-zinc-700">
                <OrgBranch agent={child} agents={agents} onSelect={onSelect} onAction={onAction} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
