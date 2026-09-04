import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomePage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomePage', () => {
  it('lists open countings fetched from the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ countings: [{ id: 1, name: 'Entrega Lupo 03/09', startedAt: '2026-09-03T10:00:00.000Z' }] }),
      }),
    );

    render(<HomePage />);

    await waitFor(() => expect(screen.getByText('Entrega Lupo 03/09')).toBeInTheDocument());
  });

  it('creates a new counting when the form is submitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ countings: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<HomePage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/Nome da contagem/), { target: { value: 'Nova entrega' } });
    fireEvent.click(screen.getByText('Iniciar contagem'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/countings',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Nova entrega' }) }),
      ),
    );
  });
});
