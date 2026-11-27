const mongoose = require('mongoose');
const EventEmitter = require('events');
const {
  Agent,
  Company,
  Issue,
  Goal,
  IssueComment,
  HeartbeatRun,
  Approval,
  BudgetIncident,
  CostEvent,
  WakeupQueue
} = require('../models');
const { checkoutIssue, releaseIssueLock } = require('./issueLockService');
const { canAgentExecute, enqueueWakeup } = require('./wakeupQueue');
const { executeAdapter } = require('../adapters/adapterExecutor');
const { allocateIssueKey } = require('../utils/issueKey');

// Global event bus for streaming SSE events to connected frontend clients
const runEventBus = new EventEmitter();
runEventBus.setMaxListeners(100);

const MAX_TOOL_STEPS = 5;

/**
 * Executes a single tool action returned by the LLM
 */
async function executeToolAction({ toolCall, agent, currentIssue, run, onLog }) {
  const { name, arguments: args } = toolCall;
  onLog('TOOL_CALL', `Executing tool [${name}]: ${JSON.stringify(args)}`);

  switch (name) {
    case 'create_subtask': {
      // Find candidate subordinate agent by role
      const subAgent = await Agent.findOne({
        companyId: agent.companyId,
        reportsTo: agent._id,
        role: args.assigneeRole
      }) || await Agent.findOne({
        companyId: agent.companyId,
        role: args.assigneeRole
      });

      // Allocate atomic issue key and number using Dev 1 utility
      const { issueNumber, issueKey } = await allocateIssueKey(agent.companyId);

      const checklist = Array.isArray(args.acceptanceCriteria)
        ? args.acceptanceCriteria.map((text, idx) => ({ id: `ac_${idx + 1}`, text, completed: false }))
        : [];

      const childIssue = await Issue.create({
        companyId: agent.companyId,
        issueNumber,
        issueKey,
        title: args.title,
        description: args.description,
        priority: args.priority || 'medium',
        goalId: currentIssue ? currentIssue.goalId : null,
        parentIssueId: currentIssue ? currentIssue._id : null,
        assigneeAgentId: subAgent ? subAgent._id : null,
        status: 'todo',
        acceptanceCriteria: checklist
      });

      onLog('SUCCESS', `Created subtask ${issueKey} assigned to ${subAgent ? subAgent.name : 'Unassigned'}`);

      // Enqueue wakeup for the assigned subordinate
      if (subAgent) {
        await enqueueWakeup({
          companyId: agent.companyId,
          agentId: subAgent._id,
          triggerType: 'assignment',
          targetIssueId: childIssue._id,
          payload: { issueId: childIssue._id, subtaskOf: currentIssue ? currentIssue._id : null }
        });
        onLog('SYSTEM', `Enqueued assignment wakeup for subordinate agent: ${subAgent.name}`);
      }

      return { success: true, issueId: childIssue._id, identifier: issueKey, issueKey };
    }

    case 'post_comment': {
      if (!currentIssue) {
        return { success: false, error: 'Cannot post comment: No active issue in context.' };
      }

      const commentText = args.content || args.body || '';
      const comment = await IssueComment.create({
        companyId: agent.companyId,
        issueId: currentIssue._id,
        authorType: 'agent',
        authorId: String(agent._id),
        authorAgentId: agent._id,
        authorName: agent.name,
        content: commentText,
        body: commentText,
      });

      onLog('SUCCESS', `Posted update to ticket ${currentIssue.issueKey || currentIssue.identifier || currentIssue._id}`);

      // Parse @Mentions (e.g., @CTO, @Lead Dev, @AgentName)
      const mentionMatches = (commentText || '').match(/@(\w+)/g);
      if (mentionMatches) {
        for (const mention of mentionMatches) {
          const targetNameOrRole = mention.replace('@', '').toLowerCase();
          const escapedToken = targetNameOrRole.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const targetAgent = await Agent.findOne({
            companyId: agent.companyId,
            $or: [
              { role: new RegExp(`^${escapedToken}$`, 'i') },
              { name: new RegExp(`^${escapedToken}`, 'i') }
            ]
          });
          if (targetAgent && String(targetAgent._id) !== String(agent._id)) {
            await enqueueWakeup({
              companyId: agent.companyId,
              agentId: targetAgent._id,
              triggerType: 'mention',
              targetIssueId: currentIssue._id,
              payload: { issueId: currentIssue._id, mentionedBy: agent.name }
            });
            onLog('SYSTEM', `Wakeup enqueued for mentioned agent: ${targetAgent.name}`);
          }
        }
      }

      return { success: true, commentId: comment._id };
    }

    case 'attach_deliverable': {
      if (!currentIssue) {
        return { success: false, error: 'Cannot attach deliverable: No active issue in context.' };
      }

      const deliverableType = args.kind === 'link' ? 'url' : (args.kind || 'url');
      const deliverable = {
        type: deliverableType,
        title: args.label || 'Artifact / Proof',
        contentOrUrl: args.url
      };

      currentIssue.deliverables.push(deliverable);
      await currentIssue.save();

      onLog('SUCCESS', `Attached deliverable: "${deliverable.title}" (${deliverable.contentOrUrl})`);
      return { success: true, deliverable };
    }

    case 'submit_for_review': {
      if (!currentIssue) {
        return { success: false, error: 'Cannot submit for review: No active issue.' };
      }

      // Releasing lock and setting status to 'in_review'
      currentIssue.status = 'in_review';
      await currentIssue.save();

      onLog('SUCCESS', `Ticket ${currentIssue.issueKey || currentIssue.identifier || currentIssue._id} submitted for QA Review. Checkout lock released.`);
      return { success: true, status: 'in_review', summary: args.summary };
    }

    case 'request_hire': {
      const approval = await Approval.create({
        companyId: agent.companyId,
        agentId: agent._id,
        requestedByAgentId: agent._id,
        type: 'hire_agent',
        payload: {
          role: args.role,
          title: args.title,
          budgetMonthlyCents: args.budgetMonthlyCents || 100,
          justification: args.justification
        },
        status: 'pending'
      });

      onLog('SUCCESS', `Hiring proposal submitted for human approval. ID: ${approval._id}`);
      return { success: true, approvalId: approval._id };
    }

    default:
      onLog('WARN', `Unrecognized tool call: ${name}`);
      return { success: false, error: `Unknown tool: ${name}` };
  }
}

