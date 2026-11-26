// ─────────────────────────────────────────────────────────────
// Layout.tsx — Application Shell, Company Switcher & Wakeup Banner
// Developer 3 • Paperclip MERN (Days 3, 13 & 14)
//
// Matches UI/UX Brief §2 & Application Flow §1 & §4:
// - Left sidebar with Company Switcher dropdown + "+ Create Company"
// - Navigation links (Dashboard, Org Chart, Issues Board, Approvals, Audit, Settings)
// - "[+ Load Demo]" 1-click company seed button
// - Render Free-Tier Cold-Start Wakeup Banner (>3s latency auto-retry)
// ─────────────────────────────────────────────────────────────

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Check,
  CheckSquare,
  ChevronDown,
  GitBranch,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  ScrollText,
  Settings,
  ShieldAlert,
  Sparkles,
  Wifi,
} from 'lucide-react';
import { apiGet, apiPost, checkBackendHealth } from '../lib/api';
import type { Company } from '../types/models';
import AnimatedDialog from './AnimatedDialog';
import { useToast } from './ToastProvider';

export type AppRoute =
  | 'dashboard'
  | 'org-chart'
  | 'issues'
  | 'approvals'
  | 'audit'
  | 'settings';

interface LayoutProps {
  currentUser: { name: string; email: string };
  activeCompanyId: string;
  onSelectCompany: (companyId: string) => void;
  route: string;
  onNavigate: (nextRoute: AppRoute) => void;
  pendingApprovalsCount: number;
  onLogout: () => void;
  children: ReactNode;
}

