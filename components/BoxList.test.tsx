import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BoxList } from './BoxList';

describe('BoxList', () => {
  it('shows a placeholder when there are no boxes yet', () => {
    render(<BoxList boxes={[]} />);
    expect(screen.getByText(/Nenhuma caixa ainda/)).toBeInTheDocument();
  });

  it('renders the box number, group name, total, and a name+SKU breakdown in large text', () => {
    render(
      <BoxList
        boxes={[
          {
            boxNumber: 1,
            groupName: 'Cueca Slip Preta',
            total: 12,
            skuBreakdown: [
              { sku: 'CUECA-SLIP-P', name: 'Cueca Slip Preta P', total: 7 },
              { sku: 'CUECA-SLIP-M', name: 'Cueca Slip Preta M', total: 5 },
            ],
          },
        ]}
      />,
    );
    const boxNumber = screen.getByText('Caixa 1');
    expect(boxNumber).toHaveClass('text-3xl');
    expect(screen.getByText('Cueca Slip Preta')).toBeInTheDocument();
    expect(screen.getByText('12 peças')).toBeInTheDocument();
    expect(screen.getByText('Cueca Slip Preta P')).toBeInTheDocument();
    expect(screen.getByText('(CUECA-SLIP-P)')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Cueca Slip Preta M')).toBeInTheDocument();
    expect(screen.getByText('(CUECA-SLIP-M)')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders a box without a name when none is registered', () => {
    render(
      <BoxList
        boxes={[{ boxNumber: 2, groupName: null, total: 4, skuBreakdown: [{ sku: 'OUTRO-SKU', name: null, total: 4 }] }]}
      />,
    );
    expect(screen.getByText('Caixa 2')).toBeInTheDocument();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });

  it('renders "Sem nome" and "Sem SKU" for a breakdown entry with neither linked', () => {
    render(
      <BoxList
        boxes={[
          {
            boxNumber: 3,
            groupName: null,
            total: 2,
            skuBreakdown: [{ sku: null, name: null, total: 2 }],
          },
        ]}
      />,
    );
    expect(screen.getByText('Sem nome')).toBeInTheDocument();
    expect(screen.getByText('(Sem SKU)')).toBeInTheDocument();
  });
});
