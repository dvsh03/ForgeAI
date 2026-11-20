import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IssuesBoard from './pages/IssuesBoard';
import OrgChart from './pages/OrgChart';
import ApprovalsPage from './pages/ApprovalsPage';
import SettingsPage from './pages/SettingsPage';
import AuditLogPage from './pages/AuditLogPage';
import Dashboard from './pages/Dashboard';
import AuthPage from './pages/AuthPage';
import { apiGet } from './lib/api';
import {
  LayoutDashboard,
  GitBranch,
  CheckSquare,
  ShieldAlert,
  Settings,
  Building2,
  ScrollText,
  LogOut,
} from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeCompanyId] = useState('demo_company_1');
  const [route, setRoute] = useState(() => window.location.hash.replace('#/', '').replace('#', '') || 'issues');
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.replace('#/', '').replace('#', '') || 'issues');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const fetchPending = () => {
      if (currentUser) {
        apiGet<{ approvals?: Array<{ status: string }> }>(`/api/companies/${activeCompanyId}/approvals`)
          .then((res) => {
            const pending = (res.approvals || []).filter((a) => a.status === 'pending').length;
            setPendingApprovalsCount(pending);
          })
          .catch(() => setPendingApprovalsCount(0));
      }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 3000);
    return () => clearInterval(interval);
  }, [currentUser, activeCompanyId, route]);

  const navigate = (nextRoute: string) => {
    window.location.hash = `/${nextRoute}`;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setCurrentUser(null);
  };

  // If user is not authenticated, render Login / Register view
  if (!currentUser) {
    return <AuthPage onAuthSuccess={(user) => setCurrentUser(user)} />;
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'org-chart', label: 'Org Chart', icon: GitBranch },
    { id: 'issues', label: 'Issues Board', icon: CheckSquare },
    { id: 'approvals', label: 'Approvals', icon: ShieldAlert, count: pendingApprovalsCount },
    { id: 'audit', label: 'Audit Log', icon: ScrollText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const userInitial = currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U';

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <aside className="flex w-60 flex-col border-r border-zinc-800 bg-zinc-900/70 p-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs">
            <Building2 className="h-4 w-4 text-violet-400" />
            <div className="flex-1 truncate">
              <p className="font-semibold text-zinc-200">Forge AI</p>
              <p className="font-mono text-[10px] text-zinc-500">FORGE</p>
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

          {/* User Profile & Logout */}
          <div className="flex items-center justify-between border-t border-zinc-800 px-1 pt-3">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                {userInitial}
              </div>
              <div className="truncate">
                <p className="truncate text-xs font-medium text-zinc-200">{currentUser.name}</p>
                <p className="truncate text-[10px] text-zinc-500">{currentUser.email}</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
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
