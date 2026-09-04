import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { groups } from '@/db/schema';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const body = await req.json();
  const name = String(body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'invalid_group' }, { status: 400 });
  }
  const [row] = await db.update(groups).set({ name }).where(eq(groups.id, id)).returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ group: row });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [row] = await db.delete(groups).where(eq(groups.id, id)).returning();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
