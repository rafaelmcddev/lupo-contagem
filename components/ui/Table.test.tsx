import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table } from './Table';

interface Row {
  id: number;
  name: string;
  age: number;
}

const columns = [
  { header: 'Nome', render: (r: Row) => r.name },
  { header: 'Idade', render: (r: Row) => String(r.age) },
];

describe('Table', () => {
  it('renders a header and a row per item', () => {
    render(<Table columns={columns} rows={[{ id: 1, name: 'Ana', age: 30 }]} emptyMessage="Vazio" />);
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('Idade')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('shows the empty message when there are no rows', () => {
    render(<Table columns={columns} rows={[]} emptyMessage="Nenhum registro." />);
    expect(screen.getByText('Nenhum registro.')).toBeInTheDocument();
  });

  it('alternates row background classes for a striped look', () => {
    const { container } = render(
      <Table
        columns={columns}
        rows={[
          { id: 1, name: 'Ana', age: 30 },
          { id: 2, name: 'Bia', age: 25 },
        ]}
        emptyMessage="Vazio"
      />,
    );
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].className).toContain('bg-paper');
    expect(rows[1].className).toContain('bg-canvas');
  });

  it('wraps the table in a horizontally scrollable container for narrow screens', () => {
    const { container } = render(<Table columns={columns} rows={[{ id: 1, name: 'Ana', age: 30 }]} emptyMessage="Vazio" />);
    expect(container.querySelector('.overflow-x-auto')).not.toBeNull();
  });
});
