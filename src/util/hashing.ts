import crypto from 'node:crypto';
import fs from 'node:fs';

export function sha256String(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

export function sha256File(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function sha256Object(obj: unknown): string {
  return sha256String(JSON.stringify(obj, null, 0));
}
