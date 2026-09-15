import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
});

const MASTER_PASSWORD = 'super-secreto';

const settingsResponse = {
  prefixLength: 7,
  requireSku: true,
  cashbackPercent: 5,
  cashbackExpiryDays: 30,
  cashbackMaxUsagePercent: 20,
  whatsappMessageTemplate: 'Oi %nome%, de %loja%!',
};

// Types the master password into the real form and submits it — there is no
// cached-unlock shortcut to skip this with (that's the point: it's always
// asked). Returns the fetchMock so callers can assert on later calls too.
async function unlockThroughForm(extraRouting: (url: string, init?: RequestInit) => any = () => undefined) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/master-password/verify') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    }
    return Promise.resolve(extraRouting(url, init) ?? { json: async () => settingsResponse });
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByPlaceholderText('Senha master')).toBeInTheDocument());
  fireEvent.change(screen.getByPlaceholderText('Senha master'), { target: { value: MASTER_PASSWORD } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

  return fetchMock;
}

describe('SettingsPage', () => {
  it('shows the master password form when not unlocked, without ever calling /api/settings', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Senha master')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads and displays the current cashback settings after unlocking, with no grouping fields', async () => {
    await unlockThroughForm();
    await waitFor(() => expect(screen.getByLabelText(/Percentual de cashback/)).toHaveValue(5));
    expect(screen.getByLabelText(/Prazo de validade/)).toHaveValue(30);
    expect(screen.getByLabelText(/Cashback cobre no máximo/)).toHaveValue(20);
    expect(screen.getByLabelText(/Mensagem enviada pelo WhatsApp/)).toHaveValue('Oi %nome%, de %loja%!');
    expect(screen.queryByLabelText(/dígitos/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Exigir SKU/)).not.toBeInTheDocument();
  });

  it('saves the updated cashback settings, resending the typed master password with the save', async () => {
    const fetchMock = await unlockThroughForm();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/settings'));

    fireEvent.change(screen.getByLabelText(/Percentual de cashback/), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/Prazo de validade/), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText(/Cashback cobre no máximo/), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText(/Mensagem enviada pelo WhatsApp/), { target: { value: 'Novo texto %nome%' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/settings',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            masterPassword: MASTER_PASSWORD,
            prefixLength: 7,
            requireSku: true,
            cashbackPercent: 10,
            cashbackExpiryDays: 45,
            cashbackMaxUsagePercent: 25,
            whatsappMessageTemplate: 'Novo texto %nome%',
          }),
        }),
      ),
    );
    expect(screen.getByText('Salvo!')).toBeInTheDocument();
  });
});
