const DEFAULT_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
const DEFAULT_MAX_TOKENS = 700;

function asObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeToolCall(call, index = 0) {
  if (!call || typeof call !== 'object') return null;
  if (call.function?.name) {
    return {
      id: String(call.id || `tool-${index}`),
      name: String(call.function.name),
      arguments: asObject(call.function.arguments),
    };
  }
  if (call.name) {
    return {
      id: String(call.id || `tool-${index}`),
      name: String(call.name),
      arguments: asObject(call.arguments),
    };
  }
  return null;
}

function extractText(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw.response === 'string') return raw.response;
  if (typeof raw.result?.response === 'string') return raw.result.response;
  const choice = raw.choices?.[0]?.message;
  if (typeof choice?.content === 'string') return choice.content;
  return '';
}

function extractToolCalls(raw) {
  const calls = raw?.tool_calls || raw?.result?.tool_calls || raw?.choices?.[0]?.message?.tool_calls || [];
  return (Array.isArray(calls) ? calls : [])
    .map(normalizeToolCall)
    .filter(Boolean);
}

export class CloudflareWorkersAIProvider {
  constructor(env, options = {}) {
    this.env = env;
    this.model = String(options.model || env?.AI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    this.maxTokens = Math.max(128, Math.min(2048, Number(options.maxTokens || env?.AI_MAX_OUTPUT_TOKENS || DEFAULT_MAX_TOKENS)));
  }

  async complete({ messages, tools = [], maxTokens = this.maxTokens, temperature = 0.2 } = {}) {
    if (!this.env?.AI || typeof this.env.AI.run !== 'function') {
      const error = new Error('Workers AI no está configurado para Bardo.');
      error.code = 'AI_BINDING_MISSING';
      throw error;
    }
    const input = {
      messages: Array.isArray(messages) ? messages : [],
      max_tokens: Math.max(64, Math.min(2048, Number(maxTokens) || this.maxTokens)),
      temperature: Math.max(0, Math.min(1, Number(temperature) || 0)),
    };
    if (Array.isArray(tools) && tools.length) input.tools = tools;
    const raw = await this.env.AI.run(this.model, input);
    return {
      text: extractText(raw).trim(),
      toolCalls: extractToolCalls(raw),
      usage: raw?.usage || raw?.result?.usage || null,
      model: this.model,
      raw,
    };
  }
}

export const _test = { asObject, normalizeToolCall, extractText, extractToolCalls };
