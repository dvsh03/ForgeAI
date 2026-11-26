// ─────────────────────────────────────────────────────────────
// IssueDrawer.tsx — Task Contract & Evidence-Based QA Drawer
// Developer 3 • Paperclip MERN (Days 5, 6, 10 & 11)
//
// Features:
// 1. Slide-over inspection drawer with Linear-inspired dark aesthetic.
// 2. Atomic Checkout Lock acquisition & live lease display (409 guard).
// 3. Acceptance Criteria Checklist: interactive checkboxes + CRUD (Day 5).
//    Strictly preserves `id`, `text`, `completed` matching Mongoose schema.
// 4. Evidence-based QA Review Controls (Day 6, Day 10 & PRD §3.2):
//    - "Approve & Mark Done" (POST /api/issues/:id/qa-review { passed: true })
//    - "Request Changes (Reject)" (POST /api/issues/:id/qa-review { passed: false, feedback })
// 5. Deliverables & Drag-and-Drop Cloudinary / R2 Uploader (Day 6):
//    - Drag-and-drop zone + file picker using POST /api/uploads/sign
//    - Preview thumbnails for images, PDF, audio & video deliverables
//    - URL link + Markdown proof attachments matching Mongoose schema
// 6. Threaded comments with @AgentName auto-completion + mention highlighting.
// 7. "Watch Live Console" trigger for active/recent HeartbeatRuns.
// ─────────────────────────────────────────────────────────────

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  type DragEvent,
  type FormEvent,
  type ChangeEvent,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Lock,
  Unlock,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  Archive,
  AlertTriangle,
  Send,
  Paperclip,
  Link2,
  FileText,
  Upload,
  Plus,
  Trash2,
  User,
  Bot,
  Terminal,
  ExternalLink,
  Loader2,
  Check,
  ShieldCheck,
  RotateCcw,
  FileAudio,
  FileVideo,
  FileSpreadsheet,
} from 'lucide-react';
import { apiGet, apiPost, apiPatch, ApiError } from '../lib/api';
import { useToast } from './ToastProvider';
import type {
  Issue,
  IssueStatus,
  IssuePriority,
  AcceptanceCriterion,
  Deliverable,
  IssueComment,
  Agent,
  Goal,
  CloudinarySignResponse,
  QaReviewRequest,
} from '../types/models';

// ── Props ──────────────────────────────────────────────────

interface IssueDrawerProps {
  /** Active company ID */
  companyId: string;
  /** Active issue being inspected (or null if closed) */
  issue: Issue | null;
  /** Callback to close the drawer */
  onClose: () => void;
  /** Callback when user clicks "Watch Console" for a run */
  onOpenConsole?: (runId: string, issueId?: string, agentId?: string) => void;
}

// ── Color mappings ─────────────────────────────────────────

const STATUS_CONFIG: Record<
  IssueStatus,
  { label: string; icon: typeof Circle; color: string; badge: string }
> = {
  backlog: {
    label: 'Backlog',
    icon: Archive,
    color: 'text-zinc-400',
    badge: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  },
  todo: {
    label: 'Todo',
    icon: Circle,
    color: 'text-blue-400',
    badge: 'bg-blue-950/60 text-blue-300 border-blue-800/60',
  },
  in_progress: {
    label: 'In Progress',
    icon: Clock,
    color: 'text-amber-400',
    badge: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
  },
  in_review: {
    label: 'In Review',
    icon: Eye,
    color: 'text-purple-400',
    badge: 'bg-purple-950/60 text-purple-300 border-purple-800/60',
  },
  done: {
    label: 'Done',
    icon: CheckCircle2,
    color: 'text-emerald-400',
    badge: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
  },
  blocked: {
    label: 'Blocked',
    icon: AlertTriangle,
    color: 'text-red-400',
    badge: 'bg-red-950/60 text-red-300 border-red-800/60',
  },
  cancelled: {
    label: 'Cancelled',
    icon: X,
    color: 'text-zinc-500',
    badge: 'bg-zinc-900 text-zinc-500 border-zinc-800',
  },
};

const PRIORITY_CONFIG: Record<
  IssuePriority,
  { label: string; badge: string }
> = {
  low: { label: 'Low', badge: 'bg-zinc-800/80 text-zinc-300' },
  medium: { label: 'Medium', badge: 'bg-blue-900/50 text-blue-300' },
  high: { label: 'High', badge: 'bg-amber-900/50 text-amber-300' },
  urgent: { label: 'Urgent', badge: 'bg-red-900/60 text-red-300' },
};

// ── Deliverable Normalization Helpers ──────────────────────

