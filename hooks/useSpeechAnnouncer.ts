'use client';

import { useCallback } from 'react';

export function useSpeechAnnouncer() {
  const announceBox = useCallback((boxNumber: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(`Caixa ${boxNumber}`);
    utterance.lang = 'pt-BR';
    window.speechSynthesis.speak(utterance);
  }, []);

  return { announceBox };
}
