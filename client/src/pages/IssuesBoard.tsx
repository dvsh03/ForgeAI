// ─────────────────────────────────────────────────────────────
// IssuesBoard.tsx — Kanban Task Board & Workspace
// Developer 3 • Paperclip MERN (Day 4 & Day 7 Integration)
//
// 5-column Kanban (Backlog → Todo → In Progress → In Review → Done)
// Features:
// - Drag-and-drop between columns with optimistic updates
// - Atomic checkout lock indicators (🔒 disabled when actively running)
// - QA review gate (preventing direct drag to Done)
// - Filter by goal and agent, instant text search
// - Right-click context menu
// - Integrated TaskPlannerModal (AI decomposition)
// - Integrated IssueDrawer (Contract, Deliverables, QA, Comments)
// - Integrated RunConsole (Live SSE streaming terminal)
// - Quick "+ New Issue" modal
// ─────────────────────────────────────────────────────────────

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  type DragEvent,
  type FormEvent,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Filter,
  Loader2,
  AlertCircle,
  RefreshCw,
  Lock,
  User,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  Archive,
  MoreHorizontal,
  Sparkles,
  GripVertical,
  Target,
  X,
  ListChecks,
  Terminal,
  Paperclip,
  ShieldCheck,
} from 'lucide-react';
import { apiGet, apiPost, apiPatch, ApiError } from '../lib/api';
import type {
  Issue,
  IssueStatus,
  IssuePriority,
  Agent,
  Goal,
} from '../types/models';
import TaskPlannerModal from '../components/TaskPlannerModal';
import IssueDrawer from '../components/IssueDrawer';
import RunConsole from '../components/RunConsole';
import { useToast } from '../components/ToastProvider';

// ── Column definitions ─────────────────────────────────────

interface ColumnDef {
  id: IssueStatus;
  label: string;
  icon: typeof Circle;
  headerColor: string;
  dotColor: string;
  emptyText: string;
}

const COLUMNS: ColumnDef[] = [
  {
    id: 'backlog',
    label: 'Backlog',
    icon: Archive,
    headerColor: 'bg-zinc-500',
    dotColor: 'bg-zinc-500',
    emptyText: 'No items in backlog',
  },
  {
    id: 'todo',
    label: 'Todo',
    icon: Circle,
    headerColor: 'bg-blue-500',
    dotColor: 'bg-blue-500',
    emptyText: 'Nothing to do — nice!',
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    icon: Clock,
    headerColor: 'bg-amber-500',
    dotColor: 'bg-amber-500',
    emptyText: 'No work in progress',
  },
  {
    id: 'in_review',
    label: 'In Review',
    icon: Eye,
    headerColor: 'bg-purple-500',
    dotColor: 'bg-purple-500',
    emptyText: 'Nothing to review',
  },
  {
    id: 'done',
    label: 'Done',
    icon: CheckCircle2,
    headerColor: 'bg-emerald-500',
    dotColor: 'bg-emerald-500',
    emptyText: 'Completed tasks appear here',
  },
];

// ── Priority config ────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  low: 'border-l-zinc-600',
  medium: 'border-l-blue-500',
  high: 'border-l-amber-500',
  urgent: 'border-l-red-500',
};

const PRIORITY_BADGE: Record<string, string> = {
  low: 'bg-zinc-800 text-zinc-400',
  medium: 'bg-blue-900/40 text-blue-300',
  high: 'bg-amber-900/40 text-amber-300',
  urgent: 'bg-red-900/40 text-red-300',
};

// ── Props ──────────────────────────────────────────────────

interface IssuesBoardProps {
  /** Active company ID */
  companyId: string;
  /** Optional callback when a card is clicked */
  onIssueClick?: (issue: Issue) => void;
}

// ── Component ──────────────────────────────────────────────

