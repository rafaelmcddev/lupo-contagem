import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LojaPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'store_id=; path=/; max-age=0';
});

describe('LojaPage', () => {
  it('lists the stores returned by the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          stores: [
            { id: 2, name: 'Campo Grande-MS', slug: 'campo-grande-ms' },
            { id: 1, name: 'Coxim-MS', slug: 'coxim-ms' },
          ],
        }),
      }),
    );
    render(<LojaPage />);
    await waitFor(() => expect(screen.getByText('Campo Grande-MS')).toBeInTheDocument());
    expect(screen.getByText('Coxim-MS')).toBeInTheDocument();
  });

  it('sets the store_id cookie when a store is chosen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ stores: [{ id: 1, name: 'Coxim-MS', slug: 'coxim-ms' }] }),
      }),
    );
    render(<LojaPage />);
    await waitFor(() => expect(screen.getByText('Coxim-MS')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Coxim-MS'));
    expect(document.cookie).toContain('store_id=1');
  });
});
