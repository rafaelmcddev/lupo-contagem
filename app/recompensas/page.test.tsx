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
  it('shows the PIN form when not unlocked, without ever calling fetch', async () => {
    document.cookie = 'store_id=1; path=/';
    // The sales-list content (and its load() effect) now only mounts once
    // PinGate actually unlocks — a regression guard for the bug where
    // load() fired on every mount regardless of lock state.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads the sales list immediately after successfully entering the PIN, with no reload needed', async () => {
    document.cookie = 'store_id=1; path=/';
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/sale-pin/verify') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      }
      return Promise.resolve({
        json: async () => ({
          sales: [{ id: 1, saleDate: '2026-09-14', valueCents: 4590, customerId: 1, customerName: 'Ana' }],
          total: 1,
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
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
      .mockResolvedValueOnce({ json: async () => ({ pending: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ json: async () => ({ sales: [], total: 0 }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/sales/1', { method: 'DELETE' }));
  });

  it('shows an error and keeps the row when removing a sale fails', async () => {
    unlock();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ sales: [{ id: 1, saleDate: '2026-09-14', valueCents: 4590, customerId: 1, customerName: 'Ana' }], total: 1 }),
      })
      .mockResolvedValueOnce({ json: async () => ({ pending: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'server_error' }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(screen.getByText('Não foi possível remover essa venda.')).toBeInTheDocument());
    expect(screen.getByText('Ana')).toBeInTheDocument();
  });

  it('shows the calculated reward live as the sale value is typed', async () => {
    unlock();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ sales: [], total: 0, pending: [] }) }));
    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Nenhuma venda lançada ainda.')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Valor da venda'), { target: { value: '10000' } });
    expect(screen.getByText('R$ 5,00')).toBeInTheDocument(); // 5% of R$100,00
  });

  it('shows a reward column in the sales table', async () => {
    unlock();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ sales: [{ id: 1, saleDate: '2026-09-14', valueCents: 10000, customerId: 1, customerName: 'Ana', cashbackUsed: false }], total: 1, pending: [] }),
    }));
    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    expect(screen.getByText('R$ 5,00')).toBeInTheDocument();
  });

  it('toggles cashback used for a sale', async () => {
    unlock();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.startsWith('/api/sales?')) {
        return Promise.resolve({ json: async () => ({ sales: [{ id: 1, saleDate: '2026-09-14', valueCents: 10000, customerId: 1, customerName: 'Ana', cashbackUsed: false }], total: 1 }) });
      }
      if (url === '/api/whatsapp/pending') {
        return Promise.resolve({ json: async () => ({ pending: [] }) });
      }
      if (url === '/api/sales/1' && method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({ sale: { id: 1, cashbackUsed: true } }) });
      }
      return Promise.resolve({ json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como usado' }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(([u, i]: [string, RequestInit?]) => u === '/api/sales/1' && i?.method === 'PUT');
      expect(putCall).toBeDefined();
      expect(JSON.parse((putCall![1] as RequestInit).body as string)).toEqual({ cashbackUsed: true });
    });
  });

  it('shows a pending-messages banner and processes one at a time', async () => {
    unlock();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.startsWith('/api/sales?')) {
        return Promise.resolve({ json: async () => ({ sales: [], total: 0 }) });
      }
      if (url === '/api/whatsapp/pending') {
        return Promise.resolve({
          json: async () => ({ pending: [{ saleId: 1, type: 'purchase', customerName: 'Ana', whatsappUrl: 'https://web.whatsapp.com/send?phone=1&text=x' }] }),
        });
      }
      if (url === '/api/whatsapp/pending/purchase/1/mark-opened' && method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      }
      return Promise.resolve({ json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText(/1 mensagem pendente/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Processar próxima' }));

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://web.whatsapp.com/send?phone=1&text=x', '_blank'));
    await waitFor(() => {
      const markCall = fetchMock.mock.calls.find(([u]: [string]) => u === '/api/whatsapp/pending/purchase/1/mark-opened');
      expect(markCall).toBeDefined();
    });
  });

  it('does not show the pending banner when there is nothing pending', async () => {
    unlock();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ sales: [], total: 0, pending: [] }) }));
    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Nenhuma venda lançada ainda.')).toBeInTheDocument());
    expect(screen.queryByText(/mensagem pendente/)).not.toBeInTheDocument();
  });

  it('sends a manual reminder and opens WhatsApp Web', async () => {
    unlock();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.startsWith('/api/sales?')) {
        return Promise.resolve({ json: async () => ({ sales: [{ id: 1, saleDate: '2026-09-14', valueCents: 10000, customerId: 1, customerName: 'Ana', cashbackUsed: false }], total: 1 }) });
      }
      if (url === '/api/whatsapp/pending') {
        return Promise.resolve({ json: async () => ({ pending: [] }) });
      }
      if (url === '/api/sales/1/send-reminder' && method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ whatsappUrl: 'https://web.whatsapp.com/send?phone=1&text=lembrete' }) });
      }
      return Promise.resolve({ json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Enviar lembrete' }));

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://web.whatsapp.com/send?phone=1&text=lembrete', '_blank'));
  });

  it('refreshes the pending-messages count after a manual reminder is sent, so a resolved item stops showing', async () => {
    unlock();
    vi.spyOn(window, 'open').mockImplementation(() => null);
    let pendingCallCount = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.startsWith('/api/sales?')) {
        return Promise.resolve({ json: async () => ({ sales: [{ id: 1, saleDate: '2026-09-14', valueCents: 10000, customerId: 1, customerName: 'Ana', cashbackUsed: false }], total: 1 }) });
      }
      if (url === '/api/whatsapp/pending') {
        pendingCallCount += 1;
        // Pending on the first load (mount); resolved by the time the page
        // asks again after the manual send.
        const pending = pendingCallCount === 1 ? [{ saleId: 1, type: 'reminder', customerName: 'Ana', whatsappUrl: 'https://web.whatsapp.com/send?phone=1&text=x' }] : [];
        return Promise.resolve({ json: async () => ({ pending }) });
      }
      if (url === '/api/sales/1/send-reminder' && method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ whatsappUrl: 'https://web.whatsapp.com/send?phone=1&text=lembrete' }) });
      }
      return Promise.resolve({ json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RecompensasPage />);
    await waitFor(() => expect(screen.getByText(/1 mensagem pendente/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Enviar lembrete' }));

    await waitFor(() => expect(screen.queryByText(/mensagem pendente/)).not.toBeInTheDocument());
    expect(pendingCallCount).toBeGreaterThanOrEqual(2);
  });
});
