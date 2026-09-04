'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

export function CameraScanner({ onScan, onClose }: { onScan: (barcode: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let controls: { stop: () => void } | undefined;
    let cancelled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
        if (result) onScan(result.getText());
      })
      .then((c) => {
        if (cancelled) {
          c.stop();
          return;
        }
        controls = c;
      })
      .catch(() => setError('Não foi possível acessar a câmera.'));

    return () => {
      cancelled = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-6">
      {error ? (
        <p className="text-xl text-white">{error}</p>
      ) : (
        <video ref={videoRef} playsInline muted className="max-h-[70vh] rounded-2xl" />
      )}
      <button onClick={onClose} className="mt-6 rounded-xl bg-white px-6 py-4 text-xl font-semibold">
        Fechar câmera
      </button>
    </div>
  );
}