function normalizeCriterion(
  crit: AcceptanceCriterion,
  idx: number,
): { id: string; text: string; completed: boolean } {
  return {
    id: crit.id || crit._id || `ac_${Date.now()}_${idx}`,
    text: crit.text,
    completed: Boolean(crit.completed ?? crit.met),
  };
}

function normalizeDeliverableForSave(del: Deliverable) {
  const rawType = del.type || del.kind || 'url';
  const type: 'url' | 'markdown' | 'file' =
    rawType === 'link' ? 'url' : rawType;
  return {
    type,
    title: del.title || del.label || del.contentOrUrl || del.url || 'Deliverable',
    contentOrUrl: del.contentOrUrl || del.url || '',
    addedAt: del.addedAt || new Date().toISOString(),
  };
}

function getDeliverableDisplay(del: Deliverable) {
  const type = del.type || del.kind || 'url';
  const title =
    del.title || del.label || del.contentOrUrl || del.url || 'Attachment';
  const url = del.contentOrUrl || del.url || '';
  const isImage =
    /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url) ||
    url.startsWith('data:image/') ||
    del.mimeType?.startsWith('image/');
  const isPdf = /\.pdf(\?.*)?$/i.test(url) || del.mimeType === 'application/pdf';
  const isAudio =
    /\.(mp3|wav|ogg|m4a)(\?.*)?$/i.test(url) ||
    del.mimeType?.startsWith('audio/');
  const isVideo =
    /\.(mp4|webm|mov)(\?.*)?$/i.test(url) || del.mimeType?.startsWith('video/');
  const isHttp = /^https?:\/\//i.test(url) || url.startsWith('data:');
  return { type, title, url, isImage, isPdf, isAudio, isVideo, isHttp };
}

// ── Component ──────────────────────────────────────────────

