import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomePage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomePage', () => {
  it('lists open countings fetched from the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ countings: [{ id: 1, name: 'Entrega Lupo 03/09', startedAt: '2026-09-03T10:00:00.000Z' }] }),
      }),
    );

    render(<HomePage />);

    await waitFor(() => expect(screen.getByText('Entrega Lupo 03/09')).toBeInTheDocument());
  });

  it('creates a new counting when the manual form is submitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ countings: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<HomePage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/Nome da contagem/), { target: { value: 'Nova entrega' } });
    fireEvent.click(screen.getByText('Contagem manual'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/countings',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Nova entrega' }) }),
      ),
    );
  });

  it('does not create a duplicate counting on a fast double submit', async () => {
    let resolvePost: (() => void) | undefined;
    const postPromise = new Promise<void>((resolve) => {
      resolvePost = resolve;
    });
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/countings' && init?.method === 'POST') {
        return postPromise.then(() => ({ json: async () => ({ counting: { id: 1 } }) }));
      }
      return Promise.resolve({ json: async () => ({ countings: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<HomePage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/Nome da contagem/), { target: { value: 'Nova entrega' } });
    const button = screen.getByText('Contagem manual');
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    resolvePost?.();
    await waitFor(() => expect(screen.getByText('Contagem manual')).toBeInTheDocument());

    const postCalls = fetchMock.mock.calls.filter(([url, init]) => url === '/api/countings' && init?.method === 'POST');
    expect(postCalls).toHaveLength(1);
  });

  it('imports an XML file and shows an error message when it is rejected', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/countings/import-xml') {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: 'invalid_xml', message: 'Não parece ser um XML de NF-e.' }),
        });
      }
      return Promise.resolve({ json: async () => ({ countings: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<HomePage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const file = new File(['<a/>'], 'nota.xml', { type: 'text/xml' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText('Não parece ser um XML de NF-e.')).toBeInTheDocument());
  });
});