export default function Layout({
  currentUser,
  activeCompanyId,
  onSelectCompany,
  route,
  onNavigate,
  pendingApprovalsCount,
  onLogout,
  children,
}: LayoutProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  // ── Company Switcher State ────────────────────────────────
  const [companies, setCompanies] = useState<Company[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const [newName, setNewName] = useState('');
  const [newPrefix, setNewPrefix] = useState('PAP');
  const [newDesc, setNewDesc] = useState('');
  const [newBudgetCents, setNewBudgetCents] = useState(500);
  const [requireHireApproval, setRequireHireApproval] = useState(true);

  const switcherRef = useRef<HTMLDivElement>(null);

  // ── Render Cold-Start Wakeup Banner State (Day 14) ────────
  const [coldStartWaking, setColdStartWaking] = useState(false);

  useEffect(() => {
    const onColdStart = (event: Event) => {
      const custom = event as CustomEvent<{ active: boolean }>;
      setColdStartWaking(Boolean(custom.detail?.active));
    };
    window.addEventListener('api:cold-start', onColdStart);
    return () => window.removeEventListener('api:cold-start', onColdStart);
  }, []);

  useEffect(() => {
    if (!coldStartWaking) return;
    const pollId = window.setInterval(() => {
      void checkBackendHealth();
    }, 3000);
    return () => window.clearInterval(pollId);
  }, [coldStartWaking]);

  // ── Fetch User Companies ──────────────────────────────────
  useEffect(() => {
    apiGet<Company[] | { companies: Company[] }>('/api/companies')
      .then((res) => {
        const list = Array.isArray(res) ? res : res.companies || [];
        setCompanies(list);
        if (
          list.length > 0 &&
          activeCompanyId === 'demo_company_1' &&
          !list.some((c) => c._id === 'demo_company_1')
        ) {
          onSelectCompany(list[0]._id);
        }
      })
      .catch(() => {
        // Fallback if backend unavailable
      });
  }, [activeCompanyId, onSelectCompany]);

  // Close company dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        switcherRef.current &&
        !switcherRef.current.contains(e.target as Node)
      ) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const activeCompany = companies.find((c) => c._id === activeCompanyId);
  const displayName = activeCompany?.name || 'Forge AI';
  const displayPrefix = activeCompany?.issuePrefix || 'FORGE';

  // ── Create Company Handler ────────────────────────────────
  const handleCreateCompany = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await apiPost<Company | { company: Company }>(
        '/api/companies',
        {
          name: newName.trim(),
          description: newDesc.trim(),
          issuePrefix: newPrefix.trim().toUpperCase(),
          budgetMonthlyCents: Number(newBudgetCents) || 500,
          requireHireApproval,
        },
      );
      const created = 'company' in res ? res.company : res;
      setCompanies((prev) => [created, ...prev]);
      onSelectCompany(created._id);
      setCreateOpen(false);
      setSwitcherOpen(false);
      setNewName('');
      setNewDesc('');
      setNewPrefix('PAP');
      toast.success(`Workspace "${created.name}" created`, `Ticket prefix: ${created.issuePrefix}`);
      queryClient.invalidateQueries();
    } catch (err) {
      toast.error(
        'Unable to create workspace',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setCreating(false);
    }
  };

  // ── 1-Click Load Demo Company Handler (Day 13) ────────────
  const handleLoadDemo = async () => {
    setSeeding(true);
    try {
      await apiPost(`/api/companies/${activeCompanyId}/seed-demo`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['issues'] }),
        queryClient.invalidateQueries({ queryKey: ['agents'] }),
        queryClient.invalidateQueries({ queryKey: ['goals'] }),
      ]);
      window.dispatchEvent(new CustomEvent('company:seeded'));
      toast.success(
        'Demo Company Seeded',
        'Loaded 4 AI agents, 2 goals, and 3 starter issues.',
      );
    } catch (err) {
      toast.error(
        'Failed to seed demo company',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setSeeding(false);
    }
  };

  const navItems: Array<{
    id: AppRoute;
    label: string;
    icon: typeof LayoutDashboard;
    count?: number;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'org-chart', label: 'Org Chart', icon: GitBranch },
    { id: 'issues', label: 'Issues Board', icon: CheckSquare },
    {
      id: 'approvals',
      label: 'Approvals',
      icon: ShieldAlert,
      count: pendingApprovalsCount,
    },
    { id: 'audit', label: 'Audit Log', icon: ScrollText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const userInitial = currentUser.name
    ? currentUser.name.charAt(0).toUpperCase()
    : 'U';

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* ── Render Free-Tier Cold-Start Wakeup Banner (Day 14) ── */}
      {coldStartWaking && (
        <div
          role="status"
          className="flex items-center justify-center gap-2.5 border-b border-amber-500/30 bg-amber-950/50 px-4 py-2 text-xs text-amber-200"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
          <span>
            Waking control plane server (free tier cold start)… Retrying automatically.
          </span>
          <Wifi className="h-3.5 w-3.5 text-amber-400/70" />
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── Left Sidebar Shell ──────────────────────────── */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/70 p-3">
          {/* Company Switcher Dropdown */}
          <div className="relative" ref={switcherRef}>
            <button
              type="button"
              onClick={() => setSwitcherOpen((p) => !p)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-left text-xs transition-colors hover:border-zinc-700"
              aria-expanded={switcherOpen}
            >
              <Building2 className="h-4 w-4 shrink-0 text-violet-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-zinc-200">
                  {displayName}
                </p>
                <p className="font-mono text-[10px] text-zinc-500">
                  {displayPrefix}
                </p>
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${
                  switcherOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {switcherOpen && (
              <div className="absolute left-0 right-0 top-full z-40 mt-1.5 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-2xl">
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Workspaces
                </p>
                <div className="max-h-48 overflow-y-auto">
                  {companies.length > 0 ? (
                    companies.map((c) => {
                      const active = c._id === activeCompanyId;
                      return (
                        <button
                          key={c._id}
                          type="button"
                          onClick={() => {
                            onSelectCompany(c._id);
                            setSwitcherOpen(false);
                            toast.info(`Switched to ${c.name}`);
                          }}
                          className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors ${
                            active
                              ? 'bg-violet-600/15 text-violet-300'
                              : 'text-zinc-300 hover:bg-zinc-800'
                          }`}
                        >
                          <div className="min-w-0 truncate">
                            <span className="font-medium">{c.name}</span>
                            <span className="ml-1.5 font-mono text-[10px] text-zinc-500">
                              {c.issuePrefix}
                            </span>
                          </div>
                          {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-3 py-1.5 text-xs text-zinc-400">
                      Forge AI <span className="font-mono text-[10px]">(FORGE)</span>
                    </div>
                  )}
                </div>
                <div className="mt-1 border-t border-zinc-800 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSwitcherOpen(false);
                      setCreateOpen(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-violet-400 hover:bg-zinc-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New Company
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="mt-4 flex flex-1 flex-col space-y-1">
            {navItems.map(({ id, label, icon: Icon, count }) => (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors ${
                  route === id
                    ? 'border border-violet-600/30 bg-violet-600/10 font-medium text-violet-300'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4" />
                  {label}
                </span>
                {count ? (
                  <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                    {count}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          {/* 1-Click Load Demo Company Button (Day 13 / UI/UX Brief §2) */}
          <div className="mb-3">
            <button
              type="button"
              onClick={handleLoadDemo}
              disabled={seeding}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/30 bg-violet-600/15 px-3 py-2 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-600/25 disabled:opacity-50"
            >
              {seeding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-violet-400" />
              )}
              {seeding ? 'Seeding Demo…' : '+ Load Demo'}
            </button>
          </div>

          {/* User Profile & Logout */}
          <div className="flex items-center justify-between border-t border-zinc-800 px-1 pt-3">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                {userInitial}
              </div>
              <div className="truncate">
                <p className="truncate text-xs font-medium text-zinc-200">
                  {currentUser.name}
                </p>
                <p className="truncate text-[10px] text-zinc-500">
                  {currentUser.email}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </aside>

        {/* ── Main Workspace Canvas ───────────────────────── */}
        <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>

      {/* ── Create Company Modal (E1 / App Flow §1) ───────── */}
      {createOpen && (
        <AnimatedDialog
          title="Create Company Workspace"
          description="Each workspace has isolated agents, goals, secrets vault, and atomic ticket numbering."
          onClose={() => {
            if (!creating) setCreateOpen(false);
          }}
        >
          <form onSubmit={handleCreateCompany} className="space-y-4 p-5">
            <div className="grid grid-cols-3 gap-3">
              <label className="col-span-2 text-xs text-zinc-400">
                Company name
                <input
                  required
                  maxLength={100}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Acme AI Labs"
                  className="dialog-input"
                  autoFocus
                />
              </label>
              <label className="text-xs text-zinc-400">
                Ticket prefix
                <input
                  required
                  minLength={2}
                  maxLength={5}
                  pattern="[A-Za-z0-9]+"
                  value={newPrefix}
                  onChange={(e) => setNewPrefix(e.target.value.toUpperCase())}
                  placeholder="PAP"
                  className="dialog-input font-mono uppercase"
                />
              </label>
            </div>
            <label className="block text-xs text-zinc-400">
              Mission / Description
              <input
                maxLength={500}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="What is this autonomous organization building?"
                className="dialog-input"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Monthly budget cap (USD cents)
              <input
                type="number"
                min="0"
                required
                value={newBudgetCents}
                onChange={(e) => setNewBudgetCents(Number(e.target.value))}
                className="dialog-input"
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2.5 text-xs text-zinc-300">
              Require human approval for new agent hires
              <input
                type="checkbox"
                checked={requireHireApproval}
                onChange={(e) => setRequireHireApproval(e.target.checked)}
                className="h-4 w-4 accent-violet-600"
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-zinc-800 pt-4">
              <button
                type="button"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
                className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create Workspace'}
              </button>
            </div>
          </form>
        </AnimatedDialog>
      )}
    </div>
  );
}
