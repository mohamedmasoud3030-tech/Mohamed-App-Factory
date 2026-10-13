/**
 * Nile Platform Engine — command idempotency lifecycle.
 * Extracted from Terranex `src/shared/idempotency` (GF-020-proven contract),
 * with the app-specific ActionState type replaced by a minimal local shape:
 *
 * One logical command attempt owns exactly one key. The key survives retries,
 * validation failures and network failures; a NEW key is issued only after
 * the server confirms success (monotonic successCount marker).
 */

export interface CommandState {
  successCount?: number;
  error?: string;
}

/** Generates a per-mount nonce. Call only where server + client agree on it. */
export function newCommandNonce(): string {
  return crypto.randomUUID();
}

/** Derives the key owned by the current logical attempt. */
export function commandIdempotencyKey(prefix: string, nonce: string, successCount: number): string {
  return `${prefix}-${nonce}-${successCount}`;
}

/** Confirmed success: advance the marker so the next attempt rotates keys. */
export function commandSuccessState(prev: CommandState): CommandState {
  return { successCount: (prev.successCount ?? 0) + 1 };
}

/** Unsuccessful result: carry the marker forward so the current key survives. */
export function commandFailureState(prev: CommandState, error: string): CommandState {
  return { error, successCount: prev.successCount ?? 0 };
}
