import { beforeEach, describe, expect, it } from 'vitest';
import { enqueueScan, loadQueue, removeFromQueue } from './scanQueue';

beforeEach(() => {
  window.localStorage.clear();
});

describe('scanQueue', () => {
  it('starts empty', () => {
    expect(loadQueue()).toEqual([]);
  });

  it('enqueues a scan and persists it', () => {
    enqueueScan('1', '7891234000011');
    const queue = loadQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ countingId: '1', barcode: '7891234000011' });
  });

  it('stores an optional sku with the queued scan', () => {
    enqueueScan('1', '7891234000011', 'CUECA-SLIP-P');
    const queue = loadQueue();
    expect(queue[0].sku).toBe('CUECA-SLIP-P');
  });

  it('removes a scan from the queue', () => {
    enqueueScan('1', '7891234000011');
    const queue = loadQueue();
    const updated = removeFromQueue(queue, queue[0]);
    expect(updated).toHaveLength(0);
    expect(loadQueue()).toHaveLength(0);
  });

  it('removes a scan even when compared against a separately-loaded copy', () => {
    enqueueScan('1', '7891234000011');
    const queueA = loadQueue();
    const queueB = loadQueue(); // a fresh JSON.parse — never reference-equal to queueA's objects
    const updated = removeFromQueue(queueB, queueA[0]);
    expect(updated).toHaveLength(0);
  });
});
