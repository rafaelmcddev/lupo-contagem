import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { countings } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { POST } from './route';

beforeEach(resetDb);

describe('/api/countings/:id/finish', () => {
  it('marks the counting as finished', async () => {
    const [counting] = await db.insert(countings).values({ name: 'Teste', prefixLengthUsed: 7, status: 'active' }).returning();
    const res = await POST(new Request('http://localhost', { method: 'POST' }), { params: { id: String(counting.id) } });
    const data = await res.json();
    expect(data.counting.status).toBe('finished');
    expect(data.counting.finishedAt).not.toBeNull();
  });

  it('allows finishing a counting with zero scans', async () => {
    const [counting] = await db.insert(countings).values({ name: 'Vazia', prefixLengthUsed: 7, status: 'active' }).returning();
    const res = await POST(new Request('http://localhost', { method: 'POST' }), { params: { id: String(counting.id) } });
    expect(res.status).toBe(200);
  });

  it('returns 404 for a counting that does not exist', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST' }), { params: { id: '999999' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-integer id instead of throwing', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST' }), { params: { id: 'abc' } });
    expect(res.status).toBe(404);
  });

  it('does not overwrite finishedAt when finish is called again on an already-finished counting', async () => {
    const [counting] = await db.insert(countings).values({ name: 'Teste', prefixLengthUsed: 7, status: 'active' }).returning();
    const first = await POST(new Request('http://localhost', { method: 'POST' }), { params: { id: String(counting.id) } });
    const firstData = await first.json();

    const second = await POST(new Request('http://localhost', { method: 'POST' }), { params: { id: String(counting.id) } });
    expect(second.status).toBe(200);
    const secondData = await second.json();

    expect(secondData.counting.status).toBe('finished');
    expect(secondData.counting.finishedAt).toBe(firstData.counting.finishedAt);
  });
});
