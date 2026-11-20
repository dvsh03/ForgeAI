import { useEffect, useRef, useState } from 'react';
import { Download, KeyRound, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from '../lib/api';
import type { Company } from '../types/models';
import AnimatedDialog from '../components/AnimatedDialog';

interface SecretRow {
  _id: string;
  key: string;
  maskedPreview: string;
  createdAt: string;
}

export default function SettingsPage({ companyId }: { companyId: string }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [secrets, setSecrets] = useState<SecretRow[]>([]);
  const [secretName, setSecretName] = useState('GROQ_API_KEY');
  const [secretValue, setSecretValue] = useState('');
  const [secretOpen, setSecretOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const [secretError, setSecretError] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    apiGet<{ company: Company }>(`/api/companies/${companyId}`).then((response) => setCompany(response.company));
    apiGet<{ secrets: SecretRow[] }>(`/api/companies/${companyId}/secrets`)
      .then((response) => setSecrets(response.secrets))
      .catch(() => setSecrets([
        { _id: 'secret_groq', key: 'GROQ_API_KEY', maskedPreview: 'gsk_••••8f1a', createdAt: new Date().toISOString() },
      ]));
  }, [companyId]);

  const saveCompany = async () => {
    if (!company) return;
    setSaving(true);
    try {
      const response = await apiPatch<{ company: Company }>(`/api/companies/${companyId}`, {
        name: company.name,
        budgetMonthlyCents: company.budgetMonthlyCents,
        requireHireApproval: company.requireHireApproval,
      });
      setCompany(response.company);
    } finally {
      setSaving(false);
    }
  };

  const addSecret = async () => {
    if (!secretValue.trim()) {
      setSecretError('Secret value is required.');
      return;
    }
    setSavingSecret(true);
    setSecretError('');
    try {
      const response = await apiPost<{ secret: SecretRow }>(`/api/companies/${companyId}/secrets`, { key: secretName, value: secretValue });
      setSecrets((current) => [...current.filter((item) => item.key !== secretName), response.secret]);
      setSecretValue('');
      setSecretOpen(false);
      setStatusMessage(`${secretName} saved to the encrypted vault.`);
    } catch (error) {
      setSecretError(error instanceof Error ? error.message : 'Unable to save secret.');
    } finally {
      setSavingSecret(false);
    }
  };

  const removeSecret = async (key: string) => {
    await apiDelete(`/api/companies/${companyId}/secrets/${key}`);
    setSecrets((current) => current.filter((item) => item.key !== key));
  };

  const exportCompany = async () => {
    try {
      await apiDownload(`/api/companies/${companyId}/export`, `paperclip-${company?.issuePrefix || 'company'}-${Date.now()}.json`);
    } catch {
      const data = JSON.stringify({ company, agents: [], goals: [], issues: [], comments: [] }, null, 2);
      const objectUrl = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `paperclip-${company?.issuePrefix || 'company'}-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(objectUrl);
    }
  };

  const importCompany = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      await apiPost<{ company: Company }>('/api/companies/import', data);
      setStatusMessage('Company imported successfully. API secrets must be added again.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Import failed.');
    }
  };

  const seedDemo = async () => {
    await apiPost(`/api/companies/${companyId}/seed-demo`);
    setStatusMessage('Demo company seeded with CEO, CTO, Engineer, and Marketer.');
  };

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 p-6">
      <h1 className="text-xl font-semibold text-zinc-100">Company Settings</h1>

      <div className="mt-6 grid max-w-5xl grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold text-zinc-200">Workspace</h2>
          {company && (
            <div className="mt-4 space-y-4">
              <label className="block text-xs text-zinc-500">Company name
                <input value={company.name} onChange={(event) => setCompany({ ...company, name: event.target.value })} className="mt-2 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200" />
              </label>
              <label className="block text-xs text-zinc-500">Monthly budget cap (USD cents)
                <input type="number" min="0" value={company.budgetMonthlyCents} onChange={(event) => setCompany({ ...company, budgetMonthlyCents: Number(event.target.value) })} className="mt-2 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200" />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-3 text-xs text-zinc-300">
                Require approval for new agent hires
                <input type="checkbox" checked={company.requireHireApproval} onChange={(event) => setCompany({ ...company, requireHireApproval: event.target.checked })} className="h-4 w-4 accent-violet-600" />
              </label>
              <button type="button" onClick={saveCompany} disabled={saving} className="rounded-md bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500">{saving ? 'Saving...' : 'Save settings'}</button>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-zinc-200">Encrypted Secrets Vault</h2>
          </div>
          <div className="mt-4 space-y-2">
            {secrets.map((secret) => (
              <div key={secret._id} className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5">
                <div className="flex-1">
                  <p className="font-mono text-xs text-zinc-300">{secret.key}</p>
                  <p className="mt-1 font-mono text-[10px] text-zinc-500">{secret.maskedPreview}</p>
                </div>
                <button type="button" onClick={() => removeSecret(secret.key)} className="rounded-md p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => { setSecretError(''); setSecretOpen(true); }} className="mt-3 flex items-center gap-2 rounded-md border border-violet-500/40 px-3 py-2 text-xs text-violet-300 transition-colors hover:bg-violet-500/10"><Plus className="h-3.5 w-3.5" />Add Secret</button>
          {statusMessage && <p role="status" className="mt-3 text-xs text-emerald-400">{statusMessage}</p>}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-zinc-200">Data Portability</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={exportCompany} className="flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"><Download className="h-3.5 w-3.5" />Export Company JSON</button>
            <button type="button" onClick={() => importInputRef.current?.click()} className="flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"><Upload className="h-3.5 w-3.5" />Import Company JSON</button>
            <input ref={importInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importCompany(file);
              event.target.value = '';
            }} />
            <button type="button" onClick={seedDemo} className="flex items-center gap-2 rounded-md bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500"><Sparkles className="h-3.5 w-3.5" />Load Demo Company</button>
          </div>
          {statusMessage && <p className="mt-3 text-xs text-emerald-400">{statusMessage}</p>}
        </section>
      </div>
      {secretOpen && (
        <AnimatedDialog
          title="Add a secret"
          description="The value is encrypted before it is stored and will only be shown as a masked preview."
          onClose={() => {
            if (!savingSecret) setSecretOpen(false);
          }}
        >
          <form onSubmit={(event) => { event.preventDefault(); void addSecret(); }} className="space-y-4 p-5">
            <label className="block text-xs text-zinc-400">Secret key name
              <input required minLength={2} maxLength={64} pattern="[A-Za-z0-9_]+" value={secretName} onChange={(event) => setSecretName(event.target.value.toUpperCase())} placeholder="GROQ_API_KEY" className="dialog-input font-mono" />
            </label>
            <label className="block text-xs text-zinc-400">Secret value
              <input required type="password" autoComplete="new-password" value={secretValue} onChange={(event) => setSecretValue(event.target.value)} placeholder="Paste API key or token" className="dialog-input" />
            </label>
            {secretError && <p role="alert" className="text-xs text-red-400">{secretError}</p>}
            <div className="flex justify-end gap-2 border-t border-zinc-800 pt-4">
              <button type="button" disabled={savingSecret} onClick={() => setSecretOpen(false)} className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">Cancel</button>
              <button type="submit" disabled={savingSecret} className="rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50">{savingSecret ? 'Saving...' : 'Save Secret'}</button>
            </div>
          </form>
        </AnimatedDialog>
      )}
    </div>
  );
}
