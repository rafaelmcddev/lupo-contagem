import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'settings_master_ok=; path=/; max-age=0';
});

function unlock() {
  document.cookie = 'settings_master_ok=1; path=/';
}

const settingsResponse = {
  prefixLength: 7,
  requireSku: true,
  cashbackPercent: 5,
  cashbackExpiryDays: 30,
  cashbackMaxUsagePercent: 20,
  whatsappMessageTemplate: 'Oi %nome%, de %loja%!',
};

describe('SettingsPage', () => {
  it('shows the master password form when not unlocked, without ever calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Senha master')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads and displays the current settings, including the cashback fields', async () => {
    unlock();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => settingsResponse }));
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByLabelText(/dígitos/)).toHaveValue(7));
    expect(screen.getByLabelText(/Exigir SKU/)).toBeChecked();
    expect(screen.getByLabelText(/Percentual de cashback/)).toHaveValue(5);
    expect(screen.getByLabelText(/Prazo de validade/)).toHaveValue(30);
    expect(screen.getByLabelText(/Cashback cobre no máximo/)).toHaveValue(20);
    expect(screen.getByLabelText(/Mensagem enviada pelo WhatsApp/)).toHaveValue('Oi %nome%, de %loja%!');
  });

  it('saves the updated settings, including the cashback fields', async () => {
    unlock();
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => settingsResponse });
    vi.stubGlobal('fetch', fetchMock);

    render(<SettingsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/dígitos/), { target: { value: '9' } });
    fireEvent.click(screen.getByLabelText(/Exigir SKU/));
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
            prefixLength: 9,
            requireSku: false,
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
