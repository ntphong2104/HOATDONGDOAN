import fs from 'fs';
import path from 'path';

/**
 * Atomically writes JSON to disk via a process-unique temporary file + POSIX rename,
 * preventing interleaved/corrupted JSON when multiple PM2 cluster workers write concurrently.
 */
export async function writeJsonFileAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  try {
    const json = JSON.stringify(data, null, 2);
    await fs.promises.writeFile(tmpPath, json, 'utf8');
    await fs.promises.rename(tmpPath, filePath);
  } catch (err) {
    await fs.promises.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

export function writeJsonFileAtomicSync(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  try {
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(tmpPath, json, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
}

/**
 * Self-heals a JSON string that was previously corrupted with trailing bytes
 * from concurrent non-atomic writes (e.g. "Unexpected non-whitespace character after JSON").
 */
export function parseJsonWithRepair<T = any>(raw: string): { value: T; repaired: boolean } | null {
  try {
    return { value: JSON.parse(raw) as T, repaired: false };
  } catch {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const openChar = trimmed[0];
    const closeChar = openChar === '{' ? '}' : openChar === '[' ? ']' : '';
    if (!closeChar) return null;

    // Walk backwards from the end trying closing brackets until valid JSON is recovered
    let searchEnd = trimmed.length;
    for (let attempts = 0; attempts < 12 && searchEnd > 1; attempts++) {
      const idx = trimmed.lastIndexOf(closeChar, searchEnd - 1);
      if (idx <= 0) break;
      try {
        const candidate = trimmed.slice(0, idx + 1);
        const parsed = JSON.parse(candidate) as T;
        return { value: parsed, repaired: true };
      } catch {
        searchEnd = idx;
      }
    }
    return null;
  }
}
