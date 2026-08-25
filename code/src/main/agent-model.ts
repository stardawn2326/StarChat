import type { AgentModelMessage, AgentModelResponse, AgentToolDescriptor } from '../shared/agent';
import type { AppSettings } from '../shared/settings';
import type { AgentModel } from './agent-runtime';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
}

function url(base: string): string { return `${base.replace(/\/+$/, '')}/chat/completions`; }

function toOpenAIMessage(message: AgentModelMessage): OpenAIMessage {
  return {
    role: message.role,
    content: message.content,
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.toolCalls ? { tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: 'function' as const, function: { name: call.name, arguments: call.arguments } })) } : {})
  };
}

function parseResponse(payload: unknown): AgentModelResponse {
  if (!payload || typeof payload !== 'object') throw new Error('Agent 模型响应格式无效');
  const message = (payload as { choices?: Array<{ message?: { content?: unknown; tool_calls?: unknown } }> }).choices?.[0]?.message;
  if (!message) throw new Error('Agent 模型未返回消息');
  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    const calls = message.tool_calls.flatMap((raw): Array<{ id: string; name: string; arguments: string }> => {
      if (!raw || typeof raw !== 'object') return [];
      const call = raw as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
      return typeof call.id === 'string' && typeof call.function?.name === 'string' && typeof call.function.arguments === 'string'
        ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }]
        : [];
    });
    if (calls.length === 0) throw new Error('Agent 工具调用格式无效');
    return { type: 'tool_calls', content: typeof message.content === 'string' ? message.content : undefined, calls };
  }
  return { type: 'final', content: typeof message.content === 'string' ? message.content : '' };
}

export function createOpenAICompatibleAgentModel(settings: AppSettings, apiKey: string): AgentModel {
  return {
    complete: async (messages: AgentModelMessage[], tools: AgentToolDescriptor[], signal: AbortSignal): Promise<AgentModelResponse> => {
      const response = await fetch(url(settings.apiBaseUrl), {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: settings.model,
          messages: messages.map(toOpenAIMessage),
          tools: tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.schema } })),
          tool_choice: 'auto',
          temperature: Math.min(settings.temperature, 0.4),
          max_tokens: Math.min(settings.maxTokens, 1200),
          stream: false
        })
      });
      if (!response.ok) throw new Error(`Agent API 请求失败（HTTP ${response.status}）`);
      return parseResponse(await response.json());
    }
  };
}

export async function classifyAmbiguousWithModel(settings: AppSettings, apiKey: string, message: string, signal?: AbortSignal): Promise<'agent' | 'companion'> {
  const response = await fetch(url(settings.apiBaseUrl), {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: '将用户消息分类为 JSON：{"route":"agent"} 或 {"route":"companion"}。只有明确要求操作文件、项目、测试、构建或修改时才选 agent。不要执行任何工具。' },
        { role: 'user', content: message.slice(0, 4000) }
      ], max_tokens: 16, temperature: 0, stream: false
    })
  });
  if (!response.ok) throw new Error(`分类器请求失败（HTTP ${response.status}）`);
  const payload: unknown = await response.json();
  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('分类器响应无效');
  const match = /"route"\s*:\s*"(agent|companion)"/u.exec(content);
  if (!match) throw new Error('分类器未返回安全分类');
  return match[1] as 'agent' | 'companion';
}
