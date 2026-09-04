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

  it('applies large text classes', () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByText('Salvar')).toHaveClass('text-xl');
  });
});
