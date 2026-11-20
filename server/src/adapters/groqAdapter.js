const { AGENT_TOOLS } = require('./toolsSchema');

class GroqRateLimitError extends Error {
  constructor(message, status = 429) {
    super(message);
    this.name = 'GroqRateLimitError';
    this.statusCode = status;
  }
}

/**
 * Execute a structured tool-calling loop using Groq API (llama-3.3-70b-versatile)
 *
 * @param {Object} params
 * @param {string} params.apiKey
 * @param {string} [params.model] - Defaults to 'llama-3.3-70b-versatile'
 * @param {Array} params.messages - [{ role: 'system'|'user'|'assistant', content: string }]
 * @param {Array} [params.tools] - Defaults to AGENT_TOOLS
 * @param {number} [params.temperature]
 * @returns {Promise<{ toolCalls: Array, content: string, usage: Object }>}
 */
async function callGroq({
  apiKey,
  model = 'llama-3.3-70b-versatile',
  messages,
  tools = AGENT_TOOLS,
  temperature = 0.2
}) {
  if (!apiKey) {
    throw new Error('Groq API Key is missing. Please configure it in Vault or environment.');
  }

  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

  const body = {
    model,
    messages,
    tools,
    tool_choice: 'auto',
    temperature,
    max_tokens: 1500
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (response.status === 429 || response.status === 503) {
    const errText = await response.text();
    throw new GroqRateLimitError(`Groq Rate Limit (${response.status}): ${errText}`, response.status);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const choice = data.choices && data.choices[0];
  const message = choice ? choice.message : {};

  // Extract structured tool calls
  const parsedToolCalls = [];
  if (message.tool_calls && Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      let args = {};
      try {
        args = typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments;
      } catch (parseErr) {
        console.warn(`[GroqAdapter] Failed to parse tool arguments for ${tc.function.name}:`, tc.function.arguments);
      }
      parsedToolCalls.push({
        id: tc.id,
        name: tc.function.name,
        arguments: args
      });
    }
  }

  const usage = {
    inputTokens: data.usage ? data.usage.prompt_tokens : 0,
    outputTokens: data.usage ? data.usage.completion_tokens : 0,
    totalTokens: data.usage ? data.usage.total_tokens : 0
  };

  return {
    content: message.content || '',
    toolCalls: parsedToolCalls,
    usage
  };
}

module.exports = {
  callGroq,
  GroqRateLimitError
};
