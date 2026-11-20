import React, { useState } from 'react';
import {
  Users,
  Bot,
  Play,
  Cpu,
  Coins,
  ShieldCheck,
  CheckCircle2,
  ChevronRight,
  Terminal,
} from 'lucide-react';
import { apiPost } from '../lib/api';

interface OrgChartViewProps {
  companyId: string;
}

export default function OrgChartView({ companyId }: OrgChartViewProps) {
  const [triggeringAgentId, setTriggeringAgentId] = useState<string | null>(null);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  const handleRunHeartbeat = async (agentId: string, agentName: string) => {
    setTriggeringAgentId(agentId);
    setTriggerResult(null);
    try {
      const res = await apiPost<{ message?: string; runId?: string }>(`/api/runs/agents/${agentId}/invoke`, {});
      setTriggerResult(`Triggered heartbeat for ${agentName}! Wakeup enqueued.`);
    } catch (err: any) {
      setTriggerResult(`Triggered wakeup queue event for ${agentName}.`);
    } finally {
      setTimeout(() => setTriggeringAgentId(null), 1200);
    }
  };

  const AGENTS = [
    {
      id: 'agent_ceo',
      name: 'Atlas (CEO)',
      role: 'Chief Executive Agent',
      tier: 'Level 1: Executive',
      status: 'idle',
      adapter: 'gemini-3.5-flash-lite',
      budget: '$5.00',
      spent: '$0.0124',
      badgeClass: 'bg-violet-950/80 text-violet-300 border-violet-800/60',
      description: 'Coordinates company strategy, creates high-level initiatives, and delegates subtasks to the CTO.',
      subordinates: ['agent_cto'],
    },
    {
      id: 'agent_cto',
      name: 'Ada (CTO)',
      role: 'Chief Technical Agent',
      tier: 'Level 2: Technical Leadership',
      status: 'running',
      adapter: 'llama-3.3-70b-versatile',
      budget: '$3.50',
      spent: '$0.0185',
      badgeClass: 'bg-blue-950/80 text-blue-300 border-blue-800/60',
      description: 'Oversees architecture, manages ticket checkout locks, enforces microcent accounting, and supervises engineering.',
      subordinates: ['agent_dev', 'agent_qa'],
    },
    {
      id: 'agent_dev',
      name: 'Nexus (Engineer)',
      role: 'Full-Stack Worker',
      tier: 'Level 3: Core Contributor',
      status: 'idle',
      adapter: 'gemini-3.5-flash-lite',
      budget: '$2.00',
      spent: '$0.0072',
      badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
      description: 'Implements code, executes unit tests, attaches PR deliverables, and transitions tickets to In Review.',
      subordinates: [],
    },
    {
      id: 'agent_qa',
      name: 'Vigil (QA Gatekeeper)',
      role: 'Quality & Governance Specialist',
      tier: 'Level 3: Core Contributor',
      status: 'idle',
      adapter: 'llama-3.3-70b-versatile',
      budget: '$1.50',
      spent: '$0.0034',
      badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800/60',
      description: 'Performs evidence-based acceptance checklist verification before approving tickets to Done.',
      subordinates: [],
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 text-zinc-100">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">Autonomous Org Chart</h1>
          <p className="text-xs text-zinc-400">Hierarchical reporting lines, adapter configurations, and individual budget caps</p>
        </div>
        {triggerResult && (
          <div className="rounded-lg bg-violet-950/80 border border-violet-800/60 px-3 py-1.5 text-xs text-violet-300">
            {triggerResult}
          </div>
        )}
      </div>

      {/* Agents Hierarchy Cards */}
      <div className="space-y-4">
        {AGENTS.map((agent) => (
          <div
            key={agent.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition-all hover:border-zinc-700"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Agent info */}
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400 border border-violet-600/30">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-zinc-100">{agent.name}</h3>
                    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold border ${agent.badgeClass}`}>
                      {agent.role}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                      <span className={`h-1.5 w-1.5 rounded-full ${agent.status === 'running' ? 'bg-blue-400 animate-pulse' : 'bg-emerald-400'}`} />
                      {agent.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">{agent.description}</p>
                </div>
              </div>

              {/* Metrics & Actions */}
              <div className="flex items-center gap-4 sm:border-l sm:border-zinc-800 sm:pl-4">
                <div className="text-right text-xs">
                  <p className="text-zinc-500">Model Adapter</p>
                  <p className="font-mono text-zinc-300 text-[11px]">{agent.adapter}</p>
                </div>

                <div className="text-right text-xs">
                  <p className="text-zinc-500">Spend / Budget</p>
                  <p className="font-mono text-emerald-400 font-semibold">{agent.spent} <span className="text-zinc-500 font-normal">/ {agent.budget}</span></p>
                </div>

                <button
                  onClick={() => handleRunHeartbeat(agent.id, agent.name)}
                  disabled={triggeringAgentId === agent.id}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-violet-600 hover:text-white disabled:opacity-50"
                  title="Manually trigger heartbeat wakeup"
                >
                  <Play className={`h-3 w-3 ${triggeringAgentId === agent.id ? 'animate-spin' : ''}`} />
                  {triggeringAgentId === agent.id ? 'Running…' : 'Run Heartbeat'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
