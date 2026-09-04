import { NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { groups } from '@/db/schema';

export async function GET() {
  const rows = await db.select().from(groups).orderBy(asc(groups.prefix));
  return NextResponse.json({ groups: rows });
}

export async function POST(req: Request) {
  const body = await req.json();
  const prefix = String(body.prefix ?? '').trim();
  const name = String(body.name ?? '').trim();
  if (!prefix || !name) {
    return NextResponse.json({ error: 'invalid_group' }, { status: 400 });
  }
  try {
    const [row] = await db.insert(groups).values({ prefix, name }).returning();
    return NextResponse.json({ group: row }, { status: 201 });
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: 'prefix_already_registered' }, { status: 409 });
    }
    throw err;
  }
}
