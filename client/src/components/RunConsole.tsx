// ─────────────────────────────────────────────────────────────
// RunConsole.tsx — Live SSE Heartbeat Terminal Console
// Developer 3 • Paperclip MERN (Day 8)
//
// Appearance: Right-hand slide-over drawer (520px wide) with
// high-contrast dark slate terminal styling (#0F172A).
// Streams live execution events from GET /api/runs/:id/stream:
//   event: log    -> data: { ts, level, message }
//   event: usage  -> data: { inputTokens, outputTokens, costMicrocents }
//   event: done   -> data: { status }
// Color-coded levels:
//   SYSTEM (Gray), THOUGHT (Cyan), TOOL_CALL (Amber), ERROR (Red), SUCCESS (Emerald)
// ─────────────────────────────────────────────────────────────

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Terminal,
  Circle,
  Clock,
  Coins,
  Cpu,
  RotateCcw,
  Copy,
  Check,
  ChevronDown,
  Pause,
  Play,
  Bot,
  AlertOctagon,
  Sparkles,
  ArrowDownCircle,
  FileCode,
} from 'lucide-react';
import { apiGet } from '../lib/api';
import type {
  HeartbeatRun,
  RunLogEntry,
  Agent,
  Issue,
} from '../types/models';

// ── Props ──────────────────────────────────────────────────

interface RunConsoleProps {
  /** The HeartbeatRun _id to monitor */
  runId: string | null;
  /** Active company ID */
  companyId?: string;
  /** Optional linked issue ID */
  issueId?: string;
  /** Callback to close console */
  onClose: () => void;
}

// ── Log Level Styling ──────────────────────────────────────

const LOG_LEVEL_STYLES: Record<
  string,
  { label: string; textClass: string; badgeClass: string }
> = {
  SYSTEM: {
    label: 'SYSTEM',
    textClass: 'text-zinc-400',
    badgeClass: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  },
  INFO: {
    label: 'INFO',
    textClass: 'text-zinc-300',
    badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  },
  THOUGHT: {
    label: 'THOUGHT',
    textClass: 'text-cyan-300',
    badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60',
  },
  LLM_THOUGHT: {
    label: 'THOUGHT',
    textClass: 'text-cyan-300',
    badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60',
  },
  TOOL_CALL: {
    label: 'TOOL',
    textClass: 'text-amber-300',
    badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800/60',
  },
  BUDGET: {
    label: 'BUDGET',
    textClass: 'text-orange-300',
    badgeClass: 'bg-orange-950/80 text-orange-300 border-orange-800/60',
  },
  ERROR: {
    label: 'ERROR',
    textClass: 'text-red-400 font-semibold',
    badgeClass: 'bg-red-950 text-red-300 border-red-800',
  },
  SUCCESS: {
    label: 'SUCCESS',
    textClass: 'text-emerald-300',
    badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
  },
};

// ── Helper to format microcents into USD string ────────────

function formatMicrocents(mc: number): string {
  // 10,000 microcents = $0.01 (1 cent)
  // 1,000,000 microcents = $1.00
  const usd = mc / 1_000_000;
  return `$${usd.toFixed(4)}`;
}

// ── Component ──────────────────────────────────────────────

