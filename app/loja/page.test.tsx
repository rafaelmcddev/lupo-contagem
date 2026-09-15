import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LojaPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'store_id=; path=/; max-age=0';
});

describe('LojaPage', () => {
  it('lists the stores returned by the API, with a shortened button label', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          stores: [
            { id: 2, name: 'Loja Up - Jardim dos Estados (Campo Grande-MS)', slug: 'loja-up-jardim-dos-estados-cg' },
            { id: 1, name: 'Loja Up - Coxim-MS', slug: 'loja-up-coxim-ms' },
          ],
        }),
      }),
    );
    render(<LojaPage />);
    await waitFor(() => expect(screen.getByText('Up - Jardim dos Estados (CGR)')).toBeInTheDocument());
    expect(screen.getByText('Up - Coxim')).toBeInTheDocument();
  });

  it('lists Coxim stores before Campo Grande stores, regardless of the API order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          stores: [
            { id: 1, name: 'Loja Caju Brasil - Jardim dos Estados (Campo Grande-MS)', slug: 'loja-caju-brasil-jardim-dos-estados-cg' },
            { id: 2, name: 'Loja Caju Brasil - Coxim-MS', slug: 'loja-caju-brasil-coxim-ms' },
            { id: 3, name: 'Loja Up - Coxim-MS', slug: 'loja-up-coxim-ms' },
          ],
        }),
      }),
    );
    render(<LojaPage />);
    await waitFor(() => expect(screen.getByText('Caju Brasil - Coxim')).toBeInTheDocument());
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['Caju Brasil - Coxim', 'Up - Coxim', 'Caju Brasil - Jardim dos Estados (CGR)']);
  });

  it('sets a persistent (non-session) store_id cookie when a store is chosen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ stores: [{ id: 1, name: 'Loja Up - Coxim-MS', slug: 'loja-up-coxim-ms' }] }),
      }),
    );
    const cookieSetter = vi.spyOn(document, 'cookie', 'set');
    render(<LojaPage />);
    await waitFor(() => expect(screen.getByText('Up - Coxim')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Up - Coxim'));
    expect(cookieSetter).toHaveBeenCalledWith(expect.stringContaining('max-age='));
    expect(cookieSetter).toHaveBeenCalledWith(expect.stringContaining('store_id=1'));
  });
});
