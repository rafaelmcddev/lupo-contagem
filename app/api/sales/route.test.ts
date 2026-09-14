import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { customers } from '@/db/schema';
import { resetDb } from '@/tests/resetDb';
import { getTestStoreId, storeRequest } from '@/tests/testStores';
import { unlockedRequest } from '@/tests/testSalePin';
import { GET, POST } from './route';

let storeId: number;
let customerId: number;

beforeEach(async () => {
  await resetDb();
  storeId = await getTestStoreId();
  const [customer] = await db.insert(customers).values({ storeId, name: 'Ana', phone: '99999-0000' }).returning();
  customerId = customer.id;
});

function getReq(query = '') {
  return unlockedRequest(`http://localhost/api/sales${query}`, storeId);
}

function postReq(body: unknown) {
  return unlockedRequest('http://localhost/api/sales', storeId, { method: 'POST', body: JSON.stringify(body) });
}

describe('/api/sales', () => {
  it('returns 401 sale_pin_required when the PIN is not unlocked', async () => {
    const res = await GET(storeRequest('http://localhost/api/sales', storeId));
    expect(res.status).toBe(401);
  });

  it('starts empty', async () => {
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.sales).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('creates a sale and includes the customer name when listing', async () => {
    const res = await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 4590 }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.sale).toMatchObject({ customerId, saleDate: '2026-09-14', valueCents: 4590 });

    const listRes = await GET(getReq());
    const listData = await listRes.json();
    expect(listData.sales).toHaveLength(1);
    expect(listData.sales[0].customerName).toBe('Ana');
  });

  it('rejects a customerId that does not exist or belongs to a different store', async () => {
    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const [otherCustomer] = await db.insert(customers).values({ storeId: otherStoreId, name: 'Outra loja', phone: '1' }).returning();

    const res1 = await POST(postReq({ customerId: 999999, saleDate: '2026-09-14', valueCents: 4590 }));
    expect(res1.status).toBe(400);

    const res2 = await POST(postReq({ customerId: otherCustomer.id, saleDate: '2026-09-14', valueCents: 4590 }));
    expect(res2.status).toBe(400);
  });

  it('rejects an invalid or missing saleDate', async () => {
    const res = await POST(postReq({ customerId, saleDate: '14/09/2026', valueCents: 4590 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_date');
  });

  it('rejects a zero or negative valueCents', async () => {
    const res = await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 0 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_value');
  });

  it('only lists sales from the current store', async () => {
    await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 4590 }));
    const res = await GET(getReq());
    expect((await res.json()).sales).toHaveLength(1);

    const otherStoreId = await getTestStoreId('campo-grande-ms');
    const otherRes = await GET(unlockedRequest('http://localhost/api/sales', otherStoreId));
    expect((await otherRes.json()).sales).toHaveLength(0);
  });

  it('paginates results', async () => {
    for (let i = 1; i <= 3; i++) {
      await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 1000 * i }));
    }
    const res = await GET(getReq('?pageSize=2&page=1'));
    const data = await res.json();
    expect(data.sales).toHaveLength(2);
    expect(data.total).toBe(3);
  });

  it('returns 400 invalid_json when the body is malformed', async () => {
    const res = await POST(unlockedRequest('http://localhost/api/sales', storeId, { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });

  it('sorts by most recent sale date by default', async () => {
    await POST(postReq({ customerId, saleDate: '2026-09-10', valueCents: 1000 }));
    await POST(postReq({ customerId, saleDate: '2026-09-14', valueCents: 2000 }));
    const res = await GET(getReq());
    const data = await res.json();
    expect(data.sales.map((s: { saleDate: string }) => s.saleDate)).toEqual(['2026-09-14', '2026-09-10']);
  });

  it('sorts alphabetically by customer name when sort=name', async () => {
    const [customerB] = await db.insert(customers).values({ storeId, name: 'Bia', phone: '2' }).returning();
    await POST(postReq({ customerId, saleDate: '2026-09-10', valueCents: 1000 })); // Ana
    await POST(
      unlockedRequest('http://localhost/api/sales', storeId, {
        method: 'POST',
        body: JSON.stringify({ customerId: customerB.id, saleDate: '2026-09-14', valueCents: 2000 }),
      }),
    ); // Bia

    const res = await GET(getReq('?sort=name'));
    const data = await res.json();
    expect(data.sales.map((s: { customerName: string }) => s.customerName)).toEqual(['Ana', 'Bia']);
  });
});
