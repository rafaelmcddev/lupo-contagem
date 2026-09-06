import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BoxList } from './BoxList';

describe('BoxList', () => {
  it('shows a placeholder when there are no boxes yet', () => {
    render(<BoxList boxes={[]} />);
    expect(screen.getByText(/Nenhuma caixa ainda/)).toBeInTheDocument();
  });

  it('collapses a single-product box into one line, showing the quantity only once', () => {
    render(
      <BoxList
        boxes={[
          {
            boxNumber: 1,
            groupName: 'Cueca Slip Preta',
            total: 7,
            skuBreakdown: [{ barcode: '7891234000011', sku: 'CUECA-SLIP-P', name: 'Cueca Slip Preta P', total: 7 }],
          },
        ]}
      />,
    );
    expect(screen.getByText('Caixa 1')).toBeInTheDocument();
    expect(screen.getByText('Cueca Slip Preta')).toBeInTheDocument();
    expect(screen.getByText('Cueca Slip Preta P')).toBeInTheDocument();
    expect(screen.getByText('(CUECA-SLIP-P)')).toBeInTheDocument();
    // The quantity 7 should render exactly once for this box, not once for
    // the box total and again for the (identical) product total.
    expect(screen.getAllByText('7')).toHaveLength(1);
  });

  it('shows the barcode instead of "Sem SKU" when a product has no SKU registered', () => {
    render(
      <BoxList
        boxes={[
          {
            boxNumber: 2,
            groupName: null,
            total: 3,
            skuBreakdown: [{ barcode: '7899999000011', sku: null, name: null, total: 3 }],
          },
        ]}
      />,
    );
    expect(screen.getByText('Sem nome')).toBeInTheDocument();
    expect(screen.getByText('(7899999000011)')).toBeInTheDocument();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });

  it('shows a per-product breakdown plus the box total when a box has more than one product', () => {
    render(
      <BoxList
        boxes={[
          {
            boxNumber: 3,
            groupName: null,
            total: 12,
            skuBreakdown: [
              { barcode: '7891234000011', sku: 'CUECA-SLIP-P', name: 'Cueca Slip Preta P', total: 7 },
              { barcode: '7891234000028', sku: 'CUECA-SLIP-M', name: 'Cueca Slip Preta M', total: 5 },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText('Caixa 3')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Cueca Slip Preta P')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Cueca Slip Preta M')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
