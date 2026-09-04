import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingsPage', () => {
  it('loads and displays the current prefix length and requireSku', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ prefixLength: 7, requireSku: true }) }));
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByLabelText(/dígitos/)).toHaveValue(7));
    expect(screen.getByLabelText(/Exigir SKU/)).toBeChecked();
  });

  it('saves the new prefix length and requireSku', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ prefixLength: 9, requireSku: true }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<SettingsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/dígitos/), { target: { value: '9' } });
    fireEvent.click(screen.getByLabelText(/Exigir SKU/));
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/settings',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ prefixLength: 9, requireSku: false }) }),
      ),
    );
    expect(screen.getByText('Salvo!')).toBeInTheDocument();
  });
});
