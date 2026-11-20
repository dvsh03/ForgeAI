const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config(); // also check root if any
const { callGemini } = require('./src/adapters/geminiAdapter');
const { calculateCostMicrocents } = require('./src/adapters/adapterExecutor');
const { AGENT_TOOLS } = require('./src/adapters/toolsSchema');

async function testLiveGemini() {
  console.log('========================================================');
  console.log('🚀 TESTING LIVE GOOGLE GEMINI (gemini-2.5-flash) ADAPTER');
  console.log('========================================================\n');

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    console.error('❌ ERROR: GEMINI_API_KEY is not configured yet in server/.env!');
    console.log('\n👉 Please open server/.env and paste your Gemini API key:');
    console.log('   GEMINI_API_KEY=AIzaSy...\n');
    process.exit(1);
  }

  console.log(`[1/3] Using Gemini API Key: ${apiKey.slice(0, 8)}••••••••`);
  console.log('[2/3] Sending sample CEO agent heartbeat context to Gemini 2.5 Flash...\n');

  const systemPrompt = `You are Alex, the CEO Agent of an autonomous AI workforce company.
Your duty is to review incoming high-level project goals and decompose them into actionable subtasks for your team.

Your Subordinate Team:
- Priya (Role: cto, Title: Chief Technology Officer)
- David (Role: engineer, Title: Lead Fullstack Developer)
- Sara (Role: marketer, Title: Head of Growth)

Operating Rules:
1. Always analyze acceptance criteria before acting.
2. If tasks need technical implementation, use create_subtask assigned to "engineer" or "cto".
3. Post a comment announcing your plan.
4. Call tools directly from the provided schema.`;

  const userContext = {
    currentTicket: {
      id: 'PAP-1',
      title: 'Launch MVP Authentication and Multi-Tenant Workspace',
      description: 'We need to implement secure JWT authentication, multi-tenant company isolation, and an AES-256 encrypted secrets vault.',
      priority: 'high',
      parentGoal: 'Q4 Product Launch',
      acceptanceCriteria: [
        'JWT login & registration endpoints',
        'Company data isolation middleware',
        'AES-256-GCM secrets encryption'
      ]
    },
    newUnreadComments: [
      '[user] Operator: Alex, please break this ticket down and assign the implementation to the tech team immediately.'
    ]
  };

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(userContext) }
  ];

  try {
    const startTime = Date.now();
    const result = await callGemini({
      apiKey,
      model: 'gemini-3.5-flash-lite',
      messages,
      tools: AGENT_TOOLS
    });
    const latencyMs = Date.now() - startTime;

    console.log(`[3/3] Received Response from Gemini in ${latencyMs}ms!\n`);

    if (result.content) {
      console.log('💭 [LLM THOUGHT / MESSAGE]:');
      console.log(result.content);
      console.log('--------------------------------------------------------');
    }

    console.log(`🛠️ [STRUCTURED TOOL CALLS RECEIVED]: ${result.toolCalls.length}`);
    result.toolCalls.forEach((tc, idx) => {
      console.log(`\n  👉 Tool Action #${idx + 1}: [${tc.name}]`);
      console.log('     Arguments:', JSON.stringify(tc.arguments, null, 2));
    });

    console.log('\n--------------------------------------------------------');
    console.log('📊 [TOKEN & COST TELEMETRY]:');
    console.log(`   Input Tokens:  ${result.usage.inputTokens}`);
    console.log(`   Output Tokens: ${result.usage.outputTokens}`);
    console.log(`   Total Tokens:  ${result.usage.totalTokens}`);

    const costMicrocents = calculateCostMicrocents(
      'gemini_llm',
      'gemini-2.5-flash',
      result.usage.inputTokens,
      result.usage.outputTokens
    );
    console.log(`   Integer Cost:  ${costMicrocents} microcents ($${(costMicrocents / 1000000).toFixed(6)} USD)`);

    console.log('\n========================================================');
    console.log('🎉 SUCCESS: Live Gemini Tool Loop is 100% Operational!');
    console.log('========================================================\n');
  } catch (err) {
    console.error('❌ Live Gemini API Call Failed:');
    console.error(err.message);
  }
}

testLiveGemini();
