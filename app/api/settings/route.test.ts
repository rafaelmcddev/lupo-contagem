import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/tests/resetDb';
import { GET, PUT } from './route';

beforeEach(resetDb);

describe('/api/settings', () => {
  it('returns the default prefix length when nothing is set', async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.prefixLength).toBe(7);
  });

  it('saves and returns the updated prefix length', async () => {
    await PUT(new Request('http://localhost/api/settings', { method: 'PUT', body: JSON.stringify({ prefixLength: 9 }) }));
    const res = await GET();
    const data = await res.json();
    expect(data.prefixLength).toBe(9);
  });

  it('rejects an invalid prefix length', async () => {
    const res = await PUT(new Request('http://localhost/api/settings', { method: 'PUT', body: JSON.stringify({ prefixLength: 0 }) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 invalid_json when the body is malformed', async () => {
    const res = await PUT(new Request('http://localhost/api/settings', { method: 'PUT', body: '{not json' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_json');
  });
});
