import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/tests/resetDb';
import { GET, POST } from './route';

beforeEach(resetDb);

describe('/api/groups', () => {
  it('starts empty', async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.groups).toEqual([]);
  });

  it('creates a group', async () => {
    const res = await POST(
      new Request('http://localhost/api/groups', { method: 'POST', body: JSON.stringify({ prefix: '789123', name: 'Cueca Slip Preta' }) }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.group.prefix).toBe('789123');
  });

  it('rejects a duplicate prefix', async () => {
    await POST(new Request('http://localhost/api/groups', { method: 'POST', body: JSON.stringify({ prefix: '789123', name: 'A' }) }));
    const res = await POST(new Request('http://localhost/api/groups', { method: 'POST', body: JSON.stringify({ prefix: '789123', name: 'B' }) }));
    expect(res.status).toBe(409);
  });

  it('rejects an empty name', async () => {
    const res = await POST(new Request('http://localhost/api/groups', { method: 'POST', body: JSON.stringify({ prefix: '1', name: '' }) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 invalid_json when the body is malformed', async () => {
    const res = await POST(new Request('http://localhost/api/groups', { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_json');
  });
});
