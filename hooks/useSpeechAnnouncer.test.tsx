import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { unlockSpeech, useSpeechAnnouncer } from './useSpeechAnnouncer';

describe('useSpeechAnnouncer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('speaks "Caixa N" in Portuguese when the browser supports speech synthesis', () => {
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      vi.fn().mockImplementation((text: string) => ({ text, lang: '' })),
    );

    const { result } = renderHook(() => useSpeechAnnouncer());
    result.current.announceBox(3);

    expect(speak).toHaveBeenCalledOnce();
    const utterance = speak.mock.calls[0][0];
    expect(utterance.text).toBe('Caixa 3');
    expect(utterance.lang).toBe('pt-BR');
  });

  it('does nothing when speech synthesis is unavailable', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    const { result } = renderHook(() => useSpeechAnnouncer());
    expect(() => result.current.announceBox(1)).not.toThrow();
  });
});

describe('unlockSpeech', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('speaks an empty utterance once to unlock speech synthesis for a later call', () => {
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      vi.fn().mockImplementation((text: string) => ({ text, lang: '' })),
    );

    unlockSpeech();

    expect(speak).toHaveBeenCalledOnce();
    const utterance = speak.mock.calls[0][0];
    expect(utterance.text).toBe('');
  });

  it('does nothing when speech synthesis is unavailable', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    expect(() => unlockSpeech()).not.toThrow();
  });
});
