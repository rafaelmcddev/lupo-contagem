import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HistoryPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
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
});
