export const TEMPLATE_MARKER_PREFIX = '__RN_';

export const MARKERS = {
  INTRO_TITLE: '__RN_INTRO_TITLE__',
  INTRO_DESCRIPTION: '__RN_INTRO_DESCRIPTION__',
  FEATURE_TITLE: '__RN_FEATURE_TITLE__',
  FEATURE_DESCRIPTION: '__RN_FEATURE_DESCRIPTION__',
  FEATURE_IMAGE: '__RN_FEATURE_IMAGE__',
  OUTRO_TITLE: '__RN_OUTRO_TITLE__',
  OUTRO_DESCRIPTION: '__RN_OUTRO_DESCRIPTION__',
} as const;

export type MarkerKey = keyof typeof MARKERS;
export type MarkerValue = (typeof MARKERS)[MarkerKey];

/** Normalize line endings to LF for comparison */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function containsTemplateMarker(text: string): boolean {
  return text.includes(TEMPLATE_MARKER_PREFIX);
}

export function containsControlChars(text: string): boolean {
  // Allow \n, \r, \t but reject other control characters
  return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text);
}

export function textMatches(actual: string, expected: string): boolean {
  return normalizeLineEndings(actual.trim()) === normalizeLineEndings(expected.trim());
}
