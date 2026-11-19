import { useEffect, useState } from 'react';
import { RotateCcw, Save, X } from 'lucide-react';
import type { Agent } from '../types/models';
import { apiGet, apiPatch, apiPost } from '../lib/api';

interface AgentDrawerProps {
  agent: Agent;
  onClose: () => void;
  onUpdated: (agent: Agent) => void;
}

export default function AgentDrawer({ agent, onClose, onUpdated }: AgentDrawerProps) {
  const [tab, setTab] = useState<'instructions' | 'history' | 'budget'>('instructions');
  const [draft, setDraft] = useState(agent.instructionsMarkdown);
  const [budget, setBudget] = useState(agent.budgetMonthlyCents);
  const [heartbeatCron, setHeartbeatCron] = useState(agent.adapterConfig.heartbeatCron || '0 * * * *');
  const [saving, setSaving] = useState(false);
  const [revisions, setRevisions] = useState<Array<{ _id: string; changedKeys: string[]; createdAt: string }>>([]);

  useEffect(() => {
    setDraft(agent.instructionsMarkdown);
    setBudget(agent.budgetMonthlyCents);
    setHeartbeatCron(agent.adapterConfig.heartbeatCron || '0 * * * *');
  }, [agent]);

  useEffect(() => {
    if (tab === 'history') {
      apiGet<Array<{ _id: string; changedKeys: string[]; createdAt: string }>>(`/api/agents/${agent._id}/revisions`)
        .then(setRevisions)
        .catch(() => setRevisions([
          { _id: 'rev_initial', changedKeys: ['instructionsMarkdown', 'adapterType'], createdAt: agent.updatedAt },
        ]));
    }
  }, [tab, agent]);

  const restoreRevision = async (revisionId: string) => {
    const updated = await apiPost<Agent>(`/api/agents/${agent._id}/revisions/${revisionId}/rollback`);
    setDraft(updated.instructionsMarkdown);
    onUpdated(updated);
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await apiPatch<Agent>(`/api/agents/${agent._id}`, {
        instructionsMarkdown: draft,
        budgetMonthlyCents: budget,
        heartbeatCron,
      });
      onUpdated(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[520px] border-l border-zinc-700 bg-zinc-950 shadow-2xl">
      <header className="flex h-16 items-center justify-between border-b border-zinc-800 px-5">
        <div>
          <p className="text-sm font-semibold text-zinc-100">{agent.name}</p>
          <p className="text-xs text-zinc-500">{agent.title || agent.role}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><X className="h-4 w-4" /></button>
      </header>

      <div className="flex border-b border-zinc-800 px-5">
        {(['instructions', 'history', 'budget'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`border-b-2 px-4 py-3 text-xs capitalize ${tab === item ? 'border-violet-500 text-violet-300' : 'border-transparent text-zinc-500'}`}
          >
            {item === 'budget' ? 'Budget & Schedule' : item}
          </button>
        ))}
      </div>

      <div className="h-[calc(100%-9.25rem)] overflow-y-auto p-5">
        {tab === 'instructions' && (
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={15000}
            className="h-[32rem] w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 p-4 font-mono text-xs leading-6 text-zinc-200 outline-none focus:border-violet-500"
          />
        )}
        {tab === 'history' && (
          <div className="space-y-2">
            {revisions.map((revision) => (
              <div key={revision._id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <div>
                  <p className="text-xs font-medium text-zinc-200">{revision.changedKeys.join(', ')}</p>
                  <p className="mt-1 text-[10px] text-zinc-500">{new Date(revision.createdAt).toLocaleString()}</p>
                </div>
                <button type="button" onClick={() => restoreRevision(revision._id)} className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                  <RotateCcw className="h-3.5 w-3.5" />Restore
                </button>
              </div>
            ))}
          </div>
        )}
        {tab === 'budget' && (
          <div className="space-y-4">
            <label className="block text-xs text-zinc-400">Monthly budget (USD cents)
              <input type="number" min="0" value={budget} onChange={(event) => setBudget(Number(event.target.value))} className="mt-2 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200" />
            </label>
            <label className="block text-xs text-zinc-400">Heartbeat schedule
              <input value={heartbeatCron} onChange={(event) => setHeartbeatCron(event.target.value)} className="mt-2 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-200" />
            </label>
          </div>
        )}
      </div>

      <footer className="flex h-16 items-center justify-end border-t border-zinc-800 px-5">
        <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
          <Save className="h-3.5 w-3.5" />{saving ? 'Saving...' : 'Save changes'}
        </button>
      </footer>
    </div>
  );
}
