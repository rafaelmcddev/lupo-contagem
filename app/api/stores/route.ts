import { NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { stores } from '@/db/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await db.select().from(stores).orderBy(asc(stores.name));
  return NextResponse.json({ stores: rows });
}
