import { describe, it, expect } from 'vitest';
import { generateGuideName, expectedStepCount } from '../../src/manifest/name-generator.js';

describe('generateGuideName', () => {
  it('produces correct format', () => {
    expect(generateGuideName({
      releaseId: '2026-08-arcadia-release',
      guideName: 'August 2026 Product Updates',
    })).toBe('[AUTO][2026-08-arcadia-release] August 2026 Product Updates');
  });
});

describe('expectedStepCount', () => {
  it('returns N + 2', () => {
    expect(expectedStepCount(1)).toBe(3);
    expect(expectedStepCount(2)).toBe(4);
    expect(expectedStepCount(5)).toBe(7);
  });
});
