import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProductsPage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
});

const oneProduct = { barcode: '7891234000011', sku: 'CUECA-SLIP-P', name: 'Cueca Slip Preta P' };

describe('ProductsPage', () => {
  it('lists registered products', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ products: [oneProduct] }) }));
    render(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Cueca Slip Preta P')).toBeInTheDocument());
    expect(screen.getByText('7891234000011')).toBeInTheDocument();
    expect(screen.getByText('CUECA-SLIP-P')).toBeInTheDocument();
  });

  it('adds a new product', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ products: [] }) });
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

  it('edits a product inline', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ products: [oneProduct] }) })
      .mockResolvedValueOnce({ json: async () => ({ product: { ...oneProduct, name: 'Novo nome' } }) })
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

  it('removes a product', async () => {
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
});
