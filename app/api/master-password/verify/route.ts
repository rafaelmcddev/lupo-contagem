import { NextResponse } from 'next/server';
import { isMasterPasswordCorrect } from '@/lib/masterPassword';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const password = String(body.password ?? '');

  if (!isMasterPasswordCorrect(password)) {
    return NextResponse.json({ error: 'invalid_password' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
