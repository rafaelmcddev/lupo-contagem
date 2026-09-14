export const SALE_PIN_COOKIE_NAME = 'sale_pin_ok';

export function getSalePinEnvVarName(slug: string): string {
  return `SALE_PIN_${slug.toUpperCase().replace(/-/g, '_')}`;
}

export function isSalePinUnlocked(req: Request, storeId: number): boolean {
  const cookieHeader = req.headers.get('cookie') ?? '';
  for (const part of cookieHeader.split(';')) {
    const [key, value] = part.trim().split('=');
    if (key === SALE_PIN_COOKIE_NAME) {
      return Number(value) === storeId;
    }
  }
  return false;
}
