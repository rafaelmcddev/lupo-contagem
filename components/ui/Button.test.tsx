import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders its label and responds to clicks', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Iniciar contagem</Button>);
    fireEvent.click(screen.getByText('Iniciar contagem'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('applies large text classes by default', () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByText('Salvar')).toHaveClass('text-xl');
  });

  it('applies compact text classes for size="sm"', () => {
    render(<Button size="sm">Salvar</Button>);
    expect(screen.getByText('Salvar')).toHaveClass('text-base');
  });

  it('renders an icon alongside the label without changing the accessible name', () => {
    render(<Button icon={<span data-testid="icon" />}>Adicionar</Button>);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeInTheDocument();
  });

  it('adds a subtle shadow to the primary variant but not to secondary/danger', () => {
    const { rerender } = render(<Button>Primary</Button>);
    expect(screen.getByText('Primary')).toHaveClass('shadow-sm');

    rerender(<Button variant="secondary">Secondary</Button>);
    expect(screen.getByText('Secondary')).not.toHaveClass('shadow-sm');

    rerender(<Button variant="danger">Danger</Button>);
    expect(screen.getByText('Danger')).not.toHaveClass('shadow-sm');
  });
});
