import { useEffect, useState } from 'react';
import { Check, TriangleAlert, X } from 'lucide-react';
import type { Approval } from '../types/models';
import { apiGet, apiPost } from '../lib/api';

export default function ApprovalsPage({ companyId }: { companyId: string }) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [incidents, setIncidents] = useState<BudgetIncident[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyApprovalId, setBusyApprovalId] = useState('');
  const [busyIncidentId, setBusyIncidentId] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    Promise.all([
      apiGet<{ approvals: Approval[] }>(`/api/companies/${companyId}/approvals`),
      apiGet<{ incidents: BudgetIncident[] }>(`/api/companies/${companyId}/budget-incidents`),
    ])
      .then(([approvalResponse, incidentResponse]) => {
        setApprovals(approvalResponse.approvals);
        setIncidents(incidentResponse.incidents);
      })
      .catch(() => {
        setApprovals(DEMO_APPROVALS);
        setIncidents(DEMO_INCIDENTS);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  const decide = async (approval: Approval, decision: 'approved' | 'rejected') => {
    setBusyApprovalId(approval._id);
    setActionError('');
    try {
      await apiPost(`/api/approvals/${approval._id}/decide`, {
        decision,
        decisionNote: notes[approval._id] || '',
      });
      setApprovals((current) => current.map((item) => item._id === approval._id ? { ...item, status: decision } : item));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to save approval decision.');
    } finally {
      setBusyApprovalId('');
    }
  };

  const raiseBudget = async (incident: BudgetIncident) => {
    setBusyIncidentId(incident._id);
    setActionError('');
    const newBudgetMonthlyCents = Math.max(
      incident.budgetMonthlyCents + 100,
      Math.ceil(incident.spentMonthlyMicrocents / 10000) + 1,
    );
    try {
      await apiPost(`/api/budget-incidents/${incident._id}/resolve`, {
        newBudgetMonthlyCents,
        resolutionNote: 'Budget raised by the board owner.',
      });
      setIncidents((current) => current.filter((item) => item._id !== incident._id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to resolve budget incident.');
    } finally {
      setBusyIncidentId('');
    }
  };

  const pending = approvals.filter((approval) => approval.status === 'pending');
  const activeIncident = incidents[0];

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 p-6">
      {activeIncident && <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TriangleAlert className="h-5 w-5 text-red-400" />
            <div>
              <p className="text-sm font-semibold text-red-300">Agent paused at 100% monthly budget</p>
              <p className="mt-0.5 text-xs text-zinc-500">{activeIncident.agentName} reached its configured spending limit.</p>
            </div>
          </div>
          <button type="button" disabled={busyIncidentId === activeIncident._id} onClick={() => void raiseBudget(activeIncident)} className="rounded-md border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50">
            {busyIncidentId === activeIncident._id ? 'Resolving...' : 'Raise Budget & Resume'}
          </button>
        </div>
      </div>}
      {actionError && <p role="alert" className="mb-4 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">{actionError}</p>}

      <header className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Governance Approvals</h1>
          <p className="mt-1 text-xs text-zinc-500">{pending.length} decisions waiting for the human board</p>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading approval queue...</p>
      ) : (
        <div className="grid gap-3">
          {pending.map((approval) => (
            <article key={approval._id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-400">Pending</span>
                    <span className="text-xs text-zinc-500">{approval.type.replace(/_/g, ' ')}</span>
                  </div>
                  <h2 className="mt-3 text-sm font-semibold text-zinc-100">
                    {approval.type === 'hire_agent' ? `Hire ${String(approval.payload.role || 'new specialist')}` : approval.type === 'budget_override' ? 'Increase monthly budget' : 'Approve strategy plan'}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">Requested by agent <span className="font-mono text-zinc-400">{approval.requestedByAgentId}</span></p>
                </div>
              </div>

              <pre className="mt-4 max-h-40 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
                {JSON.stringify(approval.payload, null, 2)}
              </pre>

              <div className="mt-4 flex items-end gap-3">
                <label className="flex-1 text-xs text-zinc-500">Decision note
                  <input
                    value={notes[approval._id] || ''}
                    onChange={(event) => setNotes((current) => ({ ...current, [approval._id]: event.target.value }))}
                    placeholder="Optional feedback for the requesting agent"
                    className="mt-2 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-violet-500"
                  />
                </label>
                <button type="button" disabled={busyApprovalId === approval._id} onClick={() => void decide(approval, 'rejected')} className="flex items-center gap-1.5 rounded-md border border-red-500/40 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"><X className="h-3.5 w-3.5" />Reject</button>
                <button type="button" disabled={busyApprovalId === approval._id} onClick={() => void decide(approval, 'approved')} className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"><Check className="h-3.5 w-3.5" />Approve</button>
              </div>
            </article>
          ))}
          {pending.length === 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-10 text-center text-sm text-zinc-500">No pending approvals.</div>
          )}
        </div>
      )}
    </div>
  );
}

interface BudgetIncident {
  _id: string;
  agentId: string;
  agentName: string;
  spentMonthlyMicrocents: number;
  budgetMonthlyCents: number;
}

const DEMO_INCIDENTS: BudgetIncident[] = [
  {
    _id: 'incident_demo_1',
    agentId: 'agent_ceo',
    agentName: 'Atlas (CEO)',
    spentMonthlyMicrocents: 5000000,
    budgetMonthlyCents: 500,
  },
];

const DEMO_APPROVALS: Approval[] = [
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
];
