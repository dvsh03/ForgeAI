const { AGENT_TOOLS } = require('./toolsSchema');

/**
 * Formats standard tools to Gemini functionDeclarations format
 */
function convertToGeminiTools(tools) {
  const declarations = tools
    .filter(t => t.type === 'function')
    .map(t => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters
    }));

  return [{ functionDeclarations: declarations }];
}

/**
 * Converts standard chat messages into Gemini contents array
 */
function convertToGeminiContents(messages) {
  const contents = [];
  let systemInstruction = null;

  for (const m of messages) {
    if (m.role === 'system') {
      systemInstruction = {
        parts: [{ text: m.content }]
      };
    } else {
      const role = m.role === 'assistant' ? 'model' : 'user';
      contents.push({
        role,
        parts: [{ text: m.content }]
      });
    }
  }

  // Ensure at least one user content
  if (contents.length === 0) {
    contents.push({
      role: 'user',
      parts: [{ text: 'Execute your heartbeat duties.' }]
    });
  }

  return { contents, systemInstruction };
}

/**
 * Calls Gemini API (gemini-2.5-flash) using Google AI Studio REST API
 *
 * @param {Object} params
 * @param {string} params.apiKey
 * @param {string} [params.model] - Defaults to 'gemini-2.5-flash'
 * @param {Array} params.messages
 * @param {Array} [params.tools]
 * @returns {Promise<{ toolCalls: Array, content: string, usage: Object }>}
 */
async function callGemini({
  apiKey,
  model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  messages,
  tools = AGENT_TOOLS
}) {
  if (!apiKey) {
    throw new Error('Gemini API Key is missing. Please configure it in Vault or environment.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const { contents, systemInstruction } = convertToGeminiContents(messages);
  const geminiTools = convertToGeminiTools(tools);

  const requestBody = {
    contents,
    tools: geminiTools,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1500
    }
  };

  if (systemInstruction) {
    requestBody.systemInstruction = systemInstruction;
  }

  let response;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (response.status === 503 || response.status === 429) {
      if (attempts < maxAttempts) {
        console.warn(`[GeminiAdapter] Received HTTP ${response.status} (High demand/rate limit). Retrying in 2.5s (Attempt ${attempts}/${maxAttempts})...`);
        await new Promise(r => setTimeout(r, 2500));
        continue;
      }
    }
    break;
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const candidate = data.candidates && data.candidates[0];
  const parts = candidate && candidate.content && candidate.content.parts ? candidate.content.parts : [];

  let textContent = '';
  const parsedToolCalls = [];

  for (const part of parts) {
    if (part.text) {
      textContent += part.text;
    }
    if (part.functionCall) {
      parsedToolCalls.push({
        id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: part.functionCall.name,
        arguments: part.functionCall.args || {}
      });
    }
  }

  // Token metadata
  const usageMetadata = data.usageMetadata || {};
  const usage = {
    inputTokens: usageMetadata.promptTokenCount || 0,
    outputTokens: usageMetadata.candidatesTokenCount || 0,
    totalTokens: usageMetadata.totalTokenCount || 0
  };

  return {
    content: textContent,
    toolCalls: parsedToolCalls,
    usage
  };
}

module.exports = {
  callGemini
};