export default function IssueDrawer({
  companyId,
  issue,
  onClose,
  onOpenConsole,
}: IssueDrawerProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  // ── Local UI State ────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<
    'contract' | 'comments' | 'deliverables'
  >('contract');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');

  // QA Rejection Feedback State
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');

  // Acceptance Criteria draft
  const [newCritText, setNewCritText] = useState('');

  // Deliverables draft + drag-and-drop state
  const [deliverableMode, setDeliverableMode] = useState<
    'none' | 'link' | 'markdown'
  >('none');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [markdownLabel, setMarkdownLabel] = useState('');
  const [markdownBody, setMarkdownBody] = useState('');
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Comments state
  const [commentText, setCommentText] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState<number>(-1);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync draft states when issue changes
  useEffect(() => {
    if (issue) {
      setTitleDraft(issue.title);
      setDescDraft(issue.description || '');
      setIsEditingTitle(false);
      setIsEditingDesc(false);
      setShowRejectBox(false);
      setRejectFeedback('');
      setDeliverableMode('none');
    }
  }, [issue]);

  // ── Queries ───────────────────────────────────────────────

  const issueQuery = useQuery({
    queryKey: ['issue', issue?._id],
    queryFn: () => apiGet<Issue>(`/api/issues/${issue!._id}`),
    initialData: issue ?? undefined,
    enabled: !!issue?._id,
    staleTime: 5_000,
  });

  const currentIssue = issueQuery.data ?? issue;

  const commentsQuery = useQuery({
    queryKey: ['comments', issue?._id],
    queryFn: () =>
      apiGet<IssueComment[]>(`/api/issues/${issue!._id}/comments`),
    enabled: !!issue?._id,
    refetchInterval: 10_000,
  });

  const agentsQuery = useQuery({
    queryKey: ['agents', companyId],
    queryFn: () =>
      apiGet<{ agents: Agent[] }>(`/api/companies/${companyId}/agents`).then(
        (r) => r.agents,
      ),
    staleTime: 60_000,
  });

  const goalsQuery = useQuery({
    queryKey: ['goals', companyId],
    queryFn: () => apiGet<Goal[]>(`/api/companies/${companyId}/goals`),
    staleTime: 60_000,
  });

  // ── Mutations ─────────────────────────────────────────────

  const patchMutation = useMutation({
    mutationFn: (patch: Partial<Issue>) =>
      apiPatch<Issue>(`/api/issues/${currentIssue!._id}`, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(['issue', updated._id], updated);
      queryClient.invalidateQueries({ queryKey: ['issues', companyId] });
    },
    onError: (err) => {
      toast.error(
        'Update failed',
        err instanceof ApiError ? err.message : 'Unable to save issue changes',
      );
    },
  });

  // Atomic Checkout Lock (POST /api/issues/:id/checkout)
  const checkoutMutation = useMutation({
    mutationFn: () =>
      apiPost<{ message: string; issue: Issue }>(
        `/api/issues/${currentIssue!._id}/checkout`,
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(['issue', currentIssue!._id], data.issue);
      queryClient.invalidateQueries({ queryKey: ['issues', companyId] });
      toast.success(
        'Atomic Lock Acquired',
        '5-minute exclusive checkout lease activated.',
      );
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError && err.status === 409
          ? '409 Conflict — Ticket Locked'
          : 'Checkout failed',
        err instanceof Error ? err.message : 'Another run holds the lease.',
      );
    },
  });

  // QA Review (POST /api/issues/:id/qa-review)
  const qaReviewMutation = useMutation({
    mutationFn: (payload: QaReviewRequest) =>
      apiPost<{ issue: Issue; message: string }>(
        `/api/issues/${currentIssue!._id}/qa-review`,
        payload,
      ),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(['issue', currentIssue!._id], data.issue);
      queryClient.invalidateQueries({ queryKey: ['issues', companyId] });
      queryClient.invalidateQueries({
        queryKey: ['comments', currentIssue!._id],
      });
      setShowRejectBox(false);
      setRejectFeedback('');
      if (vars.passed) {
        toast.success('QA Approved', 'Ticket verified and marked Done.');
      } else {
        toast.warning(
          'Changes Requested',
          'Ticket bounced back to Todo with feedback.',
        );
      }
    },
    onError: (err) => {
      toast.error(
        'QA Review failed',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  // Post Comment (POST /api/issues/:id/comments)
  const commentMutation = useMutation({
    mutationFn: (bodyText: string) => {
      let userName = 'Board Operator';
      try {
        const raw = localStorage.getItem('user');
        if (raw) userName = JSON.parse(raw).name || userName;
      } catch {
        // ignore
      }
      return apiPost<IssueComment>(`/api/issues/${currentIssue!._id}/comments`, {
        body: bodyText,
        content: bodyText,
        authorType: 'user',
        authorName: userName,
        authorId: 'user_board',
      });
    },
    onSuccess: (newComment) => {
      queryClient.setQueryData<IssueComment[]>(
        ['comments', currentIssue!._id],
        (old) => [...(old ?? []), newComment],
      );
      setCommentText('');
      setMentionQuery(null);
      toast.success('Comment posted');
    },
    onError: (err) => {
      toast.error(
        'Failed to post comment',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  // ── Derived helpers ───────────────────────────────────────

  const isLocked = useMemo(() => {
    if (!currentIssue?.lockedByRunId || !currentIssue.lockExpiresAt)
      return false;
    return new Date(currentIssue.lockExpiresAt).getTime() > Date.now();
  }, [currentIssue]);

  const criteriaList = currentIssue?.acceptanceCriteria ?? [];
  const completedCriteriaCount = criteriaList.filter(
    (c) => c.completed || c.met,
  ).length;
  const criteriaProgressPct = criteriaList.length
    ? Math.round((completedCriteriaCount / criteriaList.length) * 100)
    : 0;

  // Filter mention agents based on user input after '@'
  const filteredMentionAgents = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return (
      agentsQuery.data?.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.role.toLowerCase().includes(q),
      ) ?? []
    );
  }, [mentionQuery, agentsQuery.data]);

  // ── Action Handlers ───────────────────────────────────────

  const handleSaveTitle = () => {
    if (!titleDraft.trim() || titleDraft === currentIssue?.title) {
      setIsEditingTitle(false);
      return;
    }
    patchMutation.mutate({ title: titleDraft.trim() });
    setIsEditingTitle(false);
  };

  const handleSaveDescription = () => {
    patchMutation.mutate({ description: descDraft });
    setIsEditingDesc(false);
  };

  // Toggle Acceptance Criterion Checkbox (Day 5)
  const handleToggleCriterion = (idx: number) => {
    if (!currentIssue) return;
    const normalized = criteriaList.map(normalizeCriterion);
    normalized[idx] = {
      ...normalized[idx],
      completed: !normalized[idx].completed,
    };
    patchMutation.mutate({ acceptanceCriteria: normalized });
  };

  // Add Acceptance Criterion (Day 5)
  const handleAddCriterion = (e?: FormEvent) => {
    e?.preventDefault();
    if (!newCritText.trim() || !currentIssue) return;
    const normalized = [
      ...criteriaList.map(normalizeCriterion),
      {
        id: `ac_${Date.now()}`,
        text: newCritText.trim(),
        completed: false,
      },
    ];
    patchMutation.mutate({ acceptanceCriteria: normalized });
    setNewCritText('');
  };

  // Remove Acceptance Criterion (Day 5)
  const handleRemoveCriterion = (idx: number) => {
    if (!currentIssue) return;
    const normalized = criteriaList
      .filter((_, i) => i !== idx)
      .map(normalizeCriterion);
    patchMutation.mutate({ acceptanceCriteria: normalized });
  };

  // QA Review: Approve & Mark Done (Day 6 / PRD §3.2)
  const handleApproveDone = () => {
    qaReviewMutation.mutate({ passed: true });
  };

  // QA Review: Reject back to Todo with feedback (Day 6 / PRD §3.2)
  const handleRejectToTodo = () => {
    if (!rejectFeedback.trim()) return;
    qaReviewMutation.mutate({
      passed: false,
      feedback: rejectFeedback.trim(),
    });
  };

  // Add Deliverable Link (Day 6)
  const handleAddDeliverableLink = (e: FormEvent) => {
    e.preventDefault();
    if (!linkUrl.trim() || !currentIssue) return;
    const nextDeliverables = [
      ...(currentIssue.deliverables || []).map(normalizeDeliverableForSave),
      {
        type: 'url' as const,
        title: linkLabel.trim() || linkUrl.trim(),
        contentOrUrl: linkUrl.trim(),
        addedAt: new Date().toISOString(),
      },
    ];
    patchMutation.mutate({ deliverables: nextDeliverables });
    setLinkUrl('');
    setLinkLabel('');
    setDeliverableMode('none');
    toast.success('Link deliverable attached');
  };

  // Add Markdown Proof Deliverable (Day 6)
  const handleAddMarkdownProof = (e: FormEvent) => {
    e.preventDefault();
    if (!markdownBody.trim() || !currentIssue) return;
    const nextDeliverables = [
      ...(currentIssue.deliverables || []).map(normalizeDeliverableForSave),
      {
        type: 'markdown' as const,
        title: markdownLabel.trim() || 'Markdown Deliverable Report',
        contentOrUrl: markdownBody.trim(),
        addedAt: new Date().toISOString(),
      },
    ];
    patchMutation.mutate({ deliverables: nextDeliverables });
    setMarkdownLabel('');
    setMarkdownBody('');
    setDeliverableMode('none');
    toast.success('Markdown proof attached');
  };

  // Remove Deliverable (Day 6)
  const handleRemoveDeliverable = (idx: number) => {
    if (!currentIssue?.deliverables) return;
    const next = currentIssue.deliverables
      .filter((_, i) => i !== idx)
      .map(normalizeDeliverableForSave);
    patchMutation.mutate({ deliverables: next });
  };

  // Shared File Upload Logic (File input OR Drag-and-Drop)
  const uploadDeliverableFile = async (file: File) => {
    if (!currentIssue) return;

    try {
      setIsUploadingFile(true);

      // Step 1: Request signed upload timestamp and signature from backend
      const signData = await apiPost<CloudinarySignResponse>(
        '/api/uploads/sign',
        {
          folder: `paperclip/${companyId}/issues/${currentIssue._id}`,
        },
      );

      let secureUrl = '';

      if (signData.mock) {
        // Graceful fallback when live Cloudinary env vars are not configured yet
        if (file.type.startsWith('image/') && file.size <= 512 * 1024) {
          secureUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.readAsDataURL(file);
          });
        } else {
          secureUrl = `https://res.cloudinary.com/${signData.cloudName}/raw/upload/${encodeURIComponent(file.name)}`;
        }
        toast.info(
          'Attached in Mock Storage Mode',
          'Configure Cloudinary env vars for live CDN storage.',
        );
      } else {
        // Step 2: Direct upload to Cloudinary Free (bypasses MongoDB 512 MB limit)
        const formData = new FormData();
        formData.append('file', file);
        formData.append('api_key', signData.apiKey);
        formData.append('timestamp', String(signData.timestamp));
        formData.append('signature', signData.signature);
        if (signData.folder) formData.append('folder', signData.folder);

        const cloudRes = await fetch(
          `https://api.cloudinary.com/v1_1/${signData.cloudName}/auto/upload`,
          {
            method: 'POST',
            body: formData,
          },
        );

        if (!cloudRes.ok) {
          throw new Error('Cloudinary upload rejected');
        }

        const cloudJson = await cloudRes.json();
        secureUrl = cloudJson.secure_url || cloudJson.url;
        toast.success('File uploaded to Cloudinary', file.name);
      }

      // Step 3: Save normalized deliverable to Issue
      const nextDeliverables = [
        ...(currentIssue.deliverables || []).map(normalizeDeliverableForSave),
        {
          type: 'file' as const,
          title: file.name,
          contentOrUrl: secureUrl,
          addedAt: new Date().toISOString(),
        },
      ];

      await patchMutation.mutateAsync({ deliverables: nextDeliverables });
    } catch (err) {
      console.error('File upload failed:', err);
      toast.error(
        'File upload failed',
        err instanceof Error
          ? err.message
          : 'Verify Cloudinary upload credentials in settings.',
      );
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadDeliverableFile(file);
  };

  const handleFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadDeliverableFile(file);
  };

  // Mentions parser for comment box
  const handleCommentChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCommentText(val);

    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    if (lastAt !== -1 && !/\s/.test(textBeforeCursor.slice(lastAt + 1))) {
      setMentionQuery(textBeforeCursor.slice(lastAt + 1));
      setMentionIndex(lastAt);
    } else {
      setMentionQuery(null);
      setMentionIndex(-1);
    }
  };

  const handleSelectMention = (agentName: string) => {
    if (mentionIndex === -1) return;
    // Extract compact mention token (e.g., "Atlas" from "Atlas (CEO)")
    const mentionHandle = agentName.split(/[\s(]+/)[0] || agentName;
    const before = commentText.slice(0, mentionIndex);
    const after = commentText.slice(
      mentionIndex + (mentionQuery?.length ?? 0) + 1,
    );
    const completedText = `${before}@${mentionHandle} ${after}`;
    setCommentText(completedText);
    setMentionQuery(null);
    setMentionIndex(-1);
    commentTextareaRef.current?.focus();
  };

  const handlePostComment = (e: FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    commentMutation.mutate(commentText.trim());
  };

  // ── Early return if drawer closed ─────────────────────────
  if (!issue) return null;

  const issueKey = currentIssue?.identifier || currentIssue?.issueKey || 'PAP';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Container */}
      <div className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs font-bold tracking-wider text-zinc-400">
              {issueKey}
            </span>

            {/* Atomic Lock Pill or Acquire Lock button */}
            {isLocked ? (
              <span className="inline-flex animate-pulse items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-400">
                <Lock className="h-3 w-3" />
                Locked by Run
              </span>
            ) : (
              <button
                type="button"
                onClick={() => checkoutMutation.mutate()}
                disabled={checkoutMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 text-[11px] font-medium text-zinc-400 transition-colors hover:border-blue-600/40 hover:text-blue-300"
                title="Acquire 5-minute atomic checkout lock"
              >
                {checkoutMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Unlock className="h-3 w-3" />
                )}
                Checkout Lock
              </button>
            )}

            {/* Priority Pill */}
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                PRIORITY_CONFIG[currentIssue?.priority ?? 'medium'].badge
              }`}
            >
              {PRIORITY_CONFIG[currentIssue?.priority ?? 'medium'].label}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Terminal Console Button */}
            {currentIssue?.lockedByRunId && onOpenConsole && (
              <button
                type="button"
                onClick={() =>
                  onOpenConsole(
                    currentIssue.lockedByRunId!,
                    currentIssue._id,
                    currentIssue.assigneeAgentId || undefined,
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-800/60 bg-cyan-950/40 px-2.5 py-1 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-900/50"
                title="Watch Live EventStream Console"
              >
                <Terminal className="h-3.5 w-3.5 text-cyan-400" />
                Console
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Metadata Strip (Status, Assignee, Goal) ────── */}
        <div className="grid grid-cols-3 gap-3 border-b border-zinc-800/80 bg-zinc-900/40 px-6 py-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Status
            </label>
            <select
              value={currentIssue?.status ?? 'todo'}
              onChange={(e) =>
                patchMutation.mutate({ status: e.target.value as IssueStatus })
              }
              className="mt-1 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus:border-violet-600 focus:outline-none"
            >
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Assignee Agent
            </label>
            <select
              value={currentIssue?.assigneeAgentId ?? ''}
              onChange={(e) =>
                patchMutation.mutate({
                  assigneeAgentId: e.target.value || null,
                })
              }
              className="mt-1 w-full truncate rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus:border-violet-600 focus:outline-none"
            >
              <option value="">Unassigned</option>
              {agentsQuery.data?.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} ({a.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Parent Goal
            </label>
            <select
              value={currentIssue?.goalId ?? ''}
              onChange={(e) =>
                patchMutation.mutate({ goalId: e.target.value || null })
              }
              className="mt-1 w-full truncate rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus:border-violet-600 focus:outline-none"
            >
              <option value="">No Goal</option>
              {goalsQuery.data?.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Title & Description ────────────────────────── */}
        <div className="border-b border-zinc-800/80 px-6 py-4">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                className="flex-1 rounded border border-violet-600 bg-zinc-900 px-2.5 py-1 text-base font-semibold text-zinc-100 focus:outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={handleSaveTitle}
                className="rounded bg-violet-600 px-2 py-1 text-xs font-medium text-white hover:bg-violet-500"
              >
                Save
              </button>
            </div>
          ) : (
            <h2
              onClick={() => setIsEditingTitle(true)}
              className="cursor-pointer text-base font-semibold text-zinc-100 transition-colors hover:text-violet-300"
              title="Click to edit title"
            >
              {currentIssue?.title}
            </h2>
          )}

          <div className="mt-2.5">
            {isEditingDesc ? (
              <div className="space-y-2">
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded border border-violet-600 bg-zinc-900 p-2.5 text-xs text-zinc-200 focus:outline-none"
                  placeholder="Task instructions and expected context..."
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingDesc(false)}
                    className="rounded px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDescription}
                    className="rounded bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-500"
                  >
                    Save Description
                  </button>
                </div>
              </div>
            ) : (
              <p
                onClick={() => setIsEditingDesc(true)}
                className="cursor-pointer text-xs leading-relaxed text-zinc-400 hover:text-zinc-300"
                title="Click to edit description"
              >
                {currentIssue?.description || (
                  <span className="italic text-zinc-600">
                    No description provided. Click to add detailed instructions...
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* ── Evidence-Based QA Review Banner (PRD §3.2 / Day 10) ─── */}
        {currentIssue?.status === 'in_review' && (
          <div className="border-b border-purple-900/60 bg-purple-950/20 px-6 py-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-semibold text-purple-200">
                  Evidence-Based QA Gate
                </span>
                <span className="text-[11px] text-purple-400">
                  (Verify deliverables &amp; criteria before sign-off)
                </span>
              </div>
            </div>

            {showRejectBox ? (
              <div className="mt-3 space-y-2 rounded-lg border border-red-900/40 bg-zinc-950 p-3">
                <label className="text-[11px] font-medium text-red-300">
                  Rejection Feedback for Assigned Worker:
                </label>
                <textarea
                  value={rejectFeedback}
                  onChange={(e) => setRejectFeedback(e.target.value)}
                  placeholder="Explain which acceptance criteria or deliverables are missing..."
                  rows={2}
                  className="w-full resize-none rounded border border-red-900/60 bg-zinc-900 p-2 text-xs text-zinc-200 focus:outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRejectBox(false)}
                    className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleRejectToTodo}
                    disabled={!rejectFeedback.trim() || qaReviewMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    {qaReviewMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    Bounce back to Todo &amp; Wake Agent
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApproveDone}
                  disabled={qaReviewMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-50"
                >
                  {qaReviewMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Approve &amp; Mark Done
                </button>
                <button
                  type="button"
                  onClick={() => setShowRejectBox(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-800/80 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-900/50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Request Changes (Reject)
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Tab Navigation ─────────────────────────────── */}
        <div className="flex border-b border-zinc-800 px-6">
          <button
            type="button"
            onClick={() => setActiveTab('contract')}
            className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'contract'
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Checklist ({completedCriteriaCount}/{criteriaList.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('deliverables')}
            className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'deliverables'
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Deliverables &amp; Proof ({currentIssue?.deliverables?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('comments')}
            className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'comments'
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Discussion ({commentsQuery.data?.length ?? 0})
          </button>
        </div>

        {/* ── Drawer Scrollable Body ─────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* ════ TAB 1: ACCEPTANCE CRITERIA CONTRACT ══════ */}
          {activeTab === 'contract' && (
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-400">
                    Acceptance Criteria Completion
                  </span>
                  <span
                    className={`font-semibold ${
                      criteriaProgressPct === 100
                        ? 'text-emerald-400'
                        : 'text-zinc-300'
                    }`}
                  >
                    {criteriaProgressPct}% ({completedCriteriaCount}/
                    {criteriaList.length})
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full transition-all duration-300 ${
                      criteriaProgressPct === 100
                        ? 'bg-emerald-500'
                        : 'bg-violet-500'
                    }`}
                    style={{ width: `${criteriaProgressPct}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                {criteriaList.map((crit, idx) => {
                  const isChecked = crit.completed || crit.met || false;
                  return (
                    <div
                      key={crit.id || crit._id || idx}
                      className="group flex items-start gap-2.5 rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-2.5 transition-colors hover:border-zinc-700"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleCriterion(idx)}
                        className="mt-0.5 shrink-0 rounded text-zinc-400 transition-colors hover:text-emerald-400"
                      >
                        {isChecked ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <Circle className="h-4 w-4 text-zinc-600" />
                        )}
                      </button>
                      <span
                        className={`flex-1 text-xs leading-relaxed transition-all ${
                          isChecked
                            ? 'text-zinc-500 line-through'
                            : 'text-zinc-200'
                        }`}
                      >
                        {crit.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCriterion(idx)}
                        className="p-1 text-zinc-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                        title="Remove criterion"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}

                {criteriaList.length === 0 && (
                  <div className="rounded-lg border border-dashed border-zinc-800 py-8 text-center text-xs text-zinc-600">
                    No acceptance criteria defined yet.
                    <br />
                    Add checklists below so agents know what &quot;done&quot; looks like.
                  </div>
                )}
              </div>

              <form onSubmit={handleAddCriterion} className="flex gap-2">
                <input
                  value={newCritText}
                  onChange={(e) => setNewCritText(e.target.value)}
                  placeholder="Add new acceptance checklist item..."
                  className="flex-1 rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violet-600 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!newCritText.trim()}
                  className="inline-flex items-center gap-1 rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </form>
            </div>
          )}

          {/* ════ TAB 2: DELIVERABLES & MEDIA (Day 6) ═════ */}
          {activeTab === 'deliverables' && (
            <div className="space-y-4">
              {/* Drag-and-Drop Media Uploader Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors ${
                  isDraggingFile
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70'
                }`}
              >
                {isUploadingFile ? (
                  <Loader2 className="mb-2 h-6 w-6 animate-spin text-violet-400" />
                ) : (
                  <Upload className="mb-2 h-6 w-6 text-violet-400" />
                )}
                <p className="text-xs font-medium text-zinc-200">
                  {isUploadingFile
                    ? 'Uploading to Cloudinary Free…'
                    : 'Drop images, PDFs, audio, or video here — or click to browse'}
                </p>
                <p className="mt-1 text-[10px] text-zinc-500">
                  Direct signed upload via /api/uploads/sign (preserves MongoDB 512 MB limit)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,audio/*,video/*,.md,.txt"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-400">
                  Attached proof &amp; artifacts:
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDeliverableMode((m) => (m === 'link' ? 'none' : 'link'))
                    }
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                      deliverableMode === 'link'
                        ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <Link2 className="h-3.5 w-3.5 text-blue-400" />
                    Add Link
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeliverableMode((m) =>
                        m === 'markdown' ? 'none' : 'markdown',
                      )
                    }
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                      deliverableMode === 'markdown'
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 text-emerald-400" />
                    Add Markdown
                  </button>
                </div>
              </div>

              {/* Add Link Form */}
              {deliverableMode === 'link' && (
                <form
                  onSubmit={handleAddDeliverableLink}
                  className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3"
                >
                  <input
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    placeholder="Deliverable Title (e.g. Figma Design Link, PR #12)"
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 focus:border-violet-600 focus:outline-none"
                  />
                  <input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://..."
                    required
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 focus:border-violet-600 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDeliverableMode('none')}
                      className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!linkUrl.trim()}
                      className="rounded bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                    >
                      Attach Link
                    </button>
                  </div>
                </form>
              )}

              {/* Add Markdown Proof Form */}
              {deliverableMode === 'markdown' && (
                <form
                  onSubmit={handleAddMarkdownProof}
                  className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3"
                >
                  <input
                    value={markdownLabel}
                    onChange={(e) => setMarkdownLabel(e.target.value)}
                    placeholder="Report Title (e.g. Benchmark Results)"
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 focus:border-violet-600 focus:outline-none"
                  />
                  <textarea
                    value={markdownBody}
                    onChange={(e) => setMarkdownBody(e.target.value)}
                    placeholder="Paste markdown summary or test verification output..."
                    rows={3}
                    required
                    className="w-full resize-none rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:border-violet-600 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDeliverableMode('none')}
                      className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!markdownBody.trim()}
                      className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      Attach Report
                    </button>
                  </div>
                </form>
              )}

              {/* Deliverable Items List with Media Previews */}
              <div className="space-y-2.5">
                {currentIssue?.deliverables?.map((del, idx) => {
                  const info = getDeliverableDisplay(del);
                  return (
                    <div
                      key={del._id || idx}
                      className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 truncate">
                          {info.isAudio ? (
                            <FileAudio className="h-4 w-4 shrink-0 text-amber-400" />
                          ) : info.isVideo ? (
                            <FileVideo className="h-4 w-4 shrink-0 text-pink-400" />
                          ) : info.isPdf ? (
                            <FileSpreadsheet className="h-4 w-4 shrink-0 text-red-400" />
                          ) : info.type === 'file' ? (
                            <Paperclip className="h-4 w-4 shrink-0 text-violet-400" />
                          ) : info.type === 'markdown' ? (
                            <FileText className="h-4 w-4 shrink-0 text-emerald-400" />
                          ) : (
                            <Link2 className="h-4 w-4 shrink-0 text-blue-400" />
                          )}
                          <div className="truncate">
                            {info.isHttp ? (
                              <a
                                href={info.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-medium text-zinc-200 hover:text-violet-300 hover:underline"
                              >
                                {info.title}
                              </a>
                            ) : (
                              <span className="text-xs font-medium text-zinc-200">
                                {info.title}
                              </span>
                            )}
                            {del.byteSize && (
                              <span className="ml-2 text-[10px] text-zinc-500">
                                ({Math.round(del.byteSize / 1024)} KB)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {info.isHttp && (
                            <a
                              href={info.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded p-1 text-zinc-500 hover:text-zinc-300"
                              title="Open deliverable in new tab"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveDeliverable(idx)}
                            className="rounded p-1 text-zinc-600 hover:text-red-400"
                            title="Delete deliverable"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Rich Media / Markdown Previews */}
                      {info.isImage && info.isHttp && (
                        <a
                          href={info.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block overflow-hidden rounded border border-zinc-800"
                        >
                          <img
                            src={info.url}
                            alt={info.title}
                            className="max-h-40 w-full object-cover"
                          />
                        </a>
                      )}

                      {info.isAudio && info.isHttp && (
                        <audio controls src={info.url} className="w-full h-8" />
                      )}

                      {info.isVideo && info.isHttp && (
                        <video
                          controls
                          src={info.url}
                          className="max-h-44 w-full rounded border border-zinc-800"
                        />
                      )}

                      {info.type === 'markdown' && !info.isHttp && (
                        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-300">
                          {info.url}
                        </pre>
                      )}
                    </div>
                  );
                })}

                {(!currentIssue?.deliverables ||
                  currentIssue.deliverables.length === 0) && (
                  <div className="rounded-lg border border-dashed border-zinc-800 py-8 text-center text-xs text-zinc-600">
                    No deliverables attached yet.
                    <br />
                    Upload media proof, markdown reports, or links before QA review.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════ TAB 3: THREADED COMMENTS & @MENTIONS (Day 6) ═ */}
          {activeTab === 'comments' && (
            <div className="flex flex-col space-y-4">
              <div className="space-y-3">
                {commentsQuery.data?.map((comment) => {
                  const text = comment.body || comment.content || '';
                  return (
                    <div
                      key={comment._id}
                      className="space-y-1.5 rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 font-medium">
                          {comment.authorType === 'agent' ? (
                            <Bot className="h-3.5 w-3.5 text-blue-400" />
                          ) : (
                            <User className="h-3.5 w-3.5 text-emerald-400" />
                          )}
                          <span className="text-zinc-200">
                            {comment.authorName ||
                              (comment.authorType === 'agent'
                                ? 'AI Agent'
                                : 'Board Operator')}
                          </span>
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                            {comment.authorType}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500">
                          {new Date(comment.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                        {text.split(/(@\w+)/g).map((part, idx) =>
                          part.startsWith('@') ? (
                            <span
                              key={idx}
                              className="rounded bg-violet-600/20 px-1 py-0.5 font-medium text-violet-300"
                            >
                              {part}
                            </span>
                          ) : (
                            part
                          ),
                        )}
                      </p>
                    </div>
                  );
                })}

                {commentsQuery.data?.length === 0 && (
                  <div className="py-8 text-center text-xs text-zinc-600">
                    No comments yet. Type `@AgentName` below to mention and wake
                    an AI agent.
                  </div>
                )}
              </div>

              {/* Comment Input with @Mention Popover */}
              <div className="relative pt-2">
                {mentionQuery !== null && filteredMentionAgents.length > 0 && (
                  <div className="absolute bottom-full left-0 z-20 mb-1 max-h-48 w-64 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Mention Agent (triggers wakeup):
                    </p>
                    {filteredMentionAgents.map((agent) => (
                      <button
                        key={agent._id}
                        type="button"
                        onClick={() => handleSelectMention(agent.name)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        <Bot className="h-3.5 w-3.5 text-blue-400" />
                        <div>
                          <p className="font-medium text-zinc-200">
                            {agent.name}
                          </p>
                          <p className="text-[10px] text-zinc-500">
                            {agent.role}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <form onSubmit={handlePostComment} className="space-y-2">
                  <textarea
                    ref={commentTextareaRef}
                    value={commentText}
                    onChange={handleCommentChange}
                    rows={3}
                    placeholder="Write a comment or ask for an update... (@agent to wake)"
                    className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violet-600 focus:outline-none"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">
                      Pro tip: Tagging an agent enqueues a heartbeat run.
                    </span>
                    <button
                      type="submit"
                      disabled={!commentText.trim() || commentMutation.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                    >
                      {commentMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Comment
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
