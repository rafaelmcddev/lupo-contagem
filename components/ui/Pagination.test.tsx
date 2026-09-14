import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('renders nothing when there is only one page', () => {
    render(<Pagination page={1} pageSize={20} total={5} onPageChange={vi.fn()} />);
    expect(screen.queryByText('Anterior')).not.toBeInTheDocument();
    expect(screen.queryByText('Próxima')).not.toBeInTheDocument();
  });

  it('renders both navigation buttons when there is more than one page', () => {
    render(<Pagination page={1} pageSize={20} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByText('Anterior')).toBeInTheDocument();
    expect(screen.getByText('Próxima')).toBeInTheDocument();
  });

  it('disables "Anterior" on the first page', () => {
    render(<Pagination page={1} pageSize={20} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByText('Anterior')).toBeDisabled();
  });

  it('disables "Próxima" on the last page', () => {
    render(<Pagination page={3} pageSize={20} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByText('Próxima')).toBeDisabled();
  });

  it('calls onPageChange with page - 1 when "Anterior" is clicked', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={20} total={50} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByText('Anterior'));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('calls onPageChange with page + 1 when "Próxima" is clicked', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={20} total={50} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByText('Próxima'));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
