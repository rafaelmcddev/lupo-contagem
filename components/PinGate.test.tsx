import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PinGate } from './PinGate';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'store_id=; path=/; max-age=0';
  document.cookie = 'sale_pin_ok=; path=/; max-age=0';
});

describe('PinGate', () => {
  it('shows the PIN form when not unlocked for the current store', async () => {
    document.cookie = 'store_id=1; path=/';
    render(
      <PinGate>
        <p>Conteúdo protegido</p>
      </PinGate>,
    );
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
  });

  it('shows the children directly when already unlocked for the current store', async () => {
    document.cookie = 'store_id=1; path=/';
    document.cookie = 'sale_pin_ok=1; path=/';
    render(
      <PinGate>
        <p>Conteúdo protegido</p>
      </PinGate>,
    );
    await waitFor(() => expect(screen.getByText('Conteúdo protegido')).toBeInTheDocument());
  });

  it('does not unlock when sale_pin_ok belongs to a different store', async () => {
    document.cookie = 'store_id=1; path=/';
    document.cookie = 'sale_pin_ok=2; path=/';
    render(
      <PinGate>
        <p>Conteúdo protegido</p>
      </PinGate>,
    );
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());
  });

  it('unlocks after submitting the correct PIN', async () => {
    document.cookie = 'store_id=1; path=/';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
    render(
      <PinGate>
        <p>Conteúdo protegido</p>
      </PinGate>,
    );
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(screen.getByText('Conteúdo protegido')).toBeInTheDocument());
    expect(document.cookie).toContain('sale_pin_ok=1');
  });

  it('shows an error when the PIN is incorrect', async () => {
    document.cookie = 'store_id=1; path=/';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid_pin' }) }));
    render(
      <PinGate>
        <p>Conteúdo protegido</p>
      </PinGate>,
    );
    await waitFor(() => expect(screen.getByPlaceholderText('PIN')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('PIN'), { target: { value: 'errado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(screen.getByText('PIN incorreto.')).toBeInTheDocument());
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
  });
});
