import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CountingPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const activeDetail = {
  counting: { id: 1, name: 'Entrega Lupo 03/09', status: 'active' },
  boxes: [{ boxNumber: 1, groupName: null, total: 2, skuBreakdown: [{ sku: 'CUECA-SLIP-P', total: 2 }] }],
  grandTotal: 2,
};

describe('CountingPage', () => {
  it('shows the scanner input and box list while active', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, json: async () => activeDetail }));
    render(<CountingPage params={{ id: '1' }} />);

    await waitFor(() => expect(screen.getByText('Caixa 1')).toBeInTheDocument());
    expect(screen.getByLabelText('Campo de leitura de código de barras')).toBeInTheDocument();
    expect(screen.getByText('Finalizar contagem')).toBeInTheDocument();
  });

  it('sends a scan and re-fetches the detail when a barcode is entered', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, json: async () => activeDetail })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ duplicate: false, box: { boxNumber: 1, groupName: null, sku: 'CUECA-SLIP-P', total: 3 } }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ...activeDetail, boxes: [{ ...activeDetail.boxes[0], total: 3 }], grandTotal: 3 }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(<CountingPage params={{ id: '1' }} />);
    await waitFor(() => expect(screen.getByText('Caixa 1')).toBeInTheDocument());

    const input = screen.getByLabelText('Campo de leitura de código de barras');
    fireEvent.change(input, { target: { value: '7891234000011' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/countings/1/scan',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ barcode: '7891234000011' }) }),
      ),
    );
  });

  it('prompts for a SKU when the scan requires one, then resubmits with it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, json: async () => activeDetail })
      .mockResolvedValueOnce({ status: 422, json: async () => ({ error: 'sku_required' }) })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ duplicate: false, box: { boxNumber: 2, groupName: null, sku: 'NOVO-SKU', total: 1 } }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          ...activeDetail,
          boxes: [...activeDetail.boxes, { boxNumber: 2, groupName: null, total: 1, skuBreakdown: [{ sku: 'NOVO-SKU', total: 1 }] }],
          grandTotal: 3,
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(<CountingPage params={{ id: '1' }} />);
    await waitFor(() => expect(screen.getByText('Caixa 1')).toBeInTheDocument());

    const input = screen.getByLabelText('Campo de leitura de código de barras');
    fireEvent.change(input, { target: { value: '9999999000011' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByLabelText(/SKU/)).toBeInTheDocument());
    expect(input).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/SKU/), { target: { value: 'NOVO-SKU' } });
    fireEvent.click(screen.getByText('Vincular SKU e contar'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/countings/1/scan',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ barcode: '9999999000011', sku: 'NOVO-SKU' }) }),
      ),
    );
    await waitFor(() => expect(screen.queryByLabelText(/SKU/)).not.toBeInTheDocument());
  });

  it('shows export buttons instead of the scanner once finished', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ ...activeDetail, counting: { ...activeDetail.counting, status: 'finished' } }),
      }),
    );
    render(<CountingPage params={{ id: '1' }} />);

    await waitFor(() => expect(screen.getByText('Exportar CSV')).toBeInTheDocument());
    expect(screen.queryByLabelText('Campo de leitura de código de barras')).not.toBeInTheDocument();
  });

  it('queues a scan and shows a syncing indicator when the network request fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, json: async () => activeDetail })
      .mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);

    render(<CountingPage params={{ id: '1' }} />);
    await waitFor(() => expect(screen.getByText('Caixa 1')).toBeInTheDocument());

    const input = screen.getByLabelText('Campo de leitura de código de barras');
    fireEvent.change(input, { target: { value: '7891234000011' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByText(/Sincronizando/)).toBeInTheDocument());
  });
});
