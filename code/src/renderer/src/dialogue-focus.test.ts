import { describe, expect, it } from 'vitest';
import { DialogueFocusGate } from './dialogue-focus';

describe('dialogue focus arbitration', () => {
  it('pauses cursor follow while listening/replying and resumes cleanly at end', () => {
    const gate = new DialogueFocusGate();

    expect(gate.transition('start')).toEqual({ active: true, release: true, resume: false });
    expect(gate.shouldIgnoreCursor()).toBe(true);
    expect(gate.transition('replying')).toEqual({ active: true, release: false, resume: false });
    expect(gate.shouldIgnoreCursor()).toBe(true);

    expect(gate.transition('end')).toEqual({ active: false, release: false, resume: true });
    expect(gate.shouldIgnoreCursor()).toBe(false);
  });

  it('treats duplicate and stale end events as idempotent recovery', () => {
    const gate = new DialogueFocusGate();
    gate.transition('start');
    expect(gate.transition('end').resume).toBe(true);
    expect(gate.transition('end')).toEqual({ active: false, release: false, resume: false });
  });

  it('claims focus when a dialogue begins at listening or replying', () => {
    const gate = new DialogueFocusGate();

    expect(gate.transition('listening')).toEqual({ active: true, release: true, resume: false });
    expect(gate.transition('replying')).toEqual({ active: true, release: false, resume: false });
  });
});
