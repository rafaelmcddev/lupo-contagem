import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockUsePathname } from '@/tests/setupMatchers';
import { Nav } from './Nav';

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
});
