import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RecompensasPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'store_id=; path=/; max-age=0';
  document.cookie = 'sale_pin_ok=; path=/; max-age=0';
});

function unlock() {
  document.cookie = 'store_id=1; path=/';
  document.cookie = 'sale_pin_ok=1; path=/';
}

describe('RecompensasPage', () => {
  it('shows the PIN form when not unlocked', async () => {
    document.cookie = 'store_id=1; path=/';
    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());
  });

  it('lists sales, requesting 20 per page sorted by most recent by default', async () => {
    unlock();
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        sales: [{ id: 1, saleDate: '2026-09-14', valueCents: 4590, customerId: 1, customerName: 'Ana' }],
        total: 1,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    expect(screen.getByText('R$ 45,90')).toBeInTheDocument();

    const [requestedUrl] = fetchMock.mock.calls[0];
    const params = new URL(requestedUrl, 'http://localhost').searchParams;
    expect(params.get('pageSize')).toBe('20');
    expect(params.get('sort')).toBe('recent');
  });

  it('re-fetches with sort=name when the sort selector is changed', async () => {
    unlock();
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ sales: [], total: 0 }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Nenhuma venda lançada ainda.')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'name' } });

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
      const params = new URL(lastCall[0], 'http://localhost').searchParams;
      expect(params.get('sort')).toBe('name');
    });
  });

  it('searches, selects a customer, and registers a sale with a masked currency value', async () => {
    unlock();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.startsWith('/api/sales?') && method === 'GET') {
        return Promise.resolve({ json: async () => ({ sales: [], total: 0 }) });
      }
      if (url.startsWith('/api/customers?q=Ana')) {
        return Promise.resolve({ json: async () => ({ customers: [{ id: 1, name: 'Ana', phone: '(67) 99999-0000' }], total: 1 }) });
      }
      if (url === '/api/sales' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ sale: { id: 1, saleDate: '2026-09-14', valueCents: 4590, customerId: 1 } }),
        });
      }
      return Promise.resolve({ json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Nenhuma venda lançada ainda.')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Ana' } });
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Ana'));

    fireEvent.change(screen.getByLabelText('Valor da venda'), { target: { value: '4590' } });
    expect(screen.getByLabelText('Valor da venda')).toHaveValue('R$ 45,90');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar venda' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([u, i]: [string, RequestInit?]) => u === '/api/sales' && i?.method === 'POST');
      expect(postCall).toBeDefined();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.customerId).toBe(1);
      expect(body.valueCents).toBe(4590);
      expect(body.saleDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it('removes a sale after confirming', async () => {
    unlock();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ sales: [{ id: 1, saleDate: '2026-09-14', valueCents: 4590, customerId: 1, customerName: 'Ana' }], total: 1 }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ json: async () => ({ sales: [], total: 0 }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/sales/1', { method: 'DELETE' }));
  });
});
