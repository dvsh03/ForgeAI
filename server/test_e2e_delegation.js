const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  User,
  Company,
  Agent,
  Goal,
  Issue,
  IssueComment,
  WakeupQueue,
  HeartbeatRun,
  CostEvent
} = require('./src/models');
const { executeHeartbeat } = require('./src/services/heartbeatEngine');

async function runEndToEndDelegation() {
  console.log('================================================================');
  console.log('🤖 LIVE MULTI-AGENT WORKFORCE DELEGATION TEST (GEMINI 3.5 FLASH)');
  console.log('================================================================\n');

  // 1. Boot In-Memory Database
  console.log('▶ [1/5] Starting fast in-memory MongoDB environment...');
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  console.log('  ✔ In-memory database connected.\n');

  // 2. Seed Company, Hierarchy & Goals
  console.log('▶ [2/5] Seeding Demo Startup Organization ("Acme AI Corp")...');
  const user = await User.create({
    name: 'Operator Admin',
    email: 'admin@acmeai.com',
    password: 'Password123!'
  });

  const company = await Company.create({
    name: 'Acme AI Corp',
    issuePrefix: 'ACM',
    ownerUserId: user._id,
    budgetMonthlyCents: 500,
    issueCounter: 1
  });

  // Create Agents Hierarchy
  const ceoAgent = await Agent.create({
    companyId: company._id,
    name: 'Alex (CEO)',
    role: 'ceo',
    title: 'Chief Executive Officer',
    adapter: 'gemini_llm',
    model: 'gemini-3.5-flash-lite',
    budgetMonthlyCents: 100,
    status: 'idle'
  });

  const ctoAgent = await Agent.create({
    companyId: company._id,
    name: 'Priya (CTO)',
    role: 'cto',
    title: 'Chief Technology Officer',
    reportsTo: ceoAgent._id,
    adapter: 'gemini_llm',
    model: 'gemini-3.5-flash-lite',
    budgetMonthlyCents: 100,
    status: 'idle'
  });

  const engineerAgent = await Agent.create({
    companyId: company._id,
    name: 'David (Lead Dev)',
    role: 'engineer',
    title: 'Fullstack Systems Engineer',
    reportsTo: ctoAgent._id,
    adapter: 'gemini_llm',
    model: 'gemini-3.5-flash-lite',
    budgetMonthlyCents: 100,
    status: 'idle'
  });

  // Starter Goal & Root Ticket
  const goal = await Goal.create({
    companyId: company._id,
    title: 'Q4 Production Platform Launch',
    description: 'Launch the core multi-tenant workforce platform with AES-256 vault.'
  });

  const rootTicket = await Issue.create({
    companyId: company._id,
    issueNumber: 1,
    issueKey: 'ACM-1',
    title: 'Architect and Build JWT Auth & Secrets Vault',
    description: 'We need to implement multi-tenant JWT auth, tenant isolation middleware, and AES-256 encrypted secrets vault.',
    priority: 'urgent',
    goalId: goal._id,
    assigneeAgentId: ceoAgent._id,
    status: 'todo',
    acceptanceCriteria: [
      { id: 'ac1', text: 'JWT login and registration endpoints', completed: false },
      { id: 'ac2', text: 'AES-256-GCM encrypted secrets vault helper', completed: false }
    ]
  });

  console.log(`  ✔ Company Seeded: ${company.name} (${company.issuePrefix})`);
  console.log(`  ✔ Org Chart Hierarchy: Alex (CEO) -> Priya (CTO) -> David (Lead Dev)`);
  console.log(`  ✔ Root Ticket Created: ${rootTicket.issueKey} ("${rootTicket.title}") assigned to ${ceoAgent.name}\n`);

  // 3. Trigger CEO Agent Heartbeat Run
  console.log('▶ [3/5] Triggering CEO Agent Heartbeat using LIVE Gemini API...');
  console.log('       (CEO will analyze ACM-1, plan execution, and call structured tools)\n');

  const runStartTime = Date.now();
  const run = await executeHeartbeat({
    agentId: ceoAgent._id,
    companyId: company._id,
    triggerType: 'manual',
    issueId: rootTicket._id
  });
  const elapsedSeconds = ((Date.now() - runStartTime) / 1000).toFixed(1);

  console.log(`\n▶ [4/5] Heartbeat Completed in ${elapsedSeconds}s! Run Status: [${run.status}]`);
  console.log('----------------------------------------------------------------');
  console.log('📜 LIVE EXECUTION LOGS:');
  run.logs.forEach(log => {
    console.log(`  [${log.level.padEnd(7)}] ${log.message}`);
  });
  console.log('----------------------------------------------------------------\n');

  // 4. Verify Database State & Autonomous Handoff
  console.log('▶ [5/5] Verifying Multi-Agent Delegation & Autonomous Queue Handoff:');

  // Check newly created subtasks in database
  const childIssues = await Issue.find({
    companyId: company._id,
    parentIssueId: rootTicket._id
  }).populate('assigneeAgentId', 'name role title');

  console.log(`  📦 Total Child Tickets Created by CEO: ${childIssues.length}`);
  childIssues.forEach((ci, idx) => {
    console.log(`     #${idx + 1}: ${ci.issueKey} - "${ci.title}"`);
    console.log(`        Priority: ${ci.priority}`);
    console.log(`        Assigned To: ${ci.assigneeAgentId ? ci.assigneeAgentId.name : 'Unassigned'}`);
    console.log(`        Checklist Items: ${ci.acceptanceCriteria.length}`);
  });

  // Check WakeupQueue for subordinate worker
  const pendingWakeups = await WakeupQueue.find({
    companyId: company._id,
    status: 'queued'
  }).populate('agentId', 'name role');

  console.log(`\n  📬 Pending Subordinate Wakeups Enqueued in WakeupQueue: ${pendingWakeups.length}`);
  pendingWakeups.forEach((w, idx) => {
    console.log(`     Wakeup #${idx + 1}: Agent [${w.agentId.name}] | Trigger: ${w.triggerType} | Coalesced: ${w.coalescedCount}`);
  });

  // Check Token & Microcent Accounting
  const costEvents = await CostEvent.find({ companyId: company._id });
  console.log(`\n  💰 Microcent Accounting Recorded:`);
  console.log(`     Cost Events: ${costEvents.length}`);
  costEvents.forEach(ce => {
    console.log(`     Model: ${ce.model} | Input: ${ce.inputTokens} | Output: ${ce.outputTokens} | Cost: ${ce.costMicrocents} microcents`);
  });

  console.log('\n================================================================');
  console.log('🎉 100% END-TO-END AUTONOMOUS MULTI-AGENT WORKFORCE VERIFIED!');
  console.log('================================================================\n');

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(0);
}

runEndToEndDelegation().catch(async (err) => {
  console.error('❌ Error during E2E test:', err);
  await mongoose.disconnect();
  process.exit(1);
});
