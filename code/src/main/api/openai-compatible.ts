import type { ChatMessage } from '../../shared/ipc';
import type { AppSettings } from '../../shared/settings';
import { parseSseBuffer } from './sse';

export interface StreamChatOptions {
  settings: AppSettings;
  apiKey: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}

function buildChatUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

export async function* streamChatCompletion({
  settings,
  apiKey,
  messages,
  signal
}: StreamChatOptions): AsyncGenerator<string> {
  const response = await fetch(buildChatUrl(settings.apiBaseUrl), {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      stream: true
    })
  });

  if (!response.ok) {
    throw new Error(`API 请求失败（HTTP ${response.status}）`);
  }
  if (!response.body) {
    throw new Error('API 未返回可读取的流');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;

  while (!done) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    buffer += decoder.decode(chunk.value, { stream: true });
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.rest;
    for (const delta of parsed.deltas) {
      yield delta;
    }
    done = parsed.done;
  }

  buffer += decoder.decode();
  const last = parseSseBuffer(buffer, true);
  for (const delta of last.deltas) {
    yield delta;
  }
}
