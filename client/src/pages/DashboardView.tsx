import React from 'react';
import {
  TrendingUp,
  Users,
  CheckCircle2,
  Clock,
  Coins,
  ShieldCheck,
  Zap,
  Activity,
  Layers,
} from 'lucide-react';

interface DashboardViewProps {
  companyId: string;
}

export default function DashboardView({ companyId }: DashboardViewProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6 text-zinc-100">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">Executive Control Dashboard</h1>
          <p className="text-xs text-zinc-400">Autonomous Workforce Operations & Microcent Spend Telemetry</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-3 py-1.5 text-xs text-emerald-400 font-medium">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
          Autonomous Loop Active
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1 */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Active AI Agents</span>
            <Users className="h-4 w-4 text-violet-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-100">4 Agents</p>
          <p className="mt-1 text-[11px] text-zinc-500">CEO, CTO, Engineer, QA Specialist</p>
        </div>

        {/* Card 2 */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Total Issues Managed</span>
            <Layers className="h-4 w-4 text-blue-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-100">5 Tickets</p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span className="text-emerald-400 font-medium">1 Done</span> •
            <span className="text-amber-400 font-medium">2 Active</span> •
            <span>2 Backlog</span>
          </div>
        </div>

        {/* Card 3 */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Monthly Token Spend</span>
            <Coins className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-100">$0.0415</p>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-400">
            <TrendingUp className="h-3 w-3" />
            <span>415,000 microcents (8.3% of $5 cap)</span>
          </div>
        </div>

        {/* Card 4 */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Heartbeat Watchdog</span>
            <Activity className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-400">Healthy</p>
          <p className="mt-1 text-[11px] text-zinc-500">30s sweep • 0 zombie locks</p>
        </div>
      </div>

      {/* Main Grid: Active Sprints & Budget Gauges */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Active Heartbeat Execution */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-zinc-200">Active Strategic Goals</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/80 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-violet-300">Goal 1: Launch Paperclip MERN MVP</span>
                <span className="rounded bg-violet-950 px-2 py-0.5 text-[10px] text-violet-300 font-medium border border-violet-800/50">In Progress</span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">Deploy control plane with $0 monthly operational budget on Gemini Flash.</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-1.5 flex-1 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: '60%' }} />
                </div>
                <span className="text-[11px] font-mono text-zinc-400">60%</span>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/80 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-300">Goal 2: Autonomous Multi-Agent Loop</span>
                <span className="rounded bg-blue-950 px-2 py-0.5 text-[10px] text-blue-300 font-medium border border-blue-800/50">Active</span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">Verify 409 atomic lock contention, watchdog recovery, and microcent circuit breakers.</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-1.5 flex-1 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: '85%' }} />
                </div>
                <span className="text-[11px] font-mono text-zinc-400">85%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Governance & Safeguards */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-semibold text-zinc-200">Governance & Safeguards</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-2.5 rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-zinc-200">AES-256-GCM Vault</p>
                <p className="text-[11px] text-zinc-500">API keys encrypted with 12-byte IV and 16-byte auth tag.</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-2.5">
              <Clock className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-zinc-200">5-Min Atomic Lease</p>
                <p className="text-[11px] text-zinc-500">Guarantees zero concurrency race conditions between agents.</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-2.5">
              <Zap className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-zinc-200">Gemini 3.5 Flash-Lite</p>
                <p className="text-[11px] text-zinc-500">Sub-2s response latency with zero operational API bill.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
