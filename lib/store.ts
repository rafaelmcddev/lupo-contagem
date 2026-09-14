export const STORE_COOKIE_NAME = 'store_id';

export class StoreNotSelectedError extends Error {}

export function getStoreIdFromRequest(req: Request): number {
  const cookieHeader = req.headers.get('cookie') ?? '';
  for (const part of cookieHeader.split(';')) {
    const [key, value] = part.trim().split('=');
    if (key === STORE_COOKIE_NAME) {
      const id = Number(value);
      if (Number.isInteger(id)) return id;
      break;
    }
  }
  throw new StoreNotSelectedError();
}
