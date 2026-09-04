import { describe, expect, it } from 'vitest';
import { resolveGroupName } from './groupMatch';

describe('resolveGroupName', () => {
  it('returns null when no group matches', () => {
    expect(resolveGroupName('7891234', [])).toBeNull();
  });

  it('returns the matching group name', () => {
    const groups = [{ prefix: '789123', name: 'Cueca Slip Preta' }];
    expect(resolveGroupName('7891234', groups)).toBe('Cueca Slip Preta');
  });

  it('picks the most specific (longest) matching prefix', () => {
    const groups = [
      { prefix: '789', name: 'Genérico Lupo' },
      { prefix: '789123', name: 'Cueca Slip Preta' },
    ];
    expect(resolveGroupName('7891234', groups)).toBe('Cueca Slip Preta');
  });

  it('ignores groups whose prefix does not match', () => {
    const groups = [{ prefix: '111111', name: 'Outro Grupo' }];
    expect(resolveGroupName('7891234', groups)).toBeNull();
  });
});
