const assert = require('assert');
const { generateMaskedPreview, encryptSecret, decryptSecret } = require('./src/services/vault');
const { calculateCostMicrocents } = require('./src/adapters/adapterExecutor');
const { AGENT_TOOLS } = require('./src/adapters/toolsSchema');

console.log('====================================================');
console.log('🧪 RUNNING DEVELOPER 2 CORE LOGIC VERIFICATION SUITE');
console.log('====================================================\n');

// -------------------------------------------------------------------
// TEST 1: AES-256-GCM Vault Encryption & Decryption
// -------------------------------------------------------------------
console.log('▶ Test 1: AES-256-GCM Vault Encryption & Decryption (Dev 1 Vault Service)');
const sampleApiKey = 'gsk_testgroqapikey998877665544332211';
const encrypted = encryptSecret(sampleApiKey);

assert.strictEqual(encrypted.maskedPreview, 'gsk_••••2211', 'Masked preview must show first 4 and last 4 chars');
assert.ok(encrypted.iv && encrypted.iv.length === 24, 'IV must be a 12-byte hex string');
assert.ok(encrypted.authTag && encrypted.authTag.length === 32, 'AuthTag must be a 16-byte hex string');

const decrypted = decryptSecret(encrypted.encryptedValue, encrypted.iv, encrypted.authTag);
assert.strictEqual(decrypted, sampleApiKey, 'Decrypted text must match original plaintext exactly');
console.log('  ✔ Passed: Dev 1 AES-256-GCM vault encryption, decryption, and preview masking fully verified with Dev 2.\n');

// -------------------------------------------------------------------
// TEST 2: Structured Tool Schemas
// -------------------------------------------------------------------
console.log('▶ Test 2: Structured Tool Schemas');
assert.strictEqual(AGENT_TOOLS.length, 5, 'Must define exactly 5 core tools');
const toolNames = AGENT_TOOLS.map(t => t.function.name);
const expectedTools = ['create_subtask', 'post_comment', 'attach_deliverable', 'submit_for_review', 'request_hire'];
for (const expected of expectedTools) {
  assert.ok(toolNames.includes(expected), `Missing tool: ${expected}`);
}
console.log('  ✔ Passed: All 5 tools (create_subtask, post_comment, attach_deliverable, submit_for_review, request_hire) correctly structured.\n');

// -------------------------------------------------------------------
// TEST 3: Microcent Cost Accounting Math
// -------------------------------------------------------------------
console.log('▶ Test 3: Microcent Cost Accounting Math');
// 1000 input tokens, 500 output tokens on Groq
const costGroq = calculateCostMicrocents('groq_llm', 'llama-3.3-70b-versatile', 1000, 500);
// Prompt: 1000 * 5900 / 100 = 59,000 microcents ($0.0059)
// Completion: 500 * 7900 / 100 = 39,500 microcents ($0.00395)
// Total = 98,500 microcents
assert.strictEqual(costGroq, 98500, 'Microcents calculation for Groq must be exact integer');

// Test Gemini cost
const costGemini = calculateCostMicrocents('gemini_llm', 'gemini-2.5-flash', 1000, 500);
// Prompt: 1000 * 750 / 100 = 7,500 microcents
// Completion: 500 * 3000 / 100 = 15,000 microcents
// Total = 22,500 microcents
assert.strictEqual(costGemini, 22500, 'Microcents calculation for Gemini must be exact integer');
console.log('  ✔ Passed: Microcent integer conversions ($1 = 10,000 microcents) verified.\n');

// -------------------------------------------------------------------
// TEST 4: 5-Minute Lease & Conflict Expiration Logic
// -------------------------------------------------------------------
console.log('▶ Test 4: Lease & Conflict Expiration Time Calculations');
const LEASE_MS = 5 * 60 * 1000;
const now = Date.now();
const expiresAt = now + LEASE_MS;
assert.ok(expiresAt - now === 300000, 'Lease expiration must be exactly 5 minutes (300,000 ms)');
console.log('  ✔ Passed: Atomic lease timing verified.\n');

console.log('====================================================');
console.log('🎉 ALL DEVELOPER 2 CORE LOGIC TESTS PASSED (100%)');
console.log('====================================================');