export default function IssuesBoard({
  companyId,
  onIssueClick,
}: IssuesBoardProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  // ── Local UI state ────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGoalId, setFilterGoalId] = useState('');
  const [filterAgentId, setFilterAgentId] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [newIssueModalOpen, setNewIssueModalOpen] = useState(false);

  // Inspector & Live Console state (Day 7 Integration)
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [activeConsoleRunId, setActiveConsoleRunId] = useState<string | null>(null);

  // New Issue form state
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<IssuePriority>('medium');
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [newGoalId, setNewGoalId] = useState('');

  // Drag-and-drop state
  const [draggedIssueId, setDraggedIssueId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<IssueStatus | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    issue: Issue;
    x: number;
    y: number;
  } | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  // ── Fetch issues ──────────────────────────────────────────
  const issuesQuery = useQuery({
    queryKey: ['issues', companyId],
    queryFn: () =>
      apiGet<Issue[]>(`/api/companies/${companyId}/issues`),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // ── Fetch agents ──────────────────────────────────────────
  const agentsQuery = useQuery({
    queryKey: ['agents', companyId],
    queryFn: () =>
      apiGet<{ agents: Agent[] }>(`/api/companies/${companyId}/agents`).then(
        (r) => r.agents,
      ),
    staleTime: 60_000,
  });

  // ── Fetch goals ───────────────────────────────────────────
  const goalsQuery = useQuery({
    queryKey: ['goals', companyId],
    queryFn: () => apiGet<Goal[]>(`/api/companies/${companyId}/goals`),
    staleTime: 60_000,
  });

  // ── Lookup maps ───────────────────────────────────────────
  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    agentsQuery.data?.forEach((a) => m.set(a._id, a));
    return m;
  }, [agentsQuery.data]);

  const goalMap = useMemo(() => {
    const m = new Map<string, Goal>();
    goalsQuery.data?.forEach((g) => m.set(g._id, g));
    return m;
  }, [goalsQuery.data]);

  // Listen for Demo Seeder events from Sidebar or Dashboard
  useEffect(() => {
    const onSeeded = () => {
      queryClient.invalidateQueries({ queryKey: ['issues', companyId] });
      queryClient.invalidateQueries({ queryKey: ['agents', companyId] });
      queryClient.invalidateQueries({ queryKey: ['goals', companyId] });
    };
    window.addEventListener('company:seeded', onSeeded);
    return () => window.removeEventListener('company:seeded', onSeeded);
  }, [companyId, queryClient]);

  // Keep selectedIssue synced with fresh query updates
  useEffect(() => {
    if (selectedIssue && issuesQuery.data) {
      const refreshed = issuesQuery.data.find((i) => i._id === selectedIssue._id);
      if (refreshed) setSelectedIssue(refreshed);
    }
  }, [issuesQuery.data, selectedIssue]);

  // ── Filter + group issues ─────────────────────────────────
  const grouped = useMemo(() => {
    const map: Record<IssueStatus, Issue[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
      blocked: [],
      cancelled: [],
    };

    if (!issuesQuery.data) return map;

    const q = searchQuery.toLowerCase().trim();

    for (const issue of issuesQuery.data) {
      if (filterGoalId && issue.goalId !== filterGoalId) continue;
      if (filterAgentId && issue.assigneeAgentId !== filterAgentId) continue;

      const key = issue.identifier || issue.issueKey || '';
      if (
        q &&
        !issue.title.toLowerCase().includes(q) &&
        !key.toLowerCase().includes(q) &&
        !(issue.description ?? '').toLowerCase().includes(q)
      ) {
        continue;
      }

      if (map[issue.status]) {
        map[issue.status].push(issue);
      } else {
        map.backlog.push(issue);
      }
    }

    return map;
  }, [issuesQuery.data, searchQuery, filterGoalId, filterAgentId]);

  // ── Status update mutation (with optimistic update) ──────
  const statusMutation = useMutation({
    mutationFn: ({
      issueId,
      status,
    }: {
      issueId: string;
      status: IssueStatus;
    }) => apiPatch<Issue>(`/api/issues/${issueId}`, { status }),

    onMutate: async ({ issueId, status }) => {
      await queryClient.cancelQueries({
        queryKey: ['issues', companyId],
      });
      const prev = queryClient.getQueryData<Issue[]>([
        'issues',
        companyId,
      ]);
      queryClient.setQueryData<Issue[]>(
        ['issues', companyId],
        (old) =>
          old?.map((i) => (i._id === issueId ? { ...i, status } : i)) ?? [],
      );
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['issues', companyId], ctx.prev);
      }
      toast.error(
        'Status update blocked',
        err instanceof ApiError ? err.message : 'Unable to move ticket',
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['issues', companyId],
      });
    },
  });

  // ── Create single issue mutation ──────────────────────────
  const createIssueMutation = useMutation({
    mutationFn: (body: Partial<Issue>) =>
      apiPost<Issue>(`/api/companies/${companyId}/issues`, body),
    onSuccess: (newIssue) => {
      queryClient.invalidateQueries({ queryKey: ['issues', companyId] });
      setNewIssueModalOpen(false);
      setNewTitle('');
      setNewDesc('');
      setNewAssigneeId('');
      setNewGoalId('');
      setSelectedIssue(newIssue);
      toast.success(
        'Ticket created',
        `${newIssue.identifier || newIssue.issueKey || 'Issue'} added to Todo.`,
      );
    },
    onError: (err) => {
      toast.error(
        'Failed to create ticket',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  const handleCreateIssue = (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    createIssueMutation.mutate({
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      priority: newPriority,
      status: 'todo',
      assigneeAgentId: newAssigneeId || undefined,
      goalId: newGoalId || undefined,
      acceptanceCriteria: [],
      deliverables: [],
    });
  };

  // ── Drag & drop handlers ─────────────────────────────────

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, issue: Issue) => {
      if (issue.lockedByRunId && new Date(issue.lockExpiresAt!) > new Date()) {
        e.preventDefault();
        return;
      }
      setDraggedIssueId(issue._id);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', issue._id);
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>, columnId: IssueStatus) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTarget(columnId);
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>, targetStatus: IssueStatus) => {
      e.preventDefault();
      const issueId = e.dataTransfer.getData('text/plain');
      setDraggedIssueId(null);
      setDropTarget(null);

      if (!issueId) return;

      const issue = issuesQuery.data?.find((i) => i._id === issueId);
      if (!issue) return;
      if (issue.status === targetStatus) return;

      // Cannot drag directly to "done" — must pass QA in "in_review"
      if (targetStatus === 'done' && issue.status !== 'in_review') {
        toast.warning(
          'Evidence-Based QA Gate',
          'Tasks must pass through "In Review" and be approved before moving to Done.',
        );
        return;
      }

      statusMutation.mutate({ issueId, status: targetStatus });
    },
    [issuesQuery.data, statusMutation, toast],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedIssueId(null);
    setDropTarget(null);
  }, []);

  // ── Context menu ──────────────────────────────────────────

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, issue: Issue) => {
      e.preventDefault();
      setContextMenu({ issue, x: e.clientX, y: e.clientY });
    },
    [],
  );

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        contextRef.current &&
        !contextRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const contextMoveToStatus = useCallback(
    (status: IssueStatus) => {
      if (!contextMenu) return;
      statusMutation.mutate({
        issueId: contextMenu.issue._id,
        status,
      });
      setContextMenu(null);
    },
    [contextMenu, statusMutation],
  );

  const handleSelectCard = (issue: Issue) => {
    setSelectedIssue(issue);
    onIssueClick?.(issue);
  };

  const activeFilters =
    (filterGoalId ? 1 : 0) + (filterAgentId ? 1 : 0);

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* ── Toolbar ───────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-zinc-100">
            Issues
          </h1>
          {issuesQuery.data && (
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
              {issuesQuery.data.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search issues…"
              className="h-8 w-52 rounded-lg border border-zinc-800 bg-zinc-900 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters((p) => !p)}
            className={`relative inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${
              showFilters || activeFilters > 0
                ? 'border-violet-600/50 bg-violet-600/10 text-violet-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filter
            {activeFilters > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white">
                {activeFilters}
              </span>
            )}
          </button>

          {/* Refresh */}
          <button
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ['issues', companyId],
              })
            }
            disabled={issuesQuery.isFetching}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:text-zinc-200 disabled:opacity-50"
            title="Refresh issues"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${issuesQuery.isFetching ? 'animate-spin' : ''}`}
            />
          </button>

          {/* AI Task Planner Modal */}
          <button
            onClick={() => setPlannerOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-600/50 bg-violet-600/20 px-3 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-600/30"
          >
            <Sparkles className="h-3.5 w-3.5 text-violet-400" />
            Plan with AI
          </button>

          {/* + New Issue Button */}
          <button
            onClick={() => setNewIssueModalOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-medium text-white transition-colors hover:bg-violet-500"
          >
            <Plus className="h-3.5 w-3.5" />
            New Issue
          </button>
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────── */}
      {showFilters && (
        <div className="flex items-center gap-3 border-b border-zinc-800/60 bg-zinc-900/50 px-5 py-2.5">
          <div className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-zinc-500" />
            <select
              value={filterGoalId}
              onChange={(e) => setFilterGoalId(e.target.value)}
              className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 focus:border-violet-600 focus:outline-none"
            >
              <option value="">All Goals</option>
              {goalsQuery.data?.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-zinc-500" />
            <select
              value={filterAgentId}
              onChange={(e) => setFilterAgentId(e.target.value)}
              className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 focus:border-violet-600 focus:outline-none"
            >
              <option value="">All Agents</option>
              {agentsQuery.data?.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} ({a.role})
                </option>
              ))}
            </select>
          </div>

          {activeFilters > 0 && (
            <button
              onClick={() => {
                setFilterGoalId('');
                setFilterAgentId('');
              }}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* ── Loading Skeleton / Error states (Day 11) ─────── */}
      {issuesQuery.isLoading && (
        <div className="flex flex-1 gap-4 overflow-x-auto px-5 py-4">
          {COLUMNS.map((col) => (
            <div
              key={col.id}
              className="flex min-w-[240px] max-w-[320px] flex-1 shrink-0 flex-col rounded-xl border border-zinc-800/40 bg-zinc-900/30 p-3"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${col.headerColor}`} />
                <div className="h-3 w-20 animate-pulse rounded bg-zinc-800" />
              </div>
              <div className="space-y-2">
                {[0, 1].map((idx) => (
                  <div
                    key={idx}
                    className="h-24 animate-pulse rounded-lg border border-zinc-800/60 bg-zinc-900/70 p-3"
                  >
                    <div className="h-2.5 w-16 rounded bg-zinc-800" />
                    <div className="mt-2.5 h-3 w-full rounded bg-zinc-800" />
                    <div className="mt-1.5 h-3 w-2/3 rounded bg-zinc-800/70" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {issuesQuery.isError && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-red-300">
            {issuesQuery.error instanceof ApiError
              ? issuesQuery.error.message
              : 'Failed to load issues'}
          </p>
          <button
            onClick={() => issuesQuery.refetch()}
            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Kanban columns ────────────────────────────────── */}
      {issuesQuery.isSuccess && (
        <div className="flex flex-1 gap-4 overflow-x-auto px-5 py-4">
          {COLUMNS.map((col) => {
            const issues = grouped[col.id] || [];
            const isDropHere = dropTarget === col.id;
            const Icon = col.icon;

            return (
              <div
                key={col.id}
                className={`flex flex-1 min-w-[240px] max-w-[320px] shrink-0 flex-col rounded-xl border transition-colors ${
                  isDropHere
                    ? 'border-violet-500/50 bg-violet-500/5'
                    : 'border-zinc-800/40 bg-zinc-900/30'
                }`}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.id)}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${col.headerColor}`}
                    />
                    <span className="text-xs font-semibold text-zinc-300">
                      {col.label}
                    </span>
                    <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                      {issues.length}
                    </span>
                  </div>
                </div>

                {/* Cards container */}
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {issues.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <Icon className="mb-2 h-5 w-5 text-zinc-700" />
                      <p className="text-[11px] text-zinc-600">
                        {col.emptyText}
                      </p>
                    </div>
                  )}

                  {issues.map((issue) => {
                    const agent = issue.assigneeAgentId
                      ? agentMap.get(issue.assigneeAgentId)
                      : null;
                    const linkedGoal = issue.goalId
                      ? goalMap.get(issue.goalId)
                      : null;
                    const isLocked =
                      !!issue.lockedByRunId &&
                      new Date(issue.lockExpiresAt!) > new Date();
                    const isDragging = draggedIssueId === issue._id;
                    const checkedCount =
                      issue.acceptanceCriteria?.filter(
                        (c) => c.completed || c.met,
                      ).length ?? 0;
                    const totalCriteria =
                      issue.acceptanceCriteria?.length ?? 0;
                    const deliverablesCount = issue.deliverables?.length ?? 0;

                    return (
                      <div
                        key={issue._id}
                        draggable={!isLocked}
                        onDragStart={(e) => handleDragStart(e, issue)}
                        onDragEnd={handleDragEnd}
                        onContextMenu={(e) => handleContextMenu(e, issue)}
                        onClick={() => handleSelectCard(issue)}
                        className={`group relative cursor-pointer rounded-lg border-l-2 bg-zinc-900 px-3 py-2.5 transition-all ${
                          PRIORITY_COLORS[issue.priority] ?? 'border-l-zinc-700'
                        } ${
                          isDragging
                            ? 'opacity-40'
                            : 'hover:bg-zinc-800/80 hover:border-zinc-700'
                        } ${
                          isLocked
                            ? 'cursor-not-allowed opacity-80'
                            : ''
                        }`}
                      >
                        {/* Top row: Monospace ID + Lock pill + Priority */}
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="font-mono text-[11px] font-semibold text-zinc-400">
                            {issue.identifier || issue.issueKey}
                          </span>

                          <div className="flex items-center gap-1.5">
                            {isLocked && (
                              <span
                                className="flex items-center gap-1 text-[10px] font-medium text-blue-400 animate-pulse"
                                title="Locked by an active heartbeat run"
                              >
                                <Lock className="h-3 w-3" />
                                Run Active
                              </span>
                            )}
                            {issue.status === 'in_review' && (
                              <span
                                className="inline-flex items-center gap-1 rounded bg-purple-950/80 px-1.5 py-0.5 text-[9px] font-semibold text-purple-300 border border-purple-800/60"
                                title="Click to review deliverables & approve"
                              >
                                <ShieldCheck className="h-2.5 w-2.5" />
                                QA
                              </span>
                            )}
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                                PRIORITY_BADGE[issue.priority] ?? ''
                              }`}
                            >
                              {issue.priority}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleContextMenu(e, issue);
                              }}
                              className="rounded p-0.5 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-zinc-300"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Title (2-line clamped) + Goal tag */}
                        <p className="mb-1.5 line-clamp-2 text-xs font-semibold leading-snug text-zinc-100">
                          {issue.title}
                        </p>

                        {linkedGoal && (
                          <p className="mb-2 inline-flex max-w-full items-center gap-1 truncate rounded bg-zinc-800/70 px-1.5 py-0.5 text-[10px] text-zinc-400">
                            <Target className="h-2.5 w-2.5 shrink-0 text-violet-400" />
                            <span className="truncate">{linkedGoal.title}</span>
                          </p>
                        )}

                        {/* Bottom row: checklist progress + paperclip + assignee */}
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-2">
                            {totalCriteria > 0 && (
                              <span
                                className={`inline-flex items-center gap-1 ${
                                  checkedCount === totalCriteria
                                    ? 'font-medium text-emerald-400'
                                    : 'text-zinc-500'
                                }`}
                              >
                                <ListChecks className="h-3 w-3" />
                                {checkedCount}/{totalCriteria}
                              </span>
                            )}
                            {deliverablesCount > 0 && (
                              <span
                                className="inline-flex items-center gap-0.5 text-zinc-400"
                                title={`${deliverablesCount} deliverable${deliverablesCount === 1 ? '' : 's'} attached`}
                              >
                                <Paperclip className="h-3 w-3 text-violet-400" />
                                {deliverablesCount}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {/* Live Console button if ticket is running */}
                            {issue.lockedByRunId && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveConsoleRunId(issue.lockedByRunId!);
                                }}
                                className="inline-flex items-center gap-1 rounded bg-cyan-950/80 px-1.5 py-0.5 text-[10px] text-cyan-300 border border-cyan-800/60 hover:bg-cyan-900"
                                title="Watch SSE Run"
                              >
                                <Terminal className="h-2.5 w-2.5 text-cyan-400" />
                                Logs
                              </button>
                            )}

                            {agent ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300"
                                title={`${agent.name} (${agent.role})`}
                              >
                                <User className="h-3 w-3 text-zinc-400" />
                                <span className="max-w-[70px] truncate">
                                  {agent.name}
                                </span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Context menu (right-click) ───────────────────── */}
      {contextMenu && (
        <div
          ref={contextRef}
          className="fixed z-50 min-w-[170px] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <p className="border-b border-zinc-800 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Move to…
          </p>
          {COLUMNS.filter((c) => c.id !== contextMenu.issue.status).map(
            (col) => {
              const disabled =
                col.id === 'done' &&
                contextMenu.issue.status !== 'in_review';

              return (
                <button
                  key={col.id}
                  disabled={disabled}
                  onClick={() => contextMoveToStatus(col.id)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                    disabled
                      ? 'cursor-not-allowed text-zinc-600'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${col.dotColor}`}
                  />
                  {col.label}
                  {disabled && (
                    <span className="ml-auto text-[10px] text-zinc-600">
                      QA review needed
                    </span>
                  )}
                </button>
              );
            },
          )}
          <div className="border-t border-zinc-800 mt-1 pt-1">
            <button
              onClick={() => {
                handleSelectCard(contextMenu.issue);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
            >
              <Eye className="h-3 w-3" />
              Open Drawer
            </button>
          </div>
        </div>
      )}

      {/* ── "+ New Issue" Modal (Day 4) ──────────────────── */}
      {newIssueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setNewIssueModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-100">
                Create New Issue
              </h2>
              <button
                onClick={() => setNewIssueModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateIssue} className="mt-4 space-y-3.5">
              <div>
                <label className="text-xs font-medium text-zinc-400">
                  Issue Title <span className="text-red-400">*</span>
                </label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Design landing page hero component"
                  required
                  className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 focus:border-violet-600 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400">
                  Description
                </label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Instructions for the agent..."
                  rows={3}
                  className="mt-1 w-full resize-none rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 focus:border-violet-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-400">
                    Priority
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) =>
                      setNewPriority(e.target.value as IssuePriority)
                    }
                    className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 focus:border-violet-600 focus:outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-400">
                    Assignee
                  </label>
                  <select
                    value={newAssigneeId}
                    onChange={(e) => setNewAssigneeId(e.target.value)}
                    className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 focus:border-violet-600 focus:outline-none"
                  >
                    <option value="">Unassigned</option>
                    {agentsQuery.data?.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-400">
                    Goal
                  </label>
                  <select
                    value={newGoalId}
                    onChange={(e) => setNewGoalId(e.target.value)}
                    className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 focus:border-violet-600 focus:outline-none"
                  >
                    <option value="">None</option>
                    {goalsQuery.data?.map((g) => (
                      <option key={g._id} value={g._id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setNewIssueModalOpen(false)}
                  className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim() || createIssueMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded bg-violet-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {createIssueMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Create Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Task Planner Modal ────────────────────────────── */}
      <TaskPlannerModal
        companyId={companyId}
        open={plannerOpen}
        onClose={() => setPlannerOpen(false)}
      />

      {/* ── Slide-Over Issue Detail Drawer (Day 5 & 6) ────── */}
      <IssueDrawer
        companyId={companyId}
        issue={selectedIssue}
        onClose={() => setSelectedIssue(null)}
        onOpenConsole={(runId) => setActiveConsoleRunId(runId)}
      />

      {/* ── Live SSE Heartbeat Terminal Console (Day 8) ──── */}
      <RunConsole
        runId={activeConsoleRunId}
        companyId={companyId}
        onClose={() => setActiveConsoleRunId(null)}
      />
    </div>
  );
}
