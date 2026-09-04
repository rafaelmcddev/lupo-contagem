import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { countings } from '@/db/schema';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const countingId = Number(params.id);
  if (!Number.isInteger(countingId)) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }

  const [row] = await db
    .update(countings)
    .set({ status: 'finished', finishedAt: new Date() })
    .where(and(eq(countings.id, countingId), eq(countings.status, 'active')))
    .returning();
  if (row) {
    return NextResponse.json({ counting: row });
  }

  // No row updated: either the counting doesn't exist, or it was already
  // finished (re-call). Distinguish the two rather than blindly overwriting
  // finishedAt on an already-finished counting.
  const existingRows = await db.select().from(countings).where(eq(countings.id, countingId)).limit(1);
  const existing = existingRows[0];
  if (!existing) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }
  return NextResponse.json({ counting: existing });
}
