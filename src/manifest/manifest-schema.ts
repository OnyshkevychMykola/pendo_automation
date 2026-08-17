import { z } from 'zod';
import { containsTemplateMarker, containsControlChars } from '../util/text.js';

const plainText = z
  .string()
  .trim()
  .min(1, 'Must be non-empty')
  .refine((v) => !containsTemplateMarker(v), {
    message: 'Must not contain reserved template markers (__RN_...)',
  })
  .refine((v) => !containsControlChars(v), {
    message: 'Must not contain control characters',
  });

const noMediaSchema = z
  .object({
    type: z.literal('none'),
  })
  .strict();

const imageMediaSchema = z
  .object({
    type: z.literal('image'),
    path: z.string().trim().min(1),
    alt: plainText,
  })
  .strict();

const videoMediaSchema = z
  .object({
    type: z.literal('video'),
    url: z.string().trim().url(),
    title: plainText.optional(),
  })
  .strict();

const mediaSchema = z.discriminatedUnion('type', [noMediaSchema, imageMediaSchema, videoMediaSchema]);

const featureSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .regex(/^[a-z0-9][a-z0-9-_]*$/, 'Feature id must be lowercase alphanumeric with hyphens/underscores'),
    title: plainText,
    description: plainText,
    media: mediaSchema,
  })
  .strict();

const sectionSchema = z
  .object({
    title: plainText,
    description: plainText,
  })
  .strict();

export const releaseManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    releaseId: z
      .string()
      .trim()
      .min(1)
      .regex(/^[a-z0-9][a-z0-9._-]*$/, 'releaseId must be filesystem-safe lowercase'),
    guideName: plainText,
    intro: sectionSchema,
    features: z.array(featureSchema).min(1, 'At least one feature required'),
    outro: sectionSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [i, f] of value.features.entries()) {
      if (seen.has(f.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['features', i, 'id'],
          message: `Duplicate feature id: "${f.id}"`,
        });
      }
      seen.add(f.id);
    }
  });

export type ReleaseManifest = z.output<typeof releaseManifestSchema>;

export type ImageMedia = z.output<typeof imageMediaSchema>;
export type VideoMedia = z.output<typeof videoMediaSchema>;
export type NoMedia = z.output<typeof noMediaSchema>;
export type FeatureMedia = z.output<typeof mediaSchema>;
export type ReleaseFeature = z.output<typeof featureSchema>;
