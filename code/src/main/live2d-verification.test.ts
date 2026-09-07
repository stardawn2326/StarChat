import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runLive2DVerification } from './live2d-verification';

describe('external Live2D verification report', () => {
  it('writes a Miku fixture report when the user-provided read-only source exists', () => {
    const entryPath = process.env.STARCHAT_MIKU_MODEL_ENTRY ?? 'D:\\BaiduNetdiskDownload\\miku\\miku\\miku.model3.json';
    if (!existsSync(entryPath)) {
      expect(true).toBe(true);
      return;
    }
    const reportPath = resolve(process.cwd(), '..', 'logs', 'miku-external-model-verification.json');
    const report = runLive2DVerification(entryPath, reportPath);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.not_verified).toBeGreaterThan(0);
    expect(report.visualEvidence.screenshots).toEqual([]);
  });
});
