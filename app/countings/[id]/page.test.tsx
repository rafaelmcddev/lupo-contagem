import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CountingPage from './page';

const { decodeFromVideoDevice, stop } = vi.hoisted(() => ({
  decodeFromVideoDevice: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: vi.fn().mockImplementation(() => ({
    decodeFromVideoDevice,
  })),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.localStorage.clear();
});

const activeDetail = {
  counting: { id: 1, name: 'Entrega Lupo 03/09', status: 'active' },
  boxes: [{ boxNumber: 1, groupName: null, total: 2, skuBreakdown: [{ sku: 'CUECA-SLIP-P', total: 2 }] }],
  grandTotal: 2,
};

describe('CountingPage', () => {
  it('shows the scanner input and box list while active', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => activeDetail }));
    render(<CountingPage params={{ id: '1' }} />);

    await waitFor(() => expect(screen.getByText('Caixa 1')).toBeInTheDocument());
    expect(screen.getByLabelText('Campo de leitura de código de barras')).toBeInTheDocument();
    expect(screen.getByText('Finalizar contagem')).toBeInTheDocument();
  });

  it('sends a scan and re-fetches the detail when a barcode is entered', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => activeDetail })
      .mockResolvedValueOnce({
        status: 200, ok: true,
        json: async () => ({ duplicate: false, box: { boxNumber: 1, groupName: null, sku: 'CUECA-SLIP-P', total: 3 } }),
      })
      .mockResolvedValueOnce({
        status: 200, ok: true,
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
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => activeDetail })
      .mockResolvedValueOnce({ status: 422, ok: false, json: async () => ({ error: 'sku_required' }) })
      .mockResolvedValueOnce({
        status: 200, ok: true,
        json: async () => ({ duplicate: false, box: { boxNumber: 2, groupName: null, sku: 'NOVO-SKU', total: 1 } }),
      })
      .mockResolvedValueOnce({
        status: 200, ok: true,
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
        status: 200, ok: true,
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
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => activeDetail })
      .mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);

    render(<CountingPage params={{ id: '1' }} />);
    await waitFor(() => expect(screen.getByText('Caixa 1')).toBeInTheDocument());

    const input = screen.getByLabelText('Campo de leitura de código de barras');
    fireEvent.change(input, { target: { value: '7891234000011' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByText(/Sincronizando/)).toBeInTheDocument());
  });

  it('shows a message when the scanned barcode is invalid', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => activeDetail })
      .mockResolvedValueOnce({ status: 400, ok: false, json: async () => ({ error: 'invalid_barcode' }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<CountingPage params={{ id: '1' }} />);
    await waitFor(() => expect(screen.getByText('Caixa 1')).toBeInTheDocument());

    const input = screen.getByLabelText('Campo de leitura de código de barras');
    fireEvent.change(input, { target: { value: '123' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByText('Código inválido — verifique a leitura.')).toBeInTheDocument());
  });

  it('keeps the camera open across multiple scans, closing only on the close button', async () => {
    let callback: ((result: { getText: () => string } | undefined) => void) | undefined;
    decodeFromVideoDevice.mockImplementation((_device: unknown, _video: unknown, cb: typeof callback) => {
      callback = cb;
      return Promise.resolve({ stop });
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => activeDetail })
      .mockResolvedValueOnce({
        status: 200, ok: true,
        json: async () => ({ duplicate: false, box: { boxNumber: 1, groupName: null, sku: 'CUECA-SLIP-P', total: 3 } }),
      })
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => activeDetail })
      .mockResolvedValueOnce({
        status: 200, ok: true,
        json: async () => ({ duplicate: false, box: { boxNumber: 1, groupName: null, sku: 'CUECA-SLIP-P', total: 4 } }),
      })
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => activeDetail });
    vi.stubGlobal('fetch', fetchMock);

    render(<CountingPage params={{ id: '1' }} />);
    await waitFor(() => expect(screen.getByText('Caixa 1')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Usar câmera'));
    await waitFor(() => expect(decodeFromVideoDevice).toHaveBeenCalled());

    callback!({ getText: () => '7891234000011' });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/countings/1/scan',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ barcode: '7891234000011' }) }),
      ),
    );

    expect(screen.getByText('Fechar câmera')).toBeInTheDocument();

    callback!({ getText: () => '9999999000011' });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/countings/1/scan',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ barcode: '9999999000011' }) }),
      ),
    );
    expect(screen.getByText('Fechar câmera')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Fechar câmera'));
    expect(screen.queryByText('Fechar câmera')).not.toBeInTheDocument();
  });

  it('shows a not-found message when the counting fails to load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404, ok: false, json: async () => ({ error: 'counting_not_found' }) }));
    render(<CountingPage params={{ id: '999' }} />);

    await waitFor(() => expect(screen.getByText('Contagem não encontrada.')).toBeInTheDocument());
  });

  it('shows the invoice check comparison for an xml-sourced counting', async () => {
    const xmlDetail = {
      counting: { id: 1, name: 'NF 5237024', status: 'active', source: 'xml', invoiceNumber: '5237024' },
      boxes: activeDetail.boxes,
      grandTotal: 2,
      invoiceCheck: [
        { barcode: '7891234000011', sku: 'SKU-A', name: 'Produto A', expectedQty: 3, countedQty: 2 },
        { barcode: '7891234000028', sku: 'SKU-B', name: 'Produto B', expectedQty: 5, countedQty: 5 },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => xmlDetail }));
    render(<CountingPage params={{ id: '1' }} />);

    await waitFor(() => expect(screen.getByText('Conferência da nota')).toBeInTheDocument());
    expect(screen.getByText('Importada da NF-e nº 5237024')).toBeInTheDocument();
    expect(screen.getByText('Produto A')).toBeInTheDocument();
    expect(screen.getByText('Faltam 1')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
  });
});
