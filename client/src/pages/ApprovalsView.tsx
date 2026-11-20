import React, { useState } from 'react';
import {
  ShieldAlert,
  Check,
  X,
  UserPlus,
  TrendingUp,
  Clock,
  AlertCircle,
  Coins,
} from 'lucide-react';

export default function ApprovalsView() {
  const [approvals, setApprovals] = useState([
    {
      id: 'appr_1',
      type: 'hire_agent',
      title: 'Request to Provision AI Growth Marketer',
      requester: 'Atlas (CEO)',
      requestedAt: '20 minutes ago',
      details: 'CEO requests to hire Sarah Connor (Growth Marketer) with Gemini 3.5 Flash Lite adapter to execute developer audience marketing and technical documentation sprints.',
      budgetImpact: '+$20.00 / month',
      status: 'pending',
    },
    {
      id: 'appr_2',
      type: 'budget_override',
      title: 'Engineering Sprint Token Cap Expansion',
      requester: 'Ada (CTO)',
      requestedAt: '1 hour ago',
      details: 'CTO requests a temporary $2.00 increase to the monthly microcent ceiling for Nexus (Engineer) to finish large-scale end-to-end integration test execution.',
      budgetImpact: '+$2.00 token cap',
      status: 'pending',
    },
  ]);

  const [notification, setNotification] = useState<string | null>(null);

  const handleAction = (id: string, action: 'approved' | 'rejected') => {
    setApprovals((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: action } : a))
    );
    setNotification(`Approval request #${id} marked as ${action.toUpperCase()}`);
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 text-zinc-100">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">Human-in-the-Loop Approvals</h1>
          <p className="text-xs text-zinc-400">Review and authorize sensitive autonomous actions, agent hirings, and budget cap changes</p>
        </div>
        {notification && (
          <div className="rounded-lg bg-emerald-950/80 border border-emerald-800/60 px-3 py-1.5 text-xs text-emerald-300">
            {notification}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {approvals.map((appr) => (
          <div
            key={appr.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition-all"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-100">{appr.title}</h3>
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                      Requested by {appr.requester}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-300 max-w-2xl">{appr.details}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs text-zinc-500">
                    <span className="flex items-center gap-1 font-mono text-amber-400">
                      <Coins className="h-3.5 w-3.5" />
                      {appr.budgetImpact}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {appr.requestedAt}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                {appr.status === 'pending' ? (
                  <>
                    <button
                      onClick={() => handleAction(appr.id, 'rejected')}
                      className="flex items-center gap-1 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-900/60 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </button>
                    <button
                      onClick={() => handleAction(appr.id, 'approved')}
                      className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                  </>
                ) : (
                  <span
                    className={`rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${
                      appr.status === 'approved'
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                        : 'bg-red-950/80 text-red-300 border border-red-800'
                    }`}
                  >
                    {appr.status}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
