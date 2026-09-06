'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

const RESCAN_DEBOUNCE_MS = 2000;
const PULSE_DURATION_MS = 500;
const BOX_BANNER_DURATION_MS = 2800;

export interface CameraFeedback {
  /** Increment this on every server-confirmed scan to (re)trigger the banner. */
  token: number;
  /** Set when the scan resolved to a box — rendered huge, full-screen. */
  boxNumber?: number;
  /** Shown instead of the box banner for other outcomes (duplicate, error, etc). */
  message: string;
}

export function CameraScanner({
  onScan,
  onClose,
  feedback,
}: {
  onScan: (barcode: string) => void;
  onClose: () => void;
  feedback?: CameraFeedback | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulsing, setPulsing] = useState(false);
  const [banner, setBanner] = useState<{ boxNumber?: number; message: string } | null>(null);
  const lastScanRef = useRef<{ code: string; time: number } | null>(null);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFeedbackToken = useRef<number | null>(null);

  // Every read gets an immediate visual pulse + vibration the instant the
  // camera decodes it — this doesn't wait for the server round trip, so it
  // confirms "yes, that was read" even before we know which box it landed in.
  function pulse() {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(80);
    }
    setPulsing(true);
    if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    pulseTimeoutRef.current = setTimeout(() => setPulsing(false), PULSE_DURATION_MS);
  }

  useEffect(() => {
    if (!feedback || feedback.token === lastFeedbackToken.current) return;
    lastFeedbackToken.current = feedback.token;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      // A distinct, slightly longer buzz once the box itself is confirmed —
      // separate from the read-pulse above — so it's felt even without
      // looking at the screen.
      navigator.vibrate(feedback.boxNumber ? [60, 60, 60] : 120);
    }
    setBanner({ boxNumber: feedback.boxNumber, message: feedback.message });
    if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    bannerTimeoutRef.current = setTimeout(() => setBanner(null), BOX_BANNER_DURATION_MS);
  }, [feedback]);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let controls: { stop: () => void } | undefined;
    let cancelled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
        if (!result) return;
        const code = result.getText();
        const now = Date.now();
        const last = lastScanRef.current;
        if (last && last.code === code && now - last.time < RESCAN_DEBOUNCE_MS) return;
        lastScanRef.current = { code, time: now };
        pulse();
        onScan(code);
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
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
      {error ? (
        <p className="text-xl text-white">{error}</p>
      ) : (
        <div className="relative w-full max-w-md">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full max-h-[55vh] rounded-2xl border-4 object-cover transition-colors duration-150 ${
              pulsing ? 'border-emerald-400' : 'border-transparent'
            }`}
          />

          {/* Big, unmistakable confirmation of which box the scan landed in —
              doesn't depend on audio at all, since speech synthesis is
              unreliable while the camera keeps decoding frames in the
              background on some phones. */}
          {banner?.boxNumber !== undefined && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-emerald-600/95">
              <div className="text-center">
                <p className="text-2xl font-semibold uppercase tracking-wide text-emerald-100">Caixa</p>
                <p className="text-8xl font-black leading-none text-white">{banner.boxNumber}</p>
              </div>
            </div>
          )}

          {banner && banner.boxNumber === undefined && (
            <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
              <span className="rounded-xl bg-white px-5 py-3 text-center text-xl font-semibold text-ink shadow-lg">
                {banner.message}
              </span>
            </div>
          )}
        </div>
      )}
      <button onClick={onClose} className="mt-6 rounded-xl bg-white px-6 py-4 text-xl font-semibold">
        Fechar câmera
      </button>
    </div>
  );
}
