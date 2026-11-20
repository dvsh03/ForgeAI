import React from 'react';
import {
  KeyRound,
  ShieldCheck,
  Server,
  Zap,
  HardDrive,
  Database,
  Lock,
} from 'lucide-react';

export default function SettingsView() {
  return (
    <div className="flex-1 overflow-y-auto p-6 text-zinc-100">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-zinc-100">Control Plane Settings</h1>
        <p className="text-xs text-zinc-400">Security vault, LLM provider adapters, and environment health</p>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* Security & Vault */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-zinc-200">
            <Lock className="h-4 w-4 text-violet-400" />
            AES-256-GCM Encrypted Vault
          </div>
          <p className="text-xs text-zinc-400 mb-4">
            Master 32-byte encryption key protects LLM API keys. Decrypted strictly in-memory during agent heartbeat execution.
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div>
                <p className="text-xs font-medium text-zinc-200">Google Gemini Flash Key</p>
                <p className="font-mono text-[11px] text-zinc-500">AQ.Ab8RN6••••••••••••••••••••••••JH4M2jJ9vJg</p>
              </div>
              <span className="rounded bg-emerald-950/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-800">
                ACTIVE (Free Tier)
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div>
                <p className="text-xs font-medium text-zinc-200">Groq Llama 3.3 Key</p>
                <p className="font-mono text-[11px] text-zinc-500">gsk_••••••••••••••••••••••••••••••••</p>
              </div>
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                OPTIONAL
              </span>
            </div>
          </div>
        </div>

        {/* Database & Infrastructure */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-zinc-200">
            <Database className="h-4 w-4 text-blue-400" />
            Infrastructure & Database
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <span className="text-zinc-500">Database Engine</span>
              <p className="mt-1 font-semibold text-zinc-200">Auto In-Memory MongoDB</p>
              <span className="text-[10px] text-emerald-400">Operational ($0 Local Cost)</span>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <span className="text-zinc-500">Backend Port & Proxy</span>
              <p className="mt-1 font-semibold text-zinc-200">5000 ➔ 5173</p>
              <span className="text-[10px] text-zinc-400">Vite Proxy Configured</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
