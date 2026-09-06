import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProductsPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
});

const oneProduct = { barcode: '7891234000011', sku: 'CUECA-SLIP-P', name: 'Cueca Slip Preta P' };

describe('ProductsPage', () => {
  it('lists registered products', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ products: [oneProduct], total: 1 }) }));
    render(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Cueca Slip Preta P')).toBeInTheDocument());
    expect(screen.getByText(/7891234000011/)).toBeInTheDocument();
    expect(screen.getByText(/CUECA-SLIP-P/)).toBeInTheDocument();
  });

  it('shows the barcode instead of a blank SKU for a product registered without one', async () => {
    const noSkuProduct = { barcode: '78947467', sku: null, name: 'Produto qualquer' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ products: [noSkuProduct], total: 1 }) }));
    render(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Produto qualquer')).toBeInTheDocument());
    expect(screen.getByText('78947467')).toBeInTheDocument();
  });

  it('adds a new product with barcode, sku, and name', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ products: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProductsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('Código de barras'), { target: { value: '7891234000011' } });
    fireEvent.change(screen.getByPlaceholderText('SKU'), { target: { value: 'CUECA-SLIP-P' } });
    fireEvent.change(screen.getByPlaceholderText('Nome do produto'), { target: { value: 'Cueca Slip Preta P' } });
    fireEvent.click(screen.getByText('Adicionar'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/products',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ barcode: '7891234000011', sku: 'CUECA-SLIP-P', name: 'Cueca Slip Preta P' }),
        }),
      ),
    );
  });

  it('submits with a blank SKU — the server decides whether SKU is required, not the form', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ products: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProductsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText('Código de barras'), { target: { value: '78947467' } });
    fireEvent.change(screen.getByPlaceholderText('Nome do produto'), { target: { value: 'Produto qualquer' } });
    fireEvent.click(screen.getByText('Adicionar'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/products',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ barcode: '78947467', sku: '', name: 'Produto qualquer' }),
        }),
      ),
    );
  });

  it('shows an error and does not submit when the barcode or name is left blank', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ products: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProductsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText('SKU'), { target: { value: 'SKU-X' } });
    fireEvent.click(screen.getByText('Adicionar'));

    expect(await screen.findByText(/Preencha ao menos o código de barras e o nome/)).toBeInTheDocument();
    // Only the initial GET happened — no POST was ever attempted.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows a message pointing at Configurações when the server requires a SKU', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ products: [] }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'sku_required' }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProductsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText('Código de barras'), { target: { value: '78947467' } });
    fireEvent.change(screen.getByPlaceholderText('Nome do produto'), { target: { value: 'Produto qualquer' } });
    fireEvent.click(screen.getByText('Adicionar'));

    expect(await screen.findByText(/SKU é obrigatório/)).toBeInTheDocument();
  });

  it('shows a clear message when the barcode is already registered', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ products: [] }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'barcode_already_registered' }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProductsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText('Código de barras'), { target: { value: '7891234000011' } });
    fireEvent.change(screen.getByPlaceholderText('SKU'), { target: { value: 'SKU-X' } });
    fireEvent.change(screen.getByPlaceholderText('Nome do produto'), { target: { value: 'Produto X' } });
    fireEvent.click(screen.getByText('Adicionar'));

    expect(await screen.findByText('Esse código de barras já está cadastrado.')).toBeInTheDocument();
  });

  it('edits a product inline', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ products: [oneProduct] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ product: { ...oneProduct, name: 'Novo nome' } }) })
      .mockResolvedValueOnce({ json: async () => ({ products: [{ ...oneProduct, name: 'Novo nome' }] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Cueca Slip Preta P')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Editar'));
    const nameInput = screen.getByDisplayValue('Cueca Slip Preta P');
    fireEvent.change(nameInput, { target: { value: 'Novo nome' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/products/7891234000011',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ sku: 'CUECA-SLIP-P', name: 'Novo nome' }) }),
      ),
    );
  });

  it('shows a message pointing at Configurações when clearing the SKU on edit is not allowed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ products: [oneProduct] }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'sku_required' }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Cueca Slip Preta P')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Editar'));
    const skuInput = screen.getByDisplayValue('CUECA-SLIP-P');
    fireEvent.change(skuInput, { target: { value: '' } });
    fireEvent.click(screen.getByText('Salvar'));

    expect(await screen.findByText(/SKU é obrigatório/)).toBeInTheDocument();
  });

  it('removes a product', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ products: [oneProduct] }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ json: async () => ({ products: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Remover')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Remover'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/products/7891234000011', { method: 'DELETE' }));
  });

  it('imports a CSV file and shows the result summary', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ products: [] }) })
      .mockResolvedValueOnce({ json: async () => ({ created: 2, updated: 0, errors: [] }) })
      .mockResolvedValueOnce({ json: async () => ({ products: [oneProduct] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProductsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const csvContent = 'nome;sku;codebar\nA;B;123';
    const file = new File([csvContent], 'produtos.csv', { type: 'text/csv' });
    const input = screen.getByLabelText('Importar CSV', { selector: 'input' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/products/import',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ csv: csvContent }) }),
      ),
    );
    await waitFor(() => expect(screen.getByText(/2 criados, 0 atualizados/)).toBeInTheDocument());
  });

  it('fetches products filtered by the search box after a short debounce', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ products: [oneProduct], total: 1 }) })
      .mockResolvedValueOnce({ json: async () => ({ products: [], total: 0 }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProductsPage />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Buscar produtos'), { target: { value: 'sutia' } });
    vi.advanceTimersByTime(350);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const lastCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(lastCallUrl).toContain('q=sutia');

    vi.useRealTimers();
  });
});
