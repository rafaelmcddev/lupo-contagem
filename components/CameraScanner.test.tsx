import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraScanner } from './CameraScanner';

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
  vi.clearAllMocks();
});

describe('CameraScanner', () => {
  it('calls onScan when the reader decodes a barcode', async () => {
    const onScan = vi.fn();
    decodeFromVideoDevice.mockImplementation((_device: unknown, _video: unknown, callback: (result: { getText: () => string } | undefined) => void) => {
      callback({ getText: () => '7891234000011' });
      return Promise.resolve({ stop });
    });

    render(<CameraScanner onScan={onScan} onClose={() => {}} />);

    await waitFor(() => expect(onScan).toHaveBeenCalledWith('7891234000011'));
  });

  it('shows an error message when the camera cannot be accessed', async () => {
    decodeFromVideoDevice.mockRejectedValue(new Error('no camera'));
    render(<CameraScanner onScan={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Não foi possível acessar a câmera.')).toBeInTheDocument());
  });

  it('calls onClose when the close button is pressed', () => {
    decodeFromVideoDevice.mockImplementation(() => Promise.resolve({ stop }));
    const onClose = vi.fn();
    render(<CameraScanner onScan={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByText('Fechar câmera'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not re-fire onScan for the same code decoded again within the debounce window', async () => {
    const onScan = vi.fn();
    let callback: ((result: { getText: () => string } | undefined) => void) | undefined;
    decodeFromVideoDevice.mockImplementation((_device: unknown, _video: unknown, cb: typeof callback) => {
      callback = cb;
      return Promise.resolve({ stop });
    });

    render(<CameraScanner onScan={onScan} onClose={() => {}} />);
    await waitFor(() => expect(decodeFromVideoDevice).toHaveBeenCalled());

    callback!({ getText: () => '7891234000011' });
    callback!({ getText: () => '7891234000011' });

    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it('fires onScan again immediately for a different code', async () => {
    const onScan = vi.fn();
    let callback: ((result: { getText: () => string } | undefined) => void) | undefined;
    decodeFromVideoDevice.mockImplementation((_device: unknown, _video: unknown, cb: typeof callback) => {
      callback = cb;
      return Promise.resolve({ stop });
    });

    render(<CameraScanner onScan={onScan} onClose={() => {}} />);
    await waitFor(() => expect(decodeFromVideoDevice).toHaveBeenCalled());

    callback!({ getText: () => '7891234000011' });
    callback!({ getText: () => '9999999000011' });

    expect(onScan).toHaveBeenCalledTimes(2);
    expect(onScan).toHaveBeenNthCalledWith(1, '7891234000011');
    expect(onScan).toHaveBeenNthCalledWith(2, '9999999000011');
  });

  it('fires onScan again for the same code once the debounce window elapses', async () => {
    vi.useFakeTimers();
    try {
      const onScan = vi.fn();
      let callback: ((result: { getText: () => string } | undefined) => void) | undefined;
      decodeFromVideoDevice.mockImplementation((_device: unknown, _video: unknown, cb: typeof callback) => {
        callback = cb;
        return Promise.resolve({ stop });
      });

      render(<CameraScanner onScan={onScan} onClose={() => {}} />);
      await vi.waitFor(() => expect(decodeFromVideoDevice).toHaveBeenCalled());

      callback!({ getText: () => '7891234000011' });
      vi.advanceTimersByTime(2100);
      callback!({ getText: () => '7891234000011' });

      expect(onScan).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the box number in large text when feedback carries a boxNumber', async () => {
    decodeFromVideoDevice.mockImplementation(() => Promise.resolve({ stop }));
    const { rerender } = render(
      <CameraScanner onScan={() => {}} onClose={() => {}} feedback={{ token: 1, boxNumber: 3, message: 'Caixa 3' }} />,
    );
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
    expect(screen.getByText('Caixa')).toBeInTheDocument();

    // A status message with no boxNumber renders as a small banner instead.
    rerender(
      <CameraScanner onScan={() => {}} onClose={() => {}} feedback={{ token: 2, message: 'Leitura repetida ignorada.' }} />,
    );
    await waitFor(() => expect(screen.getByText('Leitura repetida ignorada.')).toBeInTheDocument());
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });
});
