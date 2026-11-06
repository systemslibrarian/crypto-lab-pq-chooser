import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkedSample, equalBytes, BenchmarkValidationError } from './validation';
import { runBenchmark } from './runner';
import { KEMS, SIGNERS } from '../derive/adapters';
vi.mock('../derive/adapters', async (importOriginal) => {
  const real = await importOriginal<typeof import('../derive/adapters')>();
  return { ...real, KEMS: Object.fromEntries(Object.entries(real.KEMS).map(([k,v]) => [k, { ...v }])), SIGNERS: Object.fromEntries(Object.entries(real.SIGNERS).map(([k,v]) => [k, { ...v }])) };
});
afterEach(() => vi.restoreAllMocks());
describe('validated timing', () => {
  it('awaits the operation but excludes asynchronous validation from its sample', async () => {
    let clock = 0;
    const elapsed = await checkedSample('test', async () => { await Promise.resolve(); clock += 7; return 'result'; },
      async result => { await Promise.resolve(); clock += 100; return result === 'result'; }, () => clock);
    expect(elapsed).toBe(7); expect(clock).toBe(107);
  });
  it('rejects false verification and thrown validation', async () => {
    await expect(checkedSample('verify', () => false, x => x)).rejects.toBeInstanceOf(BenchmarkValidationError);
    await expect(checkedSample('sign', () => new Uint8Array(), () => { throw Error('malformed'); })).rejects.toBeInstanceOf(BenchmarkValidationError);
  });
  it('rejects mismatched and empty shared secrets', () => {
    expect(equalBytes(new Uint8Array([1]), new Uint8Array([2]))).toBe(false);
    expect(equalBytes(new Uint8Array(), new Uint8Array())).toBe(false);
    expect(equalBytes(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false);
  });
  it('rejects a broken KEM during warmup before any completed slot', async () => {
    vi.spyOn(KEMS.ml_kem512, 'decapsulate').mockReturnValue(new Uint8Array(32));
    const progress = vi.fn();
    await expect(runBenchmark(['ml_kem512'], { onProgress: progress, yieldToEventLoop: async () => {} })).rejects.toBeInstanceOf(BenchmarkValidationError);
    expect(progress).not.toHaveBeenCalled();
  });
  it('rejects a corrupted measured signature after successful warmups', async () => {
    const signer = SIGNERS.ml_dsa44, original = signer.sign;
    let calls = 0;
    vi.spyOn(signer, 'sign').mockImplementation((m, k) => {
      const sig = original(m, k);
      // setup + 35 keygen validation signatures + 5 signing warmups
      if (++calls === 42) sig.fill(0);
      return sig;
    });
    await expect(runBenchmark(['ml_dsa44'], { yieldToEventLoop: async () => {} })).rejects.toBeInstanceOf(BenchmarkValidationError);
    expect(calls).toBe(42);
  });
  it('accepts real PQ and classical round trips', async () => {
    const run = await runBenchmark(['ml_kem512', 'ml_dsa44'], { yieldToEventLoop: async () => {} });
    expect(run.rows.slice(0, 2).every(row => row.operations.length === 3)).toBe(true);
    expect(run.rows.find(row => row.id === 'ecdsa-p256')?.operations).toHaveLength(3);
  }, 30000);
});
