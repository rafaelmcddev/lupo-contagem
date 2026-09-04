import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GroupsPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GroupsPage', () => {
  it('lists registered groups', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ groups: [{ id: 1, prefix: '789123', name: 'Cueca Slip Preta' }] }) }),
    );
    render(<GroupsPage />);
    await waitFor(() => expect(screen.getByText('Cueca Slip Preta')).toBeInTheDocument());
  });

  it('adds a new group', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ groups: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<GroupsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('Prefixo'), { target: { value: '789123' } });
    fireEvent.change(screen.getByPlaceholderText('Nome do grupo'), { target: { value: 'Cueca Slip Preta' } });
    fireEvent.click(screen.getByText('Adicionar'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/groups',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ prefix: '789123', name: 'Cueca Slip Preta' }) }),
      ),
    );
  });

  it('removes a group', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ groups: [{ id: 1, prefix: '789123', name: 'Cueca Slip Preta' }] }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ json: async () => ({ groups: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<GroupsPage />);
    await waitFor(() => expect(screen.getByText('Remover')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Remover'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/groups/1', { method: 'DELETE' }));
  });
});
