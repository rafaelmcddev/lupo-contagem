import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { groups } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { DELETE, PUT } from './route';

beforeEach(resetDb);

async function createGroup() {
  const [row] = await db.insert(groups).values({ prefix: '789123', name: 'Cueca Slip Preta' }).returning();
  return row;
}

describe('/api/groups/:id', () => {
  it('renames a group', async () => {
    const group = await createGroup();
    const res = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ name: 'Novo nome' }) }), {
      params: { id: String(group.id) },
    });
    const data = await res.json();
    expect(data.group.name).toBe('Novo nome');
  });

  it('returns 404 when renaming a group that does not exist', async () => {
    const res = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ name: 'X' }) }), {
      params: { id: '999999' },
    });
    expect(res.status).toBe(404);
  });

  it('deletes a group', async () => {
    const group = await createGroup();
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: String(group.id) } });
    expect(res.status).toBe(200);
  });

  it('returns 404 for a non-integer id on PUT instead of throwing', async () => {
    const res = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ name: 'X' }) }), {
      params: { id: 'abc' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-integer id on DELETE instead of throwing', async () => {
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: 'abc' } });
    expect(res.status).toBe(404);
  });

  it('returns 400 invalid_json when the PUT body is malformed', async () => {
    const group = await createGroup();
    const res = await PUT(new Request('http://localhost', { method: 'PUT', body: '{not json' }), {
      params: { id: String(group.id) },
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_json');
  });
});