/**
 * 7-Stage Heartbeat Execution Pipeline
 *
 * @param {Object} params
 * @param {string|ObjectId} params.agentId
 * @param {string|ObjectId} params.companyId
 * @param {string} [params.triggerType] - 'manual', 'assignment', 'mention', 'cron', 'approval_resolved'
 * @param {string|ObjectId} [params.issueId] - Target issue to work on
 * @param {string|ObjectId} [params.wakeupId] - Corresponding WakeupQueue record to mark complete
 * @returns {Promise<Object>} Completed HeartbeatRun record
 */
async function executeHeartbeat({
  agentId,
  companyId,
  triggerType = 'manual',
  issueId = null,
  wakeupId = null,
  existingRunId = null
}) {
  // Stage 1 & 2: Pre-Flight Concurrency & Budget Gate
  const preCheck = await canAgentExecute(companyId, agentId, triggerType);
  if (!preCheck.allowed) {
    const blockMessage = `Execution blocked by pre-flight gate: ${preCheck.reason}`;
    if (existingRunId && mongoose.Types.ObjectId.isValid(existingRunId)) {
      const blockedStatus = preCheck.reason === 'BUDGET_EXCEEDED' ? 'budget_stopped' : 'failed';
      await HeartbeatRun.findByIdAndUpdate(existingRunId, {
        $set: { status: blockedStatus, endedAt: new Date(), errorMessage: blockMessage },
        $push: { logs: { ts: new Date(), level: 'error', message: blockMessage } }
      }).catch(() => {});
      runEventBus.emit(`run:${existingRunId}`, {
        event: 'done',
        data: { status: blockedStatus }
      });
    }
    if (wakeupId) {
      const shouldRequeue =
        triggerType !== 'manual' &&
        ['COOLDOWN_ACTIVE', 'CONCURRENCY_LIMIT_REACHED', 'AGENT_ALREADY_RUNNING'].includes(preCheck.reason);
      await WakeupQueue.findByIdAndUpdate(
        wakeupId,
        shouldRequeue ? { status: 'queued' } : { status: 'failed', processedAt: new Date() }
      ).catch(() => {});
    }
    throw new Error(blockMessage);
  }

  const agent = preCheck.agent;

  // Initialize or resume HeartbeatRun record
  let run = null;
  if (existingRunId && mongoose.Types.ObjectId.isValid(existingRunId)) {
    run = await HeartbeatRun.findById(existingRunId);
  }
  if (!run) {
    run = await HeartbeatRun.create({
      companyId,
      agentId: agent._id,
      targetIssueId: issueId || null,
      wakeupQueueId: wakeupId || null,
      triggerType: triggerType || 'manual',
      status: 'running',
      startedAt: new Date(),
      logs: []
    });
  }

  // Helper logger that caps logs at 50 entries and emits SSE events
  const onLog = (rawLevel, message) => {
    const ts = new Date();
    const levelMap = {
      'tool_call': 'tool',
      'tool': 'tool',
      'success': 'info',
      'info': 'info',
      'system': 'system',
      'thought': 'thought',
      'error': 'error',
      'warn': 'warn',
      'budget': 'budget'
    };
    const level = levelMap[String(rawLevel).toLowerCase()] || 'info';
    const entry = { ts, level, message: String(message).slice(0, 1000) };

    if (run.logs.length < 50) {
      run.logs.push(entry);
    }

    // Broadcast SSE log event
    runEventBus.emit(`run:${run._id}`, {
      event: 'log',
      data: entry
    });
  };

  onLog('SYSTEM', `Agent [${agent.name}] (${agent.role}) woke up via ${triggerType} trigger.`);

  // Flip agent status to 'running' only if not paused, terminated, or budget_stopped
  const currentAgentState = await Agent.findById(agent._id);
  if (!currentAgentState || ['paused', 'terminated', 'budget_stopped'].includes(currentAgentState.status)) {
    const abortMsg = `Aborting heartbeat: agent status is ${currentAgentState?.status || 'missing'}`;
    onLog('WARN', abortMsg);
    run.status = currentAgentState?.status === 'budget_stopped' ? 'budget_stopped' : 'failed';
    run.errorMessage = abortMsg;
    run.endedAt = new Date();
    await run.save();
    if (wakeupId) {
      await WakeupQueue.findByIdAndUpdate(wakeupId, { status: 'failed', processedAt: new Date() }).catch(() => {});
    }
    runEventBus.emit(`run:${run._id}`, { event: 'done', data: { status: run.status } });
    return run;
  }

  await Agent.updateOne(
    { _id: agent._id, status: { $nin: ['paused', 'terminated', 'budget_stopped'] } },
    { $set: { status: 'running', lastHeartbeatAt: new Date(), lastActiveAt: new Date() } }
  );

  // Mark WakeupQueue entry as processing if provided
  if (wakeupId) {
    await WakeupQueue.findByIdAndUpdate(wakeupId, { status: 'processing' });
  }

  let lockedIssue = null;
  let totalCommentsHydratedCount = 0;

  try {
    // Stage 3: Atomic Ticket Checkout (409 Guard)
    let targetIssueId = issueId;
    if (!targetIssueId) {
      // Find highest priority assigned issue in backlog or todo
      const candidates = await Issue.find({
        companyId,
        assigneeAgentId: agent._id,
        status: { $in: ['todo', 'backlog'] }
      }).sort({ createdAt: 1 });
      const priorityRank = { urgent: 4, high: 3, medium: 2, low: 1 };
      candidates.sort((a, b) => (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0));
      if (candidates.length > 0) targetIssueId = candidates[0]._id;
    }

    if (targetIssueId) {
      const checkoutResult = await checkoutIssue({
        companyId,
        issueId: targetIssueId,
        agentId: agent._id,
        runId: run._id
      });

      if (!checkoutResult.success) {
        onLog('WARN', `Atomic Lock acquisition failed (409 Conflict): ${checkoutResult.error}`);
      } else {
        lockedIssue = checkoutResult.issue;
        run.targetIssueId = lockedIssue._id;
        onLog('SYSTEM', `Acquired 5-minute atomic lease on ticket ${lockedIssue.issueKey || lockedIssue.identifier}: "${lockedIssue.title}"`);
      }
    }

    // Stage 4: Delta-Only Context Hydration
    let unreadComments = [];
    if (lockedIssue) {
      // Skip comments already hydrated in previous runs
      const previousCursor = lockedIssue.lastHydratedCommentCount || 0;
      unreadComments = await IssueComment.find({ issueId: lockedIssue._id })
        .sort({ createdAt: 1 })
        .skip(previousCursor);

      totalCommentsHydratedCount = previousCursor + unreadComments.length;
      onLog('SYSTEM', `Delta Hydration: Loaded ${unreadComments.length} unread comments (Skipped ${previousCursor} previously seen).`);
    }

    // Direct Subordinates
    const subordinates = await Agent.find({ companyId, reportsTo: agent._id }).select('name role title status');

    // Parent Goal
    let parentGoalTitle = 'N/A';
    if (lockedIssue && lockedIssue.goalId) {
      const goal = await Goal.findById(lockedIssue.goalId);
      if (goal) parentGoalTitle = goal.title;
    }

    // Assembling Compact Context Prompt
    const systemPrompt = `You are ${agent.name}, the ${agent.title || agent.role} of an autonomous AI workforce company.
Role Description & Instructions:
${agent.instructionsMarkdown || 'Execute your assigned company duties thoroughly.'}

Subordinate Team:
${subordinates.map(s => `- ${s.name} (${s.role}, ${s.title || ''}) [${s.status}]`).join('\n') || 'None'}

Operating Rules:
1. Always analyze acceptance criteria before acting.
2. If tasks need breakdown, use create_subtask.
3. When finished, submit deliverables via attach_deliverable and call submit_for_review.
4. You have a maximum budget of 5 tool calls per execution burst.`;

    const userContext = {
      currentTicket: lockedIssue ? {
        id: lockedIssue.issueKey || lockedIssue.identifier,
        title: lockedIssue.title,
        description: lockedIssue.description,
        priority: lockedIssue.priority,
        parentGoal: parentGoalTitle,
        acceptanceCriteria: lockedIssue.acceptanceCriteria,
        deliverables: lockedIssue.deliverables
      } : 'No specific ticket attached.',
      newUnreadComments: unreadComments.map(c => `[${c.authorType}] ${c.content || c.body || ''}`)
    };

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(userContext) }
    ];

    // Stage 5: Structured LLM Tool Loop (Max 5 Steps)
    const adapterResult = await executeAdapter({
      agent,
      messages,
      onLog
    });

    if (adapterResult.content) {
      onLog('THOUGHT', adapterResult.content);
    }

    // Execute returned tool calls (capped at 5)
    const toolCallsToExecute = (adapterResult.toolCalls || []).slice(0, MAX_TOOL_STEPS);
    for (const tc of toolCallsToExecute) {
      await executeToolAction({
        toolCall: tc,
        agent,
        currentIssue: lockedIssue,
        run,
        onLog
      });
    }

    // Stage 6: Microcent Accounting & Circuit Breaker Check
    const { inputTokens, outputTokens } = adapterResult.usage || { inputTokens: 0, outputTokens: 0 };
    const costMicrocents = adapterResult.costMicrocents || 0;

    run.inputTokens = inputTokens;
    run.outputTokens = outputTokens;
    run.costMicrocents = costMicrocents;

    // Record CostEvent
    await CostEvent.create({
      companyId,
      agentId: agent._id,
      runId: run._id,
      adapter: adapterResult.providerUsed || agent.adapter || agent.adapterType || 'groq_llm',
      model: adapterResult.modelUsed || agent.model || agent.adapterConfig?.model || 'unknown',
      inputTokens,
      outputTokens,
      costMicrocents
    });

    // Atomically increment spentMicrocents on Agent and Company
    const updatedAgent = await Agent.findByIdAndUpdate(
      agent._id,
      { $inc: { spentMonthlyMicrocents: costMicrocents } },
      { new: true }
    );
    await Company.findByIdAndUpdate(
      companyId,
      { $inc: { spentMonthlyMicrocents: costMicrocents } }
    );

    // Broadcast usage event over SSE
    runEventBus.emit(`run:${run._id}`, {
      event: 'usage',
      data: { inputTokens, outputTokens, costMicrocents }
    });

    // Check circuit breaker thresholds
    const monthlyLimitMicrocents = (updatedAgent.budgetMonthlyCents || 100) * 10000;
    const currentSpend = updatedAgent.spentMonthlyMicrocents;
    const spendRatio = currentSpend / monthlyLimitMicrocents;

    if (spendRatio >= 1.0) {
      onLog('ERROR', `100% Monthly budget cap reached ($${(currentSpend/1000000).toFixed(2)} / $${(monthlyLimitMicrocents/1000000).toFixed(2)}). Tripping circuit breaker.`);
      updatedAgent.status = 'budget_stopped';
      await updatedAgent.save();

      await BudgetIncident.create({
        companyId,
        agentId: updatedAgent._id,
        budgetMonthlyCents: updatedAgent.budgetMonthlyCents || 100,
        spentMonthlyMicrocents: currentSpend,
        threshold: 100,
        status: 'open',
        resolutionNote: 'Circuit breaker auto-stop triggered at 100% spend limit.'
      });
      run.status = 'budget_stopped';
    } else if (spendRatio >= 0.8) {
      onLog('WARN', `Agent spend reached ${(spendRatio * 100).toFixed(1)}% of monthly budget warning threshold.`);
    }

    // Stage 7: Lock Release & SSE Stream Close
    if (lockedIssue) {
      // If issue was not moved to in_review, keep current status or release lease
      await releaseIssueLock({
        issueId: lockedIssue._id,
        runId: run._id,
        newStatus: lockedIssue.status,
        newHydratedCommentCount: totalCommentsHydratedCount
      });
      onLog('SYSTEM', `Updated delta hydration cursor to ${totalCommentsHydratedCount} comments. Lock released.`);
    }

    // If agent is not budget_stopped, reset to idle only if not paused or terminated
    await Agent.updateOne(
      { _id: agent._id, status: { $nin: ['paused', 'terminated', 'budget_stopped'] } },
      { $set: { status: 'idle' } }
    );

    if (run.status !== 'budget_stopped') {
      run.status = 'completed';
    }

    onLog('SUCCESS', `Heartbeat run completed successfully (${run.status}).`);
  } catch (error) {
    onLog('ERROR', `Heartbeat error: ${error.message}`);
    run.status = 'failed';
    run.errorMessage = error.message;

    // Ensure locks are safely released on failure
    if (lockedIssue) {
      await releaseIssueLock({
        issueId: lockedIssue._id,
        runId: run._id,
        newStatus: 'todo',
        newHydratedCommentCount: totalCommentsHydratedCount
      });
    }

    // Reset agent status to idle unless budget_stopped, paused, or terminated
    await Agent.updateOne(
      { _id: agent._id, status: { $nin: ['paused', 'terminated', 'budget_stopped'] } },
      { $set: { status: 'idle' } }
    );
  } finally {
    run.endedAt = new Date();
    await run.save();

    // Mark WakeupQueue entry complete or failed
    if (wakeupId) {
      await WakeupQueue.findByIdAndUpdate(wakeupId, {
        status: run.status === 'failed' ? 'failed' : 'completed',
        processedAt: new Date()
      });
    }

    // Emit final 'done' SSE event
    runEventBus.emit(`run:${run._id}`, {
      event: 'done',
      data: { status: run.status }
    });
  }

  return run;
}

module.exports = {
  runEventBus,
  executeHeartbeat
};
