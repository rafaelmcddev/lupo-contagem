export const MASTER_PASSWORD_COOKIE_NAME = 'settings_master_ok';

// Global (not per-store) — one password for the whole business, distinct
// from the per-store sale PIN, gating only the Configurações page.
export function isMasterPasswordUnlocked(req: Request): boolean {
  const cookieHeader = req.headers.get('cookie') ?? '';
  for (const part of cookieHeader.split(';')) {
    const [key, value] = part.trim().split('=');
    if (key === MASTER_PASSWORD_COOKIE_NAME) {
      return value === '1';
    }
  }
  return false;
}
