import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function sqlDirectory(kind: 'migrations' | 'seeds'): string {
  const candidates = [
    resolve(process.cwd(), 'backend', 'db', kind),
    resolve(process.cwd(), 'db', kind),
    resolve('/app', 'backend', 'db', kind)
  ];
  const found = candidates.find(existsSync);
  if (!found) throw new Error(`Cannot find SQL directory for ${kind}`);
  return found;
}

export function readSqlFiles(kind: 'migrations' | 'seeds'): Array<{ name: string; sql: string }> {
  const directory = sqlDirectory(kind);
  return readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(resolve(directory, name), 'utf8') }));
}

