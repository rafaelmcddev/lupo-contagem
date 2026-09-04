import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { countings } from '@/db/schema';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const countingId = Number(params.id);
  const [row] = await db
    .update(countings)
    .set({ status: 'finished', finishedAt: new Date() })
    .where(eq(countings.id, countingId))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'counting_not_found' }, { status: 404 });
  }
  return NextResponse.json({ counting: row });
}
