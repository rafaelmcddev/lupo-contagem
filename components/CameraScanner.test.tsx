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
});
