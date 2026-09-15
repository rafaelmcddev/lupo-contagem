import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MasterPasswordGate } from './MasterPasswordGate';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MasterPasswordGate', () => {
  it('always shows the password form on mount — there is no cached unlock', async () => {
    render(<MasterPasswordGate>{(password) => <p>Conteúdo protegido ({password})</p>}</MasterPasswordGate>);
    await waitFor(() => expect(screen.getByPlaceholderText('Senha master')).toBeInTheDocument());
    expect(screen.queryByText(/Conteúdo protegido/)).not.toBeInTheDocument();
  });

  it('unlocks after submitting the correct password, and hands it to children — nothing is cached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
    render(<MasterPasswordGate>{(password) => <p>Conteúdo protegido ({password})</p>}</MasterPasswordGate>);
    await waitFor(() => expect(screen.getByPlaceholderText('Senha master')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Senha master'), { target: { value: 'super-secreto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(screen.getByText('Conteúdo protegido (super-secreto)')).toBeInTheDocument());
    expect(document.cookie).not.toContain('settings_master_ok');
  });

  it('shows an error when the password is incorrect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid_password' }) }));
    render(<MasterPasswordGate>{(password) => <p>Conteúdo protegido ({password})</p>}</MasterPasswordGate>);
    await waitFor(() => expect(screen.getByPlaceholderText('Senha master')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Senha master'), { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(screen.getByText('Senha incorreta.')).toBeInTheDocument());
    expect(screen.queryByText(/Conteúdo protegido/)).not.toBeInTheDocument();
  });
});
