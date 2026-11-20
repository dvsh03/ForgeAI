import { useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { apiDownload, apiGet } from '../lib/api';

interface AuditEntry {
  _id: string;
  actorType: 'user' | 'agent' | 'system';
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export default function AuditLogPage({ companyId }: { companyId: string }) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiGet<AuditEntry[] | { logs: AuditEntry[] }>(`/api/companies/${companyId}/audit`)
      .then((response) => setLogs(Array.isArray(response) ? response : response.logs))
      .catch(() => setLogs(DEMO_LOGS));
  }, [companyId]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return logs;
    return logs.filter((entry) => JSON.stringify(entry).toLowerCase().includes(query));
  }, [logs, search]);

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 p-6">
      <header className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Activity Audit Log</h1>
          <p className="mt-1 text-xs text-zinc-500">Immutable workspace action history</p>
        </div>
        <button type="button" onClick={() => apiDownload(`/api/companies/${companyId}/audit/export`, `audit-log-${Date.now()}.csv`)} className="flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">
          <Download className="h-3.5 w-3.5" />Export CSV
        </button>
      </header>

      <div className="mb-3 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3">
        <Search className="h-4 w-4 text-zinc-500" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter actor, action, entity, or details" className="h-10 flex-1 bg-transparent text-xs text-zinc-200 outline-none" />
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-left">
          <thead className="bg-zinc-900 text-[10px] uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950 text-xs text-zinc-300">
            {filtered.map((entry) => (
              <tr key={entry._id}>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-[10px] text-zinc-500">{new Date(entry.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3"><span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px]">{entry.actorType}</span></td>
                <td className="px-4 py-3 font-medium">{entry.action}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-zinc-500">{entry.entityType}: {entry.entityId}</td>
                <td className="max-w-sm truncate px-4 py-3 text-zinc-500">{JSON.stringify(entry.details)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-500">No audit entries match the filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const DEMO_LOGS: AuditEntry[] = [
  { _id: 'log_1', actorType: 'user', actorId: 'user_1', action: 'update_company', entityType: 'Company', entityId: 'demo_company_1', details: { budgetMonthlyCents: 500 }, createdAt: new Date(Date.now() - 600000).toISOString() },
  { _id: 'log_2', actorType: 'agent', actorId: 'agent_cto', action: 'submit_for_review', entityType: 'Issue', entityId: 'PAP-3', details: { status: 'in_review' }, createdAt: new Date(Date.now() - 1800000).toISOString() },
  { _id: 'log_3', actorType: 'system', actorId: 'heartbeat_watchdog', action: 'release_stalled_lock', entityType: 'HeartbeatRun', entityId: 'run_old', details: { issueId: 'PAP-5' }, createdAt: new Date(Date.now() - 3600000).toISOString() },
];
