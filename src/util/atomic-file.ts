import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function writeAtomic(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.tmp-${crypto.randomBytes(6).toString('hex')}`);

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore cleanup failure */ }
    throw err;
  }
}

export function readJsonFile<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content) as T;
}

export function writeJsonAtomic(filePath: string, data: unknown): void {
  writeAtomic(filePath, JSON.stringify(data, null, 2));
}