export default function RunConsole({
  runId,
  companyId,
  issueId,
  onClose,
}: RunConsoleProps) {
  const [logs, setLogs] = useState<RunLogEntry[]>([]);
  const [streamStatus, setStreamStatus] = useState<
    'connecting' | 'streaming' | 'completed' | 'failed' | 'idle'
  >('idle');
  const [inputTokens, setInputTokens] = useState<number>(0);
  const [outputTokens, setOutputTokens] = useState<number>(0);
  const [costMicrocents, setCostMicrocents] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const terminalBodyRef = useRef<HTMLDivElement>(null);

  // ── Initial Snapshot Fetch ───────────────────────────────
  const runQuery = useQuery({
    queryKey: ['run', runId],
    queryFn: () => apiGet<HeartbeatRun>(`/api/runs/${runId}`),
    enabled: !!runId,
    staleTime: 5_000,
  });

  // Seed initial logs and usage from the existing run record
  useEffect(() => {
    if (runQuery.data) {
      if (runQuery.data.logs?.length) {
        setLogs(runQuery.data.logs);
      }
      setInputTokens(runQuery.data.inputTokens || 0);
      setOutputTokens(runQuery.data.outputTokens || 0);
      setCostMicrocents(runQuery.data.costMicrocents || 0);

      if (runQuery.data.status === 'succeeded') {
        setStreamStatus('completed');
      } else if (
        runQuery.data.status === 'failed' ||
        runQuery.data.status === 'budget_stopped' ||
        runQuery.data.status === 'stalled'
      ) {
        setStreamStatus('failed');
      }
    }
  }, [runQuery.data]);

  // ── Elapsed Timer ────────────────────────────────────────
  useEffect(() => {
    if (streamStatus !== 'streaming' && streamStatus !== 'connecting') return;
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [streamStatus]);

  // ── Server-Sent Events (SSE) Stream Connection ───────────
  useEffect(() => {
    if (!runId) return;

    let aborted = false;
    const controller = new AbortController();
    setStreamStatus('connecting');

    const token = localStorage.getItem('token');
    const apiBase = import.meta.env.VITE_API_URL ?? '';
    const streamUrl = `${apiBase}/api/runs/${runId}/stream`;

    // Connect via fetch reader to support Bearer JWT headers cleanly
    async function startStream() {
      try {
        const headers: Record<string, string> = {
          Accept: 'text/event-stream',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(streamUrl, {
          headers,
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`SSE stream returned HTTP ${res.status}`);
        }

        setStreamStatus('streaming');

        const reader = res.body?.getReader();
        if (!reader) throw new Error('ReadableStream not supported');

        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (!aborted) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() ?? '';

          for (const chunk of lines) {
            const rawEvent = chunk.trim();
            if (!rawEvent) continue;

            let eventType = 'message';
            let dataStr = '';

            for (const line of rawEvent.split('\n')) {
              if (line.startsWith('event:')) {
                eventType = line.replace('event:', '').trim();
              } else if (line.startsWith('data:')) {
                dataStr = line.replace('data:', '').trim();
              }
            }

            if (!dataStr) continue;

            try {
              const parsed = JSON.parse(dataStr);

              if (eventType === 'log') {
                setLogs((prev) => [
                  ...prev,
                  {
                    ts: parsed.ts || new Date().toISOString(),
                    level: (parsed.level || 'INFO').toUpperCase(),
                    message: parsed.message || '',
                  },
                ]);
              } else if (eventType === 'usage') {
                if (parsed.inputTokens !== undefined)
                  setInputTokens(parsed.inputTokens);
                if (parsed.outputTokens !== undefined)
                  setOutputTokens(parsed.outputTokens);
                if (parsed.costMicrocents !== undefined)
                  setCostMicrocents(parsed.costMicrocents);
              } else if (eventType === 'done') {
                setStreamStatus(
                  parsed.status === 'succeeded' ? 'completed' : 'failed',
                );
              }
            } catch (err) {
              console.warn('Malformed SSE event data:', dataStr, err);
            }
          }
        }

        if (!aborted) {
          setStreamStatus((curr) => (curr === 'streaming' ? 'completed' : curr));
        }
      } catch (err: unknown) {
        if (aborted) return;
        console.error('SSE Stream error:', err);
        setStreamStatus('failed');
      }
    }

    startStream();

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [runId]);

  // ── Auto-scroll to bottom ────────────────────────────────
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Copy logs to clipboard
  const handleCopyLogs = useCallback(() => {
    const text = logs
      .map(
        (l) =>
          `[${new Date(l.ts).toLocaleTimeString()}] [${l.level}] ${l.message}`,
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [logs]);

  if (!runId) return null;

  const runData = runQuery.data;
  const agentName = runData?.agent?.name || 'Worker Agent';
  const issueKey = runData?.issue?.identifier || runData?.issue?.issueKey || issueId;

  // Format timer
  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const ss = String(elapsedSeconds % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Dim backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Terminal Drawer (520px wide, #0F172A slate theme) */}
      <div className="relative z-10 flex h-full w-full max-w-[540px] flex-col border-l border-slate-800 bg-[#0F172A] text-slate-100 shadow-2xl font-mono">
        {/* ── Terminal Header ────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5 bg-[#090E1A]">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-800 text-cyan-400">
              <Terminal className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-200">
                  {agentName}
                </span>
                {issueKey && (
                  <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400 font-semibold">
                    {issueKey}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500">
                Run #{runId.slice(-6)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Streaming Indicator */}
            {streamStatus === 'streaming' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400 animate-pulse">
                <Circle className="h-2 w-2 fill-blue-400" />
                Live
              </span>
            ) : streamStatus === 'completed' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                <Check className="h-2.5 w-2.5" />
                Done
              </span>
            ) : streamStatus === 'failed' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                <AlertOctagon className="h-2.5 w-2.5" />
                Failed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                Connecting…
              </span>
            )}

            <button
              onClick={onClose}
              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Metric Telemetry Bar (Time, Tokens, Cost) ──── */}
        <div className="grid grid-cols-3 gap-2 border-b border-slate-800 bg-[#0B1120] px-5 py-2.5 text-xs">
          {/* Elapsed Timer */}
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-500">
                Elapsed
              </p>
              <p className="text-xs font-semibold text-slate-200">
                {mm}:{ss}s
              </p>
            </div>
          </div>

          {/* Tokens Count */}
          <div className="flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-violet-400" />
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-500">
                Tokens (In/Out)
              </p>
              <p className="text-xs font-semibold text-slate-200">
                {inputTokens} / {outputTokens}
              </p>
            </div>
          </div>

          {/* Microcent Cost */}
          <div className="flex items-center gap-1.5">
            <Coins className="h-3.5 w-3.5 text-amber-400" />
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-500">
                Spend
              </p>
              <p className="text-xs font-semibold text-amber-300">
                {formatMicrocents(costMicrocents)}
              </p>
            </div>
          </div>
        </div>

        {/* ── Console Action Bar (Auto-scroll, Copy, Clear) ─ */}
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-2 text-[11px] bg-[#0E1626]">
          <span className="text-slate-500">
            {logs.length} stream event{logs.length !== 1 ? 's' : ''}
          </span>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoScroll((p) => !p)}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
                autoScroll
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/50'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Toggle Auto-Scroll"
            >
              {autoScroll ? (
                <ArrowDownCircle className="h-3 w-3" />
              ) : (
                <Pause className="h-3 w-3" />
              )}
              <span>Auto-scroll</span>
            </button>

            <button
              onClick={handleCopyLogs}
              className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200"
              title="Copy all logs"
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* ── Terminal Event Log Body ────────────────────── */}
        <div
          ref={terminalBodyRef}
          className="flex-1 overflow-y-auto p-4 space-y-2 text-xs leading-relaxed font-mono bg-[#090E1A]"
        >
          {logs.map((log, idx) => {
            const levelStyle =
              LOG_LEVEL_STYLES[log.level] ?? LOG_LEVEL_STYLES.INFO;
            const timeStr = new Date(log.ts).toLocaleTimeString([], {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            return (
              <div
                key={idx}
                className="flex items-start gap-2.5 rounded px-2 py-1 hover:bg-slate-900/60 transition-colors"
              >
                {/* Timestamp */}
                <span className="shrink-0 text-[10px] text-slate-600 select-none">
                  {timeStr}
                </span>

                {/* Level Tag */}
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.2 text-[9px] font-bold tracking-wider select-none ${levelStyle.badgeClass}`}
                >
                  {levelStyle.label}
                </span>

                {/* Log message */}
                <span
                  className={`flex-1 break-words whitespace-pre-wrap ${levelStyle.textClass}`}
                >
                  {log.message}
                </span>
              </div>
            );
          })}

          {logs.length === 0 && (
            <div className="flex h-48 flex-col items-center justify-center text-center text-slate-600 text-xs">
              <Terminal className="h-8 w-8 mb-2 opacity-40" />
              <p>Waiting for agent SSE stream events…</p>
            </div>
          )}

          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}
