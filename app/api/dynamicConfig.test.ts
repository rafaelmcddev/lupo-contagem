import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function findRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return findRouteFiles(fullPath);
    return entry === 'route.ts' ? [fullPath] : [];
  });
}

describe('API route dynamic config', () => {
  it('every route.ts under app/api forces dynamic rendering, so no route is ever statically cached at build time', () => {
    const routeFiles = findRouteFiles(__dirname);
    expect(routeFiles.length).toBeGreaterThan(0);
    for (const file of routeFiles) {
      const source = readFileSync(file, 'utf-8');
      expect(source, `${file} is missing "export const dynamic = 'force-dynamic'"`).toContain(
        "export const dynamic = 'force-dynamic'",
      );
    }
  });
});
