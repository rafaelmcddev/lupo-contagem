import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/tests/resetDb';
import { GET, PUT } from './route';

beforeEach(resetDb);

describe('/api/settings', () => {
  it('returns the default prefix length and requireSku when nothing is set', async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.prefixLength).toBe(7);
    expect(data.requireSku).toBe(true);
  });

  it('saves and returns the updated prefix length and requireSku', async () => {
    await PUT(
      new Request('http://localhost/api/settings', { method: 'PUT', body: JSON.stringify({ prefixLength: 9, requireSku: false }) }),
    );
    const res = await GET();
    const data = await res.json();
    expect(data.prefixLength).toBe(9);
    expect(data.requireSku).toBe(false);
  });

  it('rejects an invalid prefix length', async () => {
    const res = await PUT(
      new Request('http://localhost/api/settings', { method: 'PUT', body: JSON.stringify({ prefixLength: 0, requireSku: true }) }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a non-boolean requireSku', async () => {
    const res = await PUT(
      new Request('http://localhost/api/settings', { method: 'PUT', body: JSON.stringify({ prefixLength: 7, requireSku: 'yes' }) }),
    );
    expect(res.status).toBe(400);
  });
});
