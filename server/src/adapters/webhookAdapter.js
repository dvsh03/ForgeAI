/**
 * HTTP Webhook Adapter for dispatching agent context to custom HTTP endpoints
 *
 * @param {Object} params
 * @param {string} params.webhookUrl
 * @param {string} [params.secretKey]
 * @param {Object} params.payload
 * @returns {Promise<{ toolCalls: Array, content: string, usage: Object }>}
 */
async function callWebhook({ webhookUrl, secretKey, payload }) {
  if (!webhookUrl) {
    throw new Error('Webhook URL is required for http_webhook adapter.');
  }

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Paperclip-MERN-Autonomous-Agent'
  };

  if (secretKey) {
    headers['Authorization'] = `Bearer ${secretKey}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Webhook HTTP Error (${response.status}): ${errText}`);
    }

    const data = await response.json();

    return {
      content: data.content || data.message || '',
      toolCalls: Array.isArray(data.toolCalls) ? data.toolCalls : [],
      usage: data.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Webhook call timed out after 10 seconds.');
    }
    throw err;
  }
}

module.exports = {
  callWebhook
};
