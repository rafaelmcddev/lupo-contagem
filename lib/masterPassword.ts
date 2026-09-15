// The master password gates Configurações — deliberately never cached in a
// cookie (unlike the per-store sale PIN), since the same computer is shared
// by the store owner and staff: it must be re-typed on every single visit.
// The client keeps the typed password in memory only and sends it directly
// with the request that needs it (the initial check, and every save).
export function isMasterPasswordCorrect(password: string): boolean {
  const expected = process.env.SETTINGS_MASTER_PASSWORD;
  return Boolean(expected) && password === expected;
}
