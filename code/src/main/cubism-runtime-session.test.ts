import { describe, expect, it } from 'vitest';
import { CubismRuntimeSession } from './cubism-runtime-session';

describe('Cubism runtime session identity', () => {
  it('accepts ready only for the current model and invalidates a previous model on switch', () => {
    const session = new CubismRuntimeSession();
    session.setCurrentModel('C:/models/old.model3.json');
    expect(session.markReady('C:/models/old.model3.json')).toBe(true);
    expect(session.isReady('C:/models/old.model3.json')).toBe(true);

    session.setCurrentModel('C:/models/new.model3.json');
    expect(session.isReady('C:/models/old.model3.json')).toBe(false);
    expect(session.isReady('C:/models/new.model3.json')).toBe(false);
    expect(session.markReady('C:/models/old.model3.json')).toBe(false);
    expect(session.markReady('C:/models/new.model3.json')).toBe(true);
    expect(session.isReady('C:/models/new.model3.json')).toBe(true);
  });

  it('does not report ready when the model identity is missing or failed', () => {
    const session = new CubismRuntimeSession();
    session.setCurrentModel('C:/models/baoyin.model3.json');
    expect(session.markReady(null)).toBe(false);
    expect(session.markReady('C:/models/other.model3.json')).toBe(false);
    expect(session.markReady('C:/models/baoyin.model3.json')).toBe(true);
    session.markFailed('C:/models/baoyin.model3.json');
    expect(session.isReady('C:/models/baoyin.model3.json')).toBe(false);
  });
});
