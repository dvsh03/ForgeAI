import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IssuesBoard from './pages/IssuesBoard';
import OrgChart from './pages/OrgChart';
import ApprovalsPage from './pages/ApprovalsPage';
import SettingsPage from './pages/SettingsPage';
import AuditLogPage from './pages/AuditLogPage';
import Dashboard from './pages/Dashboard';
import {
  LayoutDashboard,
  GitBranch,
  CheckSquare,
  ShieldAlert,
  Settings,
  Building2,
  ScrollText,
} from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
  const [activeCompanyId] = useState('demo_company_1');
  const [route, setRoute] = useState(() => window.location.hash.replace('#/', '') || 'issues');

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.replace('#/', '') || 'issues');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (nextRoute: string) => {
    window.location.hash = `/${nextRoute}`;
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'org-chart', label: 'Org Chart', icon: GitBranch },
    { id: 'issues', label: 'Issues Board', icon: CheckSquare },
    { id: 'approvals', label: 'Approvals', icon: ShieldAlert, count: 2 },
    { id: 'audit', label: 'Audit Log', icon: ScrollText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <aside className="flex w-60 flex-col border-r border-zinc-800 bg-zinc-900/70 p-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs">
            <Building2 className="h-4 w-4 text-violet-400" />
            <div className="flex-1 truncate">
              <p className="font-semibold text-zinc-200">Acme AI</p>
              <p className="font-mono text-[10px] text-zinc-500">ACM</p>
            </div>
          </div>

          <nav className="mt-4 flex flex-1 flex-col space-y-1">
            {navItems.map(({ id, label, icon: Icon, count }) => (
              <button
                key={id}
                type="button"
                onClick={() => navigate(id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors ${
                  route === id
                    ? 'border border-violet-600/30 bg-violet-600/10 font-medium text-violet-300'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                }`}
              >
                <span className="flex items-center gap-2.5"><Icon className="h-4 w-4" />{label}</span>
                {count ? (
                  <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">{count}</span>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="flex items-center justify-between border-t border-zinc-800 px-1 pt-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">S</div>
              <div>
                <p className="text-xs font-medium text-zinc-200">Sahil</p>
                <p className="text-[10px] text-zinc-500">Board Owner</p>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex h-full flex-1 flex-col overflow-hidden">
          {route === 'dashboard' && <Dashboard companyId={activeCompanyId} />}
          {route === 'org-chart' && <OrgChart companyId={activeCompanyId} />}
          {route === 'approvals' && <ApprovalsPage companyId={activeCompanyId} />}
          {route === 'settings' && <SettingsPage companyId={activeCompanyId} />}
          {route === 'audit' && <AuditLogPage companyId={activeCompanyId} />}
          {route === 'issues' && <IssuesBoard companyId={activeCompanyId} />}
        </main>
      </div>
    </QueryClientProvider>
  );
}
