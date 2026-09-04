import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingsPage', () => {
  it('loads and displays the current prefix length', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ prefixLength: 7 }) }));
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByLabelText(/dígitos/)).toHaveValue(7));
  });

  it('saves the new prefix length', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ prefixLength: 9 }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<SettingsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/dígitos/), { target: { value: '9' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/settings',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ prefixLength: 9 }) }),
      ),
    );
    expect(screen.getByText('Salvo!')).toBeInTheDocument();
  });
});
