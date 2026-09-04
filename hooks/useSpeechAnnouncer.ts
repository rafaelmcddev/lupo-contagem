'use client';

import { useCallback } from 'react';

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
  const announceBox = useCallback((boxNumber: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(`Caixa ${boxNumber}`);
    utterance.lang = 'pt-BR';
    window.speechSynthesis.speak(utterance);
  }, []);

  return { announceBox };
}
