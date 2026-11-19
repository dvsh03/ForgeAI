import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IssuesBoard from './pages/IssuesBoard';
import {
  LayoutDashboard,
  GitBranch,
  CheckSquare,
  ShieldAlert,
  Settings,
  Building2,
  Sparkles,
} from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  const [activeCompanyId, setActiveCompanyId] = useState('demo_company_1');

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
            <a
              href="#dashboard"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </a>
            <a
              href="#org-chart"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
              <GitBranch className="h-4 w-4" />
              Org Chart
            </a>
            <a
              href="#issues"
              className="flex items-center gap-2.5 rounded-lg bg-violet-600/10 px-3 py-2 text-xs font-medium text-violet-300 border border-violet-600/30"
            >
              <CheckSquare className="h-4 w-4 text-violet-400" />
              Issues Board
            </a>
            <a
              href="#approvals"
              className="flex items-center justify-between rounded-lg px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="h-4 w-4" />
                Approvals
              </div>
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-400">
                2
              </span>
            </a>
            <a
              href="#settings"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
              <Settings className="h-4 w-4" />
              Settings
            </a>
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
          <IssuesBoard companyId={activeCompanyId} />
        </main>
      </div>
    </QueryClientProvider>
  );
}
