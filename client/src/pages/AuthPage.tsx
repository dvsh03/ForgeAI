import React, { useState } from 'react';
import {
  Building2,
  Lock,
  Mail,
  User,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Bot,
} from 'lucide-react';

interface AuthPageProps {
  onAuthSuccess: (user: { name: string; email: string }) => void;
}

export default function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = tab === 'login' ? { email, password } : { name, email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Save token and user details in localStorage
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
      const user = data.user || { name: name || 'Operator', email };
      localStorage.setItem('user', JSON.stringify(user));

      onAuthSuccess(user);
    } catch (err: any) {
      setError(err.message || 'An unexpected authentication error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = () => {
    const demoUser = { name: 'Sahil', email: 'sahil@forgeai.dev' };
    localStorage.setItem('token', 'demo_jwt_token_paperclip');
    localStorage.setItem('user', JSON.stringify(demoUser));
    onAuthSuccess(demoUser);
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-zinc-950 p-4 text-zinc-100">
      {/* Background ambient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/20 via-zinc-950 to-zinc-950 pointer-events-none" />

      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur-xl">
        {/* Brand Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-400">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">ForgeAI Control Plane</h1>
          <p className="mt-1 text-xs text-zinc-400">Autonomous AI Workforce Management & Governance</p>
        </div>

        {/* Tab Switcher */}
        <div className="mb-6 flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          <button
            type="button"
            onClick={() => { setTab('login'); setError(null); }}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
              tab === 'login'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setError(null); }}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
              tab === 'register'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'register' && (
            <div>
              <label className="block text-xs font-medium text-zinc-300">Full Name</label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sahil Kumar"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-3 text-xs text-zinc-200 placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-300">Email Address</label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@acme.ai"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-3 text-xs text-zinc-200 placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300">Password</label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••••••• (min 8 chars)"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-3 text-xs text-zinc-200 placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
          >
            {loading ? 'Processing…' : tab === 'login' ? 'Sign In to Workspace' : 'Create Organization Account'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase">
            <span className="bg-zinc-900 px-2 text-zinc-500">Or For Instant Evaluation</span>
          </div>
        </div>

        {/* Quick Demo Login */}
        <button
          type="button"
          onClick={handleQuickDemoLogin}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          1-Click Demo Access (Board Owner)
        </button>

        {/* Footer security badges */}
        <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            JWT Bearer Protected
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Lock className="h-3.5 w-3.5 text-violet-400" />
            AES-256 Vault
          </span>
        </div>
      </div>
    </div>
  );
}
