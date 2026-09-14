import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('/api/stores', () => {
  it('lists the seeded stores ordered by name', async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.stores.map((s: { name: string }) => s.name)).toEqual(['Campo Grande-MS', 'Coxim-MS']);
    expect(data.stores[0]).toHaveProperty('id');
    expect(data.stores[0]).toHaveProperty('slug');
  });
});
