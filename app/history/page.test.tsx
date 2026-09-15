import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HistoryPage from './page';

beforeEach(() => {
  document.cookie = 'store_id=1; path=/';
  document.cookie = 'sale_pin_ok=1; path=/';
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'store_id=; path=/; max-age=0';
  document.cookie = 'sale_pin_ok=; path=/; max-age=0';
});

describe('HistoryPage', () => {
  it('lists finished countings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ countings: [{ id: 1, name: 'Entrega Lupo 03/09', finishedAt: '2026-09-03T12:00:00.000Z' }] }),
      }),
    );
    render(<HistoryPage />);
    await waitFor(() => expect(screen.getByText('Entrega Lupo 03/09')).toBeInTheDocument());
  });

  it('shows a message when there is no history yet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ countings: [] }) }));
    render(<HistoryPage />);
    await waitFor(() => expect(screen.getByText(/Nenhuma contagem finalizada/)).toBeInTheDocument());
  });

  it('deletes a counting after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ countings: [{ id: 1, name: 'Entrega Lupo', finishedAt: '2026-09-03T12:00:00.000Z' }] }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ json: async () => ({ countings: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<HistoryPage />);
    await waitFor(() => expect(screen.getByText('Entrega Lupo')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Excluir contagem Entrega Lupo'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/countings/1', { method: 'DELETE' }));
  });
});
