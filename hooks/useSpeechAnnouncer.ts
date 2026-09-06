'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * iOS Safari requires the first `speechSynthesis.speak()` call to originate
 * synchronously from a user-gesture handler; after that, later calls (even
 * from async code, like a scan response callback) work fine. Call this once
 * from a click/pointerdown handler early in the page's lifecycle to "unlock"
 * speech for subsequent announcements. Guarded the same way `announceBox` is
 * — never throws if speech synthesis is unavailable.
 */
export function unlockSpeech() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance('');
  window.speechSynthesis.speak(utterance);
}

export function useSpeechAnnouncer() {
  // Holding a ref keeps the SpeechSynthesisUtterance reachable across
  // renders — some browsers silently drop an utterance that has no live
  // reference before it gets a chance to speak.
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const announceBox = useCallback((boxNumber: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    // The queue can get stuck after several announcements fire without a
    // direct user gesture behind them (e.g. while the camera scanner keeps
    // running) — clearing it first stops one jammed utterance from
    // silently blocking every announcement that comes after it.
    if (typeof synth.cancel === 'function') synth.cancel();
    const utterance = new SpeechSynthesisUtterance(`Caixa ${boxNumber}`);
    utterance.lang = 'pt-BR';
    utteranceRef.current = utterance;
    synth.speak(utterance);
  }, []);

  // Chrome-family browsers are known to silently pause the speech queue
  // after a stretch of inactivity; nudging resume() periodically works
  // around it and is a no-op when nothing is queued or unsupported.
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.speechSynthesis) return;
    const interval = setInterval(() => {
      window.speechSynthesis.resume?.();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return { announceBox };
}
