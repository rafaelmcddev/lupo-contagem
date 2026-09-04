export interface GroupEntry {
  prefix: string;
  name: string;
}

export function resolveGroupName(boxPrefix: string, groups: GroupEntry[]): string | null {
  let best: GroupEntry | null = null;
  for (const group of groups) {
    if (boxPrefix.startsWith(group.prefix)) {
      if (!best || group.prefix.length > best.prefix.length) {
        best = group;
      }
    }
  }
  return best?.name ?? null;
}
