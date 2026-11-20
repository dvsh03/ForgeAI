const { callGroq, GroqRateLimitError } = require('./groqAdapter');
const { callGemini } = require('./geminiAdapter');
const { callWebhook } = require('./webhookAdapter');
const { getDecryptedSecret } = require('../services/vault');

/**
 * Calculates microcents cost based on tokens and provider rates
 * 1 USD cent = 10,000 microcents
 * Llama 3.3 70B: ~$0.59 / 1M prompt, $0.79 / 1M completion (~60-80 microcents/1k)
 * Gemini 2.5 Flash: ~$0.075 / 1M prompt, $0.30 / 1M completion (~10-30 microcents/1k)
 */
function calculateCostMicrocents(provider, model, inputTokens, outputTokens) {
  let inputRatePerM = 5900; // in cents per 1M tokens ($0.59)
  let outputRatePerM = 7900; // in cents per 1M tokens ($0.79)

  if (provider === 'gemini_llm' || model.includes('gemini')) {
    inputRatePerM = 750; // $0.075
    outputRatePerM = 3000; // $0.30
  }

  // Microcents = tokens * (cents/1M) * 10,000 / 1,000,000 = tokens * (cents/1M) / 100
  const inputCost = Math.round((inputTokens * inputRatePerM) / 100);
  const outputCost = Math.round((outputTokens * outputRatePerM) / 100);

  return inputCost + outputCost;
}

/**
 * Universal Adapter Executor with Automatic 429 Failover (Groq -> Gemini)
 *
 * @param {Object} params
 * @param {Object} params.agent - Agent Mongoose model
 * @param {Array} params.messages - Prompt messages
 * @param {Function} [params.onLog] - Optional logger callback for live SSE output
 * @returns {Promise<{ toolCalls: Array, content: string, usage: Object, providerUsed: string, costMicrocents: number }>}
 */
async function executeAdapter({ agent, messages, onLog = () => {} }) {
  const adapterType = agent.adapter || agent.adapterType || 'groq_llm';
  const model = agent.model || agent.adapterConfig?.model;
  const webhookUrl = agent.webhookUrl || agent.adapterConfig?.webhookUrl;
  const companyId = agent.companyId;

  // 1. Webhook Adapter Execution
  if (adapterType === 'http_webhook') {
    onLog('SYSTEM', `Dispatching context to external webhook: ${webhookUrl}`);
    const secret = (await getDecryptedSecret(companyId, 'WEBHOOK_SECRET')) || process.env.WEBHOOK_SECRET;
    const result = await callWebhook({
      webhookUrl,
      secretKey: secret,
      payload: { agentId: agent._id, messages }
    });
    return {
      ...result,
      providerUsed: 'http_webhook',
      costMicrocents: 0
    };
  }

  // Check available keys
  const groqKey = (await getDecryptedSecret(companyId, 'GROQ_API_KEY')) || process.env.GROQ_API_KEY;
  const geminiKey = (await getDecryptedSecret(companyId, 'GEMINI_API_KEY')) || process.env.GEMINI_API_KEY;

  // Auto-route to Gemini if Groq key is absent but Gemini key is available
  if (adapterType === 'groq_llm' && !groqKey && geminiKey) {
    onLog('SYSTEM', 'No GROQ_API_KEY found in vault/env. Auto-routing to Google Gemini (gemini-3.5-flash-lite)...');
    const result = await callGemini({
      apiKey: geminiKey,
      model: model && model.includes('gemini') ? model : 'gemini-3.5-flash-lite',
      messages
    });

    const costMicrocents = calculateCostMicrocents(
      'gemini_llm',
      'gemini-3.5-flash-lite',
      result.usage.inputTokens,
      result.usage.outputTokens
    );

    return {
      ...result,
      providerUsed: 'gemini_llm',
      costMicrocents
    };
  }

  // 2. Groq LLM Adapter Execution with Auto 429 Failover
  if (adapterType === 'groq_llm') {
    try {
      onLog('SYSTEM', `Invoking Groq LLM (${model || 'llama-3.3-70b-versatile'})...`);
      const result = await callGroq({
        apiKey: groqKey,
        model: model || 'llama-3.3-70b-versatile',
        messages
      });

      const costMicrocents = calculateCostMicrocents(
        'groq_llm',
        model || 'llama-3.3-70b-versatile',
        result.usage.inputTokens,
        result.usage.outputTokens
      );

      return {
        ...result,
        providerUsed: 'groq_llm',
        costMicrocents
      };
    } catch (err) {
      if (err instanceof GroqRateLimitError || err.statusCode === 429) {
        onLog('WARN', `Groq 429 Rate Limit encountered. Waiting 2s before failover to Gemini...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second backoff

        if (geminiKey) {
          onLog('SYSTEM', `Failing over execution to Google Gemini (gemini-3.5-flash-lite)...`);
          const geminiResult = await callGemini({
            apiKey: geminiKey,
            model: 'gemini-3.5-flash-lite',
            messages
          });

          const costMicrocents = calculateCostMicrocents(
            'gemini_llm',
            'gemini-3.5-flash-lite',
            geminiResult.usage.inputTokens,
            geminiResult.usage.outputTokens
          );

          return {
            ...geminiResult,
            providerUsed: 'gemini_llm',
            costMicrocents
          };
        } else {
          onLog('ERROR', `Groq rate-limited and no GEMINI_API_KEY found in vault for failover.`);
          throw err;
        }
      }
      throw err;
    }
  }

  // 3. Gemini LLM Direct Adapter
  if (adapterType === 'gemini_llm') {
    onLog('SYSTEM', `Invoking Gemini LLM (${model || 'gemini-3.5-flash-lite'})...`);
    const result = await callGemini({
      apiKey: geminiKey,
      model: model || 'gemini-3.5-flash-lite',
      messages
    });

    const costMicrocents = calculateCostMicrocents(
      'gemini_llm',
      model || 'gemini-3.5-flash-lite',
      result.usage.inputTokens,
      result.usage.outputTokens
    );

    return {
      ...result,
      providerUsed: 'gemini_llm',
      costMicrocents
    };
  }

  throw new Error(`Unsupported adapter type: ${adapterType}`);
}

module.exports = {
  calculateCostMicrocents,
  executeAdapter
};
