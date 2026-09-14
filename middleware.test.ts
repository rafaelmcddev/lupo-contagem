import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from './middleware';

describe('middleware', () => {
  it('redirects to /loja when there is no store_id cookie', () => {
    const req = new NextRequest('http://localhost/products');
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/loja');
  });

  it('redirects to /loja when store_id is not numeric', () => {
    const req = new NextRequest('http://localhost/products', { headers: { cookie: 'store_id=abc' } });
    const res = middleware(req);
    expect(res.status).toBe(307);
  });

  it('passes through when a numeric store_id cookie is present', () => {
    const req = new NextRequest('http://localhost/products', { headers: { cookie: 'store_id=1' } });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it('does not redirect requests to /loja itself', () => {
    const req = new NextRequest('http://localhost/loja');
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it('does not redirect requests to /api/stores', () => {
    const req = new NextRequest('http://localhost/api/stores');
    const res = middleware(req);
    expect(res.status).toBe(200);
  });
});
