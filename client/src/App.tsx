import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IssuesBoard from './pages/IssuesBoard';
import DashboardView from './pages/DashboardView';
import OrgChartView from './pages/OrgChartView';
import ApprovalsView from './pages/ApprovalsView';
import SettingsView from './pages/SettingsView';
import {
  LayoutDashboard,
  GitBranch,
  CheckSquare,
  ShieldAlert,
  Settings,
  Building2,
} from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

type TabType = 'dashboard' | 'org-chart' | 'issues' | 'approvals' | 'settings';

export default function App() {
  const [activeCompanyId, setActiveCompanyId] = useState('demo_company_1');
  const [activeTab, setActiveTab] = useState<TabType>('issues');

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
        {/* ── Left Sidebar Navigation (UI/UX Brief §2) ─── */}
        <aside className="flex w-60 flex-col border-r border-zinc-800 bg-zinc-900/70 p-3">
          {/* Company Switcher */}
          <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs">
            <Building2 className="h-4 w-4 text-violet-400" />
            <div className="flex-1 truncate">
              <p className="font-semibold text-zinc-200">Acme AI</p>
              <p className="text-[10px] text-zinc-500 font-mono">ACM</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="mt-4 flex flex-1 flex-col space-y-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-violet-600/10 text-violet-300 border border-violet-600/30'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <LayoutDashboard className={`h-4 w-4 ${activeTab === 'dashboard' ? 'text-violet-400' : ''}`} />
              Dashboard
            </button>

            <button
              onClick={() => setActiveTab('org-chart')}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'org-chart'
                  ? 'bg-violet-600/10 text-violet-300 border border-violet-600/30'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <GitBranch className={`h-4 w-4 ${activeTab === 'org-chart' ? 'text-violet-400' : ''}`} />
              Org Chart
            </button>

            <button
              onClick={() => setActiveTab('issues')}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'issues'
                  ? 'bg-violet-600/10 text-violet-300 border border-violet-600/30'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <CheckSquare className={`h-4 w-4 ${activeTab === 'issues' ? 'text-violet-400' : ''}`} />
              Issues Board
            </button>

            <button
              onClick={() => setActiveTab('approvals')}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'approvals'
                  ? 'bg-violet-600/10 text-violet-300 border border-violet-600/30'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShieldAlert className={`h-4 w-4 ${activeTab === 'approvals' ? 'text-violet-400' : ''}`} />
                Approvals
              </div>
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-400">
                2
              </span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'settings'
                  ? 'bg-violet-600/10 text-violet-300 border border-violet-600/30'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <Settings className={`h-4 w-4 ${activeTab === 'settings' ? 'text-violet-400' : ''}`} />
              Settings
            </button>
          </nav>

          {/* Bottom user profile & demo seed */}
          <div className="pt-3 border-t border-zinc-800 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                S
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-200">Sahil</p>
                <p className="text-[10px] text-zinc-500">Board Owner</p>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main Workspace Area ────────────────────────── */}
        <main className="flex-1 flex flex-col h-full overflow-hidden">
          {activeTab === 'issues' && <IssuesBoard companyId={activeCompanyId} />}
          {activeTab === 'dashboard' && <DashboardView companyId={activeCompanyId} />}
          {activeTab === 'org-chart' && <OrgChartView companyId={activeCompanyId} />}
          {activeTab === 'approvals' && <ApprovalsView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>
    </QueryClientProvider>
  );
}
