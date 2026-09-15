import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RelatorioPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'store_id=; path=/; max-age=0';
  document.cookie = 'sale_pin_ok=; path=/; max-age=0';
});

function unlock() {
  document.cookie = 'store_id=1; path=/';
  document.cookie = 'sale_pin_ok=1; path=/';
}

describe('RelatorioPage', () => {
  it('shows the PIN form when not unlocked, without ever calling fetch', async () => {
    document.cookie = 'store_id=1; path=/';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<RelatorioPage />);
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists the expiring rewards, formatted', async () => {
    unlock();
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith('/api/rewards/expiring')) {
        return Promise.resolve({
          json: async () => ({
            items: [
              {
                id: 1,
                saleDate: '2026-09-14',
                customerName: 'Ana',
                valueCents: 10000,
                rewardCents: 500,
                cashbackUsed: false,
                expiresAt: '2026-10-14',
                minPurchaseCents: 2500,
              },
            ],
            total: 1,
            totalValueCents: 10000,
            totalRewardCents: 500,
          }),
        });
      }
      if (url === '/api/rewards/cleanup-log') {
        return Promise.resolve({ json: async () => ({ log: [] }) });
      }
      if (url === '/api/rewards/cleanup-expired-count') {
        return Promise.resolve({ json: async () => ({ count: 0 }) });
      }
      return Promise.resolve({ json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RelatorioPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    expect(screen.getByText('R$ 100,00')).toBeInTheDocument();
    expect(screen.getAllByText('R$ 5,00').length).toBeGreaterThan(0); // shows in the row and the totalizer
    expect(screen.getByText('14/09/2026')).toBeInTheDocument();
    expect(screen.getByText('14/10/2026')).toBeInTheDocument();
    expect(screen.getByText(/mín\. compra R\$ 25,00/)).toBeInTheDocument();
  });

  it('shows a totalizer across the full filtered result, not just the current page', async () => {
    unlock();
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith('/api/rewards/expiring')) {
        return Promise.resolve({
          json: async () => ({
            items: [{ id: 1, saleDate: '2026-09-14', customerName: 'Ana', valueCents: 10000, rewardCents: 500, cashbackUsed: false, expiresAt: '2026-10-14' }],
            total: 3,
            totalValueCents: 30000,
            totalRewardCents: 1500,
          }),
        });
      }
      return Promise.resolve({ json: async () => ({ log: [], count: 0 }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RelatorioPage />);
    await waitFor(() => expect(screen.getByText(/Total do período/)).toBeInTheDocument());
    expect(screen.getByText(/3 venda\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/R\$ 300,00 em valor/)).toBeInTheDocument();
    expect(screen.getByText('R$ 15,00')).toBeInTheDocument();
  });

  it('re-fetches with cashbackUsed=true when that filter is selected', async () => {
    unlock();
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ items: [], total: 0, log: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<RelatorioPage />);
    await waitFor(() => expect(screen.getByText('Nenhuma recompensa a vencer nesse período.')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Cashback já utilizado?'), { target: { value: 'true' } });

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.filter(([u]: [string]) => u.startsWith('/api/rewards/expiring')).pop();
      const params = new URL(lastCall[0], 'http://localhost').searchParams;
      expect(params.get('cashbackUsed')).toBe('true');
    });
  });

  it('runs the cleanup after confirming, showing the real count, and reloads the list, log, and count', async () => {
    unlock();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url === '/api/rewards/cleanup-expired' && method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ rowsDeleted: 3 }) });
      }
      if (url === '/api/rewards/cleanup-expired-count') {
        return Promise.resolve({ json: async () => ({ count: 3 }) });
      }
      return Promise.resolve({ json: async () => ({ items: [], total: 0, log: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RelatorioPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /limpar vendas/i })).toBeInTheDocument());
    await waitFor(() => {
      const countCall = fetchMock.mock.calls.find(([u]: [string]) => u === '/api/rewards/cleanup-expired-count');
      expect(countCall).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: /limpar vendas/i }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('3 venda'));

    await waitFor(() => {
      const cleanupCall = fetchMock.mock.calls.find(([u, i]: [string, RequestInit?]) => u === '/api/rewards/cleanup-expired' && i?.method === 'POST');
      expect(cleanupCall).toBeDefined();
    });
    await waitFor(() => {
      const countCalls = fetchMock.mock.calls.filter(([u]: [string]) => u === '/api/rewards/cleanup-expired-count');
      expect(countCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('does not run the cleanup if the confirmation is declined', async () => {
    unlock();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/rewards/cleanup-expired-count') {
        return Promise.resolve({ json: async () => ({ count: 0 }) });
      }
      return Promise.resolve({ json: async () => ({ items: [], total: 0, log: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RelatorioPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /limpar vendas/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /limpar vendas/i }));

    await waitFor(() => {
      const cleanupCall = fetchMock.mock.calls.find(([u, i]: [string, RequestInit?]) => u === '/api/rewards/cleanup-expired' && i?.method === 'POST');
      expect(cleanupCall).toBeUndefined();
    });
  });

  it('shows the cleanup history', async () => {
    unlock();
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/rewards/cleanup-log') {
        return Promise.resolve({ json: async () => ({ log: [{ id: 1, ranAt: '2026-09-01T12:00:00.000Z', rowsDeleted: 4 }] }) });
      }
      if (url === '/api/rewards/cleanup-expired-count') {
        return Promise.resolve({ json: async () => ({ count: 0 }) });
      }
      return Promise.resolve({ json: async () => ({ items: [], total: 0 }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RelatorioPage />);
    await waitFor(() => expect(screen.getByText(/4/)).toBeInTheDocument());
  });
});
