import { describe, it, expect } from 'vitest';
import { releaseManifestSchema } from '../../src/manifest/manifest-schema.js';

const validManifest = {
  schemaVersion: 1 as const,
  releaseId: '2026-08-test-release',
  guideName: 'Test Guide',
  intro: { title: 'Intro title', description: 'Intro description' },
  features: [
    {
      id: 'feature-1',
      title: 'Feature one',
      description: 'Feature one description',
      media: { type: 'none' as const },
    },
  ],
  outro: { title: 'Outro title', description: 'Outro description' },
};

describe('releaseManifestSchema', () => {
  it('accepts a valid manifest', () => {
    const result = releaseManifestSchema.safeParse(validManifest);
    expect(result.success).toBe(true);
  });

  it('rejects missing schemaVersion', () => {
    const { schemaVersion: _, ...bad } = validManifest;
    expect(releaseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty features array', () => {
    const bad = { ...validManifest, features: [] };
    expect(releaseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects duplicate feature ids', () => {
    const bad = {
      ...validManifest,
      features: [
        { id: 'dup', title: 'A', description: 'A', media: { type: 'none' as const } },
        { id: 'dup', title: 'B', description: 'B', media: { type: 'none' as const } },
      ],
    };
    const result = releaseManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects template markers in content', () => {
    const bad = {
      ...validManifest,
      intro: { title: '__RN_INTRO_TITLE__', description: 'ok' },
    };
    expect(releaseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown fields (strict mode)', () => {
    const bad = { ...validManifest, extraField: 'oops' };
    expect(releaseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unsafe releaseId', () => {
    const bad = { ...validManifest, releaseId: 'has space' };
    expect(releaseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts image media with path and alt', () => {
    const manifest = {
      ...validManifest,
      features: [
        {
          id: 'img-feature',
          title: 'Image feature',
          description: 'Has image',
          media: { type: 'image' as const, path: './assets/img.png', alt: 'Alt text' },
        },
      ],
    };
    expect(releaseManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('rejects image media without alt', () => {
    const bad = {
      ...validManifest,
      features: [
        {
          id: 'img-feature',
          title: 'Image feature',
          description: 'Has image',
          media: { type: 'image', path: './img.png' }, // missing alt
        },
      ],
    };
    expect(releaseManifestSchema.safeParse(bad).success).toBe(false);
  });
});
