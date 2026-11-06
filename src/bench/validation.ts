/** A failed correctness check must never become an unsupported or fast row. */
export class BenchmarkValidationError extends Error {
  constructor(operation: string) {
    super(`Correctness check failed for ${operation}; no timings from this run were accepted.`);
    this.name = 'BenchmarkValidationError';
  }
}

/** Non-secret test comparison; empty or unequal outputs cannot establish agreement. */
export function equalBytes(a: Uint8Array | ArrayBuffer, b: Uint8Array | ArrayBuffer): boolean {
  const x = a instanceof Uint8Array ? a : new Uint8Array(a);
  const y = b instanceof Uint8Array ? b : new Uint8Array(b);
  return x.length > 0 && x.length === y.length && x.every((v, i) => v === y[i]);
}

export async function checkedSample<T>(
  operation: string, run: () => T | Promise<T>,
  validate: (result: T) => boolean | Promise<boolean>, now = () => performance.now()
): Promise<number> {
  const start = now();
  const result = await run();
  const elapsed = now() - start;
  try {
    if (await validate(result) !== true) throw new BenchmarkValidationError(operation);
  } catch {
    throw new BenchmarkValidationError(operation);
  }
  return elapsed;
}
