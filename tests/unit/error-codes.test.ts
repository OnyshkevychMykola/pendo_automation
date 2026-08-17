import { describe, it, expect } from 'vitest';
import { exitCodeFor, ErrorCode } from '../../src/errors/error-codes.js';

describe('exitCodeFor', () => {
  it('maps validation errors to 2', () => {
    expect(exitCodeFor(ErrorCode.MANIFEST_INVALID)).toBe(2);
    expect(exitCodeFor(ErrorCode.ASSET_NOT_FOUND)).toBe(2);
  });

  it('maps auth errors to 3', () => {
    expect(exitCodeFor(ErrorCode.AUTH_REQUIRED)).toBe(3);
  });

  it('maps preflight errors to 4', () => {
    expect(exitCodeFor(ErrorCode.TEMPLATE_NOT_FOUND)).toBe(4);
    expect(exitCodeFor(ErrorCode.TEMPLATE_FINGERPRINT_MISMATCH)).toBe(4);
  });

  it('maps duplicate/journal errors to 5', () => {
    expect(exitCodeFor(ErrorCode.DUPLICATE_GUIDE)).toBe(5);
    expect(exitCodeFor(ErrorCode.RESUME_MANIFEST_HASH_MISMATCH)).toBe(5);
  });

  it('maps lock conflicts to 6', () => {
    expect(exitCodeFor(ErrorCode.RELEASE_LOCK_CONFLICT)).toBe(6);
    expect(exitCodeFor(ErrorCode.PROFILE_LOCK_CONFLICT)).toBe(6);
  });

  it('maps UI execution errors to 7', () => {
    expect(exitCodeFor(ErrorCode.PENDO_CLONE_FAILED)).toBe(7);
    expect(exitCodeFor(ErrorCode.PENDO_IMAGE_UPLOAD_TIMEOUT)).toBe(7);
  });

  it('maps verification failure to 8', () => {
    expect(exitCodeFor(ErrorCode.VERIFICATION_FAILED)).toBe(8);
  });

  it('maps unknown codes to 9', () => {
    expect(exitCodeFor('UNKNOWN_CODE')).toBe(9);
  });
});
