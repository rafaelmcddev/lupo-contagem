import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/tests/resetDb';
import { GET, POST } from './route';

beforeEach(resetDb);

describe('/api/countings', () => {
  it('creates a counting with the current prefix length frozen onto it', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'Entrega Lupo 03/09' }) }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.counting.name).toBe('Entrega Lupo 03/09');
    expect(data.counting.status).toBe('active');
    expect(data.counting.prefixLengthUsed).toBe(7);
  });

  it('rejects creating a counting without a name', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: '' }) }));
    expect(res.status).toBe(400);
  });

  it('lists only active countings when filtered', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'A' }) }));
    const res = await GET(new Request('http://localhost/api/countings?status=active'));
    const data = await res.json();
    expect(data.countings).toHaveLength(1);
  });

  it('lists no finished countings when none have been finished', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'A' }) }));
    const res = await GET(new Request('http://localhost/api/countings?status=finished'));
    const data = await res.json();
    expect(data.countings).toHaveLength(0);
  });
});
