import { describe, expect, it } from 'vitest';
import { capabilityStateLabel } from './Live2DAdapterEditor';

describe('Live2D adapter editor capability states', () => {
  it('uses explicit textual evidence states instead of color-only or emoji status', () => {
    expect(capabilityStateLabel('detected')).toBe('已检测');
    expect(capabilityStateLabel('verified')).toBe('已验证');
    expect(capabilityStateLabel('failed')).toBe('失败');
    expect(capabilityStateLabel('not_tested')).toBe('未测试');
  });
});
