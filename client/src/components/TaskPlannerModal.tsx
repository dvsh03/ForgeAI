// ─────────────────────────────────────────────────────────────
// TaskPlannerModal.tsx — Universal Task Intelligence Plan Modal
// Developer 3 • Paperclip MERN
//
// Allows a user (or CEO agent) to describe a high-level objective,
// pick a parent Goal, and invoke the AI planner endpoint that
// decomposes the objective into atomic, checklist-ready subtasks.
// Generated tasks can be reviewed, edited, and committed to the
// Kanban board in one action.
// ─────────────────────────────────────────────────────────────

import { useState, useCallback, Fragment } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Plus,
  GripVertical,
  Target,
  Zap,
  ArrowRight,
  FileText,
  User,
  ListChecks,
} from 'lucide-react';
import { apiGet, apiPost, ApiError } from '../lib/api';
import { useToast } from './ToastProvider';
import type {
  Goal,
  Agent,
  PlanGenerateRequest,
  PlanGenerateResponse,
  PlanTask,
  Issue,
} from '../types/models';

// ── Props ──────────────────────────────────────────────────

interface TaskPlannerModalProps {
  /** Currently active company ID */
  companyId: string;
  /** Whether the modal is visible */
  open: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Optional pre-selected goal */
  initialGoalId?: string;
}

// ── Priority badge helper ──────────────────────────────────

const PRIORITY_CONFIG = {
  low:    { label: 'Low',    className: 'bg-zinc-700/50 text-zinc-300' },
  medium: { label: 'Medium', className: 'bg-blue-900/50 text-blue-300' },
  high:   { label: 'High',   className: 'bg-amber-900/50 text-amber-300' },
  urgent: { label: 'Urgent', className: 'bg-red-900/50 text-red-300' },
} as const;

