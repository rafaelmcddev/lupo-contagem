import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockUsePathname } from '@/tests/setupMatchers';
import { Nav } from './Nav';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'store_id=; path=/; max-age=0';
});

describe('Nav', () => {
  it('renders a link to every main section', () => {
    render(<Nav />);
    expect(screen.getByRole('link', { name: 'Início' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Histórico' })).toHaveAttribute('href', '/history');
    expect(screen.getByRole('link', { name: 'Produtos' })).toHaveAttribute('href', '/products');
    expect(screen.getByRole('link', { name: 'Grupos' })).toHaveAttribute('href', '/groups');
    expect(screen.getByRole('link', { name: 'Configurações' })).toHaveAttribute('href', '/settings');
  });

  it('marks the current section as active', () => {
    mockUsePathname.mockReturnValue('/products');
    render(<Nav />);
    expect(screen.getByRole('link', { name: 'Produtos' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Início' })).not.toHaveAttribute('aria-current');
  });

  it('marks Início as active only on the exact root path, not on every route', () => {
    mockUsePathname.mockReturnValue('/history');
    render(<Nav />);
    expect(screen.getByRole('link', { name: 'Início' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Histórico' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows a Trocar loja button that clears the store cookie', () => {
    document.cookie = 'store_id=1; path=/';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ stores: [] }),
      }),
    );
    render(<Nav />);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar loja' }));
    expect(document.cookie).not.toContain('store_id=1');
  });

  it('shows the current store name once resolved from the cookie', async () => {
    document.cookie = 'store_id=1; path=/';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ stores: [{ id: 1, name: 'Coxim-MS', slug: 'coxim-ms' }] }),
      }),
    );
    render(<Nav />);
    await waitFor(() => expect(screen.getByText('Coxim-MS')).toBeInTheDocument());
  });

  it('does not render on the /loja store selection page', () => {
    mockUsePathname.mockReturnValue('/loja');
    const { container } = render(<Nav />);
    expect(container).toBeEmptyDOMElement();
  });
});
