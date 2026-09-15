import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MasterPasswordGate } from './MasterPasswordGate';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'settings_master_ok=; path=/; max-age=0';
});

describe('MasterPasswordGate', () => {
  it('shows the password form when not unlocked', async () => {
    render(
      <MasterPasswordGate>
        <p>Conteúdo protegido</p>
      </MasterPasswordGate>,
    );
    await waitFor(() => expect(screen.getByPlaceholderText('Senha master')).toBeInTheDocument());
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
  });

  it('shows the children directly when already unlocked', async () => {
    document.cookie = 'settings_master_ok=1; path=/';
    render(
      <MasterPasswordGate>
        <p>Conteúdo protegido</p>
      </MasterPasswordGate>,
    );
    await waitFor(() => expect(screen.getByText('Conteúdo protegido')).toBeInTheDocument());
  });

  it('unlocks after submitting the correct password', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
    render(
      <MasterPasswordGate>
        <p>Conteúdo protegido</p>
      </MasterPasswordGate>,
    );
    await waitFor(() => expect(screen.getByPlaceholderText('Senha master')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Senha master'), { target: { value: 'super-secreto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(screen.getByText('Conteúdo protegido')).toBeInTheDocument());
    expect(document.cookie).toContain('settings_master_ok=1');
  });

  it('shows an error when the password is incorrect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid_password' }) }));
    render(
      <MasterPasswordGate>
        <p>Conteúdo protegido</p>
      </MasterPasswordGate>,
    );
    await waitFor(() => expect(screen.getByPlaceholderText('Senha master')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Senha master'), { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(screen.getByText('Senha incorreta.')).toBeInTheDocument());
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
  });
});
