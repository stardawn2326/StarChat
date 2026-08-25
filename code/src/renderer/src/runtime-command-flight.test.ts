import { describe, expect, it } from 'vitest';
import { createRuntimeCommandFlight } from './runtime-command-flight';

interface PreviewResult {
  state: 'ok' | 'failed';
  reason?: 'rejected' | 'timeout' | 'error';
}

describe('runtime preview command flight', () => {
  it('contains a rejected request and allows the next preview to settle', async () => {
    const results: Array<{ requestId: string; result: PreviewResult }> = [];
    const flight = createRuntimeCommandFlight<PreviewResult>((requestId, result) => results.push({ requestId, result }), 20);

    flight.run('rejected', () => Promise.reject(new Error('Pixi rejected')), (reason) => ({ state: 'failed', reason }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(results).toEqual([{ requestId: 'rejected', result: { state: 'failed', reason: 'error' } }]);

    flight.run('timeout', () => new Promise<PreviewResult>(() => undefined), (reason) => ({ state: 'failed', reason }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(results.at(-1)).toEqual({ requestId: 'timeout', result: { state: 'failed', reason: 'timeout' } });

    flight.run('next', async () => ({ state: 'ok' }), (reason) => ({ state: 'failed', reason }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(results.at(-1)).toEqual({ requestId: 'next', result: { state: 'ok' } });
  });

  it('cancels a hung request without blocking a newer preview', async () => {
    const results: Array<{ requestId: string; result: PreviewResult }> = [];
    const flight = createRuntimeCommandFlight<PreviewResult>((requestId, result) => results.push({ requestId, result }), 20);

    flight.run('hung', () => new Promise<PreviewResult>(() => undefined), (reason) => ({ state: 'failed', reason }));
    flight.run('next', async () => ({ state: 'ok' }), (reason) => ({ state: 'failed', reason }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(results).toEqual([{ requestId: 'next', result: { state: 'ok' } }]);
  });
});
