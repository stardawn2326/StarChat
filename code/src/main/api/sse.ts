export interface ParsedSseBuffer {
  deltas: string[];
  rest: string;
  done: boolean;
}

export function parseSseBuffer(input: string, flush = false): ParsedSseBuffer {
  const normalized = input.replace(/\r\n/g, '\n');
  const chunks = normalized.split('\n\n');
  const completeChunks = flush ? chunks : chunks.slice(0, -1);
  const rest = flush ? '' : (chunks.at(-1) ?? '');
  const deltas: string[] = [];
  let done = false;

  for (const chunk of completeChunks) {
    const data = chunk
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();
    if (!data) {
      continue;
    }
    if (data === '[DONE]') {
      done = true;
      continue;
    }
    try {
      const payload = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: unknown } }>;
      };
      const content = payload.choices?.[0]?.delta?.content;
      if (typeof content === 'string' && content.length > 0) {
        deltas.push(content);
      }
    } catch {
      // 不把服务端原始响应写入日志，避免意外携带敏感信息。
    }
  }

  return { deltas, rest, done };
}
