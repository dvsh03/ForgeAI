import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IssuesBoard from './pages/IssuesBoard';
import OrgChart from './pages/OrgChart';
import ApprovalsPage from './pages/ApprovalsPage';
import SettingsPage from './pages/SettingsPage';
import AuditLogPage from './pages/AuditLogPage';
import Dashboard from './pages/Dashboard';
import AuthPage from './pages/AuthPage';
import Layout, { type AppRoute } from './components/Layout';
import { ToastProvider } from './components/ToastProvider';
import { apiGet } from './lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const VALID_ROUTES: AppRoute[] = [
  'dashboard',
  'org-chart',
  'issues',
  'approvals',
  'audit',
  'settings',
];

function parseHashRoute(): AppRoute {
  const raw = window.location.hash.replace('#/', '').replace('#', '');
  return VALID_ROUTES.includes(raw as AppRoute)
    ? (raw as AppRoute)
    : 'issues';
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<{
    name: string;
    email: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeCompanyId, setActiveCompanyId] = useState<string>(() => {
    return localStorage.getItem('activeCompanyId') || 'demo_company_1';
  });
  const [route, setRoute] = useState<AppRoute>(parseHashRoute);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  const handleSelectCompany = (companyId: string) => {
    localStorage.setItem('activeCompanyId', companyId);
    setActiveCompanyId(companyId);
  };

  useEffect(() => {
    const onHashChange = () => setRoute(parseHashRoute());
    window.addEventListener('hashchange', onHashChange);
    const handleAuthLogout = () => setCurrentUser(null);
    window.addEventListener('auth:logout', handleAuthLogout);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('auth:logout', handleAuthLogout);
    };
  }, []);

  useEffect(() => {
    const fetchPending = () => {
      if (currentUser) {
        apiGet<{ approvals?: Array<{ status: string }> }>(
          `/api/companies/${activeCompanyId}/approvals`,
        )
          .then((res) => {
            const pending = (res.approvals || []).filter(
              (a) => a.status === 'pending',
            ).length;
            setPendingApprovalsCount(pending);
          })
          .catch(() => setPendingApprovalsCount(0));
      }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 5000);
    return () => clearInterval(interval);
  }, [currentUser, activeCompanyId, route]);

  const navigate = (nextRoute: AppRoute) => {
    window.location.hash = `/${nextRoute}`;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setCurrentUser(null);
  };

  // If user is not authenticated, render Login / Register view
  if (!currentUser) {
    return (
      <ToastProvider>
        <AuthPage onAuthSuccess={(user) => setCurrentUser(user)} />
      </ToastProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Layout
          currentUser={currentUser}
          activeCompanyId={activeCompanyId}
          onSelectCompany={handleSelectCompany}
          route={route}
          onNavigate={navigate}
          pendingApprovalsCount={pendingApprovalsCount}
          onLogout={handleLogout}
        >
          {route === 'dashboard' && <Dashboard companyId={activeCompanyId} />}
          {route === 'org-chart' && <OrgChart companyId={activeCompanyId} />}
          {route === 'approvals' && <ApprovalsPage companyId={activeCompanyId} />}
          {route === 'settings' && <SettingsPage companyId={activeCompanyId} />}
          {route === 'audit' && <AuditLogPage companyId={activeCompanyId} />}
          {route === 'issues' && <IssuesBoard companyId={activeCompanyId} />}
        </Layout>
      </ToastProvider>
    </QueryClientProvider>
  );
}
