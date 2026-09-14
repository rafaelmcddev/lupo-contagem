import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/loja', '/api/stores'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const storeId = req.cookies.get('store_id')?.value;
  if (!storeId || !/^\d+$/.test(storeId)) {
    const url = req.nextUrl.clone();
    url.pathname = '/loja';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
