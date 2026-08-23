import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { streamChatCompletion } from './openai-compatible';
import { parseSseBuffer } from './sse';
import { DEFAULT_APP_SETTINGS } from '../../shared/settings';

describe('OpenAI-compatible SSE parser', () => {
  it('parses complete events and keeps an incomplete event for the next chunk', () => {
    const first = parseSseBuffer(
      'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"，白"}}]}'
    );
    expect(first.deltas).toEqual(['你好']);
    expect(first.rest).toContain('白');

    const second = parseSseBuffer(`${first.rest}\n\ndata: [DONE]\n\n`, true);
    expect(second.deltas).toEqual(['，白']);
    expect(second.done).toBe(true);
  });

  it('streams deltas through the OpenAI-compatible adapter', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(
        'data: {"choices":[{"delta":{"content":"流式"}}]}\n\n' +
          'data: {"choices":[{"delta":{"content":"回复"}}]}\n\n' +
          'data: [DONE]\n\n'
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const deltas: string[] = [];
    try {
      for await (const delta of streamChatCompletion({
        settings: {
          ...DEFAULT_APP_SETTINGS,
          apiBaseUrl: `http://127.0.0.1:${address.port}/v1`,
          model: 'test-model',
          temperature: 0.5,
          maxTokens: 64
        },
        apiKey: 'test-key',
        messages: [{ role: 'user', content: '测试' }]
      })) {
        deltas.push(delta);
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    expect(deltas).toEqual(['流式', '回复']);
  });
});