function PriorityBadge({ priority }: { priority: PlanTask['priority'] }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────

export default function TaskPlannerModal({
  companyId,
  open,
  onClose,
  initialGoalId,
}: TaskPlannerModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  // ── Form state ────────────────────────────────────────────
  const [objective, setObjective] = useState('');
  const [context, setContext] = useState('');
  const [goalId, setGoalId] = useState(initialGoalId ?? '');
  const [plannerAgentId, setPlannerAgentId] = useState('');

  // ── Editable plan state ───────────────────────────────────
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<'input' | 'review'>('input');

  // ── Fetch goals & agents for dropdowns ────────────────────
  const goalsQuery = useQuery({
    queryKey: ['goals', companyId],
    queryFn: () => apiGet<Goal[]>(`/api/companies/${companyId}/goals`),
    enabled: open,
    staleTime: 30_000,
  });

  const agentsQuery = useQuery({
    queryKey: ['agents', companyId],
    queryFn: () =>
      apiGet<{ agents: Agent[] }>(`/api/companies/${companyId}/agents`).then(
        (r) => r.agents,
      ),
    enabled: open,
    staleTime: 30_000,
  });

  // ── AI plan generation mutation ───────────────────────────
  const generateMutation = useMutation({
    mutationFn: (body: PlanGenerateRequest) =>
      apiPost<PlanGenerateResponse>(
        `/api/companies/${companyId}/plans/generate`,
        body,
      ),
    onSuccess: (data) => {
      const enriched = data.plan.tasks.map((t) => {
        if (!t.assigneeAgentId && t.assigneeRole && agentsQuery.data?.length) {
          const matched = agentsQuery.data.find((a) =>
            a.role.toLowerCase().includes(t.assigneeRole!.toLowerCase()),
          );
          if (matched) {
            return {
              ...t,
              assigneeAgentId: matched._id,
              assigneeName: matched.name,
            };
          }
        }
        return t;
      });
      setTasks(enriched);
      setExpandedIdx(new Set(enriched.map((_, i) => i)));
      setStep('review');
      toast.info('AI Plan Generated', `Review ${enriched.length} proposed tasks.`);
    },
  });

  // ── Commit plan to Kanban ─────────────────────────────────
  const commitMutation = useMutation({
    mutationFn: async () => {
      // Create issues for each planned task
      const created: Issue[] = [];
      for (const task of tasks) {
        const issue = await apiPost<Issue>(
          `/api/companies/${companyId}/issues`,
          {
            goalId: goalId || undefined,
            title: task.title,
            description: task.description,
            priority: task.priority,
            assigneeAgentId: task.assigneeAgentId || undefined,
            status: 'backlog',
            acceptanceCriteria: task.acceptanceCriteria
              .filter((text) => text.trim())
              .map((text, idx) => ({
                id: `ac_${Date.now()}_${idx}`,
                text: text.trim(),
                completed: false,
                met: false,
              })),
          },
        );
        created.push(issue);
      }
      return created;
    },
    onSuccess: (created) => {
      // Invalidate the issues cache so the Kanban board refreshes
      queryClient.invalidateQueries({ queryKey: ['issues', companyId] });
      toast.success(
        'Tasks Committed to Board',
        `Created ${created.length} new issue${created.length === 1 ? '' : 's'} in Backlog.`,
      );
      handleReset();
      onClose();
    },
  });

  // ── Handlers ──────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    if (!objective.trim()) return;
    generateMutation.mutate({
      goalId,
      objective: objective.trim(),
      context: context.trim() || undefined,
      agentId: plannerAgentId || undefined,
    });
  }, [objective, context, goalId, plannerAgentId, generateMutation]);

  const handleReset = useCallback(() => {
    setObjective('');
    setContext('');
    setGoalId(initialGoalId ?? '');
    setPlannerAgentId('');
    setTasks([]);
    setExpandedIdx(new Set());
    setStep('input');
    generateMutation.reset();
    commitMutation.reset();
  }, [initialGoalId, generateMutation, commitMutation]);

  const toggleExpand = useCallback((idx: number) => {
    setExpandedIdx((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }, []);

  const updateTask = useCallback(
    (idx: number, patch: Partial<PlanTask>) => {
      setTasks((prev) =>
        prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
      );
    },
    [],
  );

  const removeTask = useCallback((idx: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== idx));
    setExpandedIdx((prev) => {
      const next = new Set<number>();
      for (const v of prev) {
        if (v < idx) next.add(v);
        else if (v > idx) next.add(v - 1);
      }
      return next;
    });
  }, []);

  const addCriterion = useCallback((taskIdx: number) => {
    setTasks((prev) =>
      prev.map((t, i) =>
        i === taskIdx
          ? { ...t, acceptanceCriteria: [...t.acceptanceCriteria, ''] }
          : t,
      ),
    );
  }, []);

  const updateCriterion = useCallback(
    (taskIdx: number, critIdx: number, value: string) => {
      setTasks((prev) =>
        prev.map((t, i) =>
          i === taskIdx
            ? {
                ...t,
                acceptanceCriteria: t.acceptanceCriteria.map((c, ci) =>
                  ci === critIdx ? value : c,
                ),
              }
            : t,
        ),
      );
    },
    [],
  );

  const removeCriterion = useCallback(
    (taskIdx: number, critIdx: number) => {
      setTasks((prev) =>
        prev.map((t, i) =>
          i === taskIdx
            ? {
                ...t,
                acceptanceCriteria: t.acceptanceCriteria.filter(
                  (_, ci) => ci !== critIdx,
                ),
              }
            : t,
        ),
      );
    },
    [],
  );

  // ── Render guard ──────────────────────────────────────────
  if (!open) return null;

  const isLoading = generateMutation.isPending;
  const isCommitting = commitMutation.isPending;
  const error =
    generateMutation.error instanceof ApiError
      ? generateMutation.error.message
      : generateMutation.error
        ? 'Failed to generate plan'
        : commitMutation.error instanceof ApiError
          ? commitMutation.error.message
          : commitMutation.error
            ? 'Failed to commit tasks'
            : null;

  return (
    // Overlay
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20">
              <Sparkles className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Task Intelligence Planner
              </h2>
              <p className="text-xs text-zinc-500">
                AI-powered task decomposition
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Step indicator ─────────────────────────────── */}
        <div className="flex gap-1 px-6 pt-4">
          {(['input', 'review'] as const).map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                step === s ? 'bg-violet-500' : 'bg-zinc-800'
              }`}
            />
          ))}
        </div>

        {/* ── Body ───────────────────────────────────────── */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          {step === 'input' ? (
            /* ══ INPUT STEP ══════════════════════════════ */
            <div className="space-y-4">
              {/* Objective */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                  <Target className="h-3.5 w-3.5" />
                  Objective
                  <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  rows={3}
                  placeholder="Describe what you want the AI team to accomplish…"
                  className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-violet-600 focus:outline-none focus:ring-1 focus:ring-violet-600/40"
                />
              </div>

              {/* Context (optional) */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                  <FileText className="h-3.5 w-3.5" />
                  Additional Context
                  <span className="text-zinc-600">(optional)</span>
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={2}
                  placeholder="Any constraints, tech stack preferences, prior decisions…"
                  className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-violet-600 focus:outline-none focus:ring-1 focus:ring-violet-600/40"
                />
              </div>

              {/* Goal selector */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                  <Zap className="h-3.5 w-3.5" />
                  Parent Goal
                </label>
                <select
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-violet-600 focus:outline-none focus:ring-1 focus:ring-violet-600/40"
                >
                  <option value="">None (standalone tasks)</option>
                  {goalsQuery.data?.map((g) => (
                    <option key={g._id} value={g._id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Planner agent selector */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                  <User className="h-3.5 w-3.5" />
                  Planner Agent
                  <span className="text-zinc-600">(optional)</span>
                </label>
                <select
                  value={plannerAgentId}
                  onChange={(e) => setPlannerAgentId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-violet-600 focus:outline-none focus:ring-1 focus:ring-violet-600/40"
                >
                  <option value="">Auto (CEO or first manager)</option>
                  {agentsQuery.data?.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name} — {a.role}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            /* ══ REVIEW STEP ═════════════════════════════ */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-400">
                  {tasks.length} task{tasks.length !== 1 ? 's' : ''} generated
                </p>
                <button
                  onClick={() => setStep('input')}
                  className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
                >
                  ← Regenerate
                </button>
              </div>

              {tasks.map((task, idx) => {
                const isExpanded = expandedIdx.has(idx);
                return (
                  <div
                    key={idx}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 transition-colors hover:border-zinc-700"
                  >
                    {/* Task header */}
                    <div
                      className="flex cursor-pointer items-center gap-2 px-3 py-2.5"
                      onClick={() => toggleExpand(idx)}
                    >
                      <GripVertical className="h-3.5 w-3.5 shrink-0 text-zinc-700" />
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                      )}
                      <span className="flex-1 truncate text-sm font-medium text-zinc-200">
                        {task.title || 'Untitled Task'}
                      </span>
                      <PriorityBadge priority={task.priority} />
                      {task.assigneeName && (
                        <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                          <User className="h-3 w-3" />
                          {task.assigneeName}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTask(idx);
                        }}
                        className="ml-1 rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="space-y-3 border-t border-zinc-800/60 px-4 py-3">
                        {/* Title edit */}
                        <input
                          value={task.title}
                          onChange={(e) =>
                            updateTask(idx, { title: e.target.value })
                          }
                          className="w-full rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-200 focus:border-violet-600 focus:outline-none"
                          placeholder="Task title"
                        />

                        {/* Description edit */}
                        <textarea
                          value={task.description}
                          onChange={(e) =>
                            updateTask(idx, { description: e.target.value })
                          }
                          rows={2}
                          className="w-full resize-none rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-200 focus:border-violet-600 focus:outline-none"
                          placeholder="Description"
                        />

                        {/* Priority + Assignee row */}
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="mb-1 text-[11px] text-zinc-500">
                              Priority
                            </label>
                            <select
                              value={task.priority}
                              onChange={(e) =>
                                updateTask(idx, {
                                  priority: e.target.value as PlanTask['priority'],
                                })
                              }
                              className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:border-violet-600 focus:outline-none"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                              <option value="urgent">Urgent</option>
                            </select>
                          </div>
                          <div className="flex-1">
                            <label className="mb-1 text-[11px] text-zinc-500">
                              Assignee
                            </label>
                            <select
                              value={task.assigneeAgentId ?? ''}
                              onChange={(e) => {
                                const agent = agentsQuery.data?.find(
                                  (a) => a._id === e.target.value,
                                );
                                updateTask(idx, {
                                  assigneeAgentId: e.target.value || undefined,
                                  assigneeName: agent?.name,
                                });
                              }}
                              className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:border-violet-600 focus:outline-none"
                            >
                              <option value="">Unassigned</option>
                              {agentsQuery.data?.map((a) => (
                                <option key={a._id} value={a._id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Acceptance criteria */}
                        <div>
                          <div className="mb-1.5 flex items-center justify-between">
                            <label className="flex items-center gap-1 text-[11px] font-medium text-zinc-500">
                              <ListChecks className="h-3 w-3" />
                              Acceptance Criteria
                            </label>
                            <button
                              onClick={() => addCriterion(idx)}
                              className="flex items-center gap-0.5 text-[11px] text-violet-400 hover:text-violet-300"
                            >
                              <Plus className="h-3 w-3" /> Add
                            </button>
                          </div>
                          <div className="space-y-1.5">
                            {task.acceptanceCriteria.map((crit, ci) => (
                              <div key={ci} className="flex items-center gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                                <input
                                  value={crit}
                                  onChange={(e) =>
                                    updateCriterion(idx, ci, e.target.value)
                                  }
                                  className="flex-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 focus:border-violet-600 focus:outline-none"
                                  placeholder="Describe what 'done' looks like…"
                                />
                                <button
                                  onClick={() => removeCriterion(idx, ci)}
                                  className="rounded p-0.5 text-zinc-600 hover:text-red-400"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                            {task.acceptanceCriteria.length === 0 && (
                              <p className="text-xs italic text-zinc-600">
                                No acceptance criteria yet
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {tasks.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-zinc-500">
                  <FileText className="h-8 w-8" />
                  <p className="text-sm">No tasks generated</p>
                </div>
              )}
            </div>
          )}

          {/* ── Error banner ─────────────────────────────── */}
          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-zinc-800 px-6 py-4">
          {step === 'input' ? (
            <Fragment>
              <button
                onClick={onClose}
                className="rounded-lg px-3.5 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={!objective.trim() || isLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isLoading ? 'Generating…' : 'Generate Plan'}
              </button>
            </Fragment>
          ) : (
            <Fragment>
              <button
                onClick={handleReset}
                className="rounded-lg px-3.5 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                Start Over
              </button>
              <button
                onClick={() => commitMutation.mutate()}
                disabled={tasks.length === 0 || isCommitting}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCommitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {isCommitting
                  ? 'Creating Tasks…'
                  : `Commit ${tasks.length} Task${tasks.length !== 1 ? 's' : ''} to Board`}
              </button>
            </Fragment>
          )}
        </div>
      </div>
    </div>
  );
}
