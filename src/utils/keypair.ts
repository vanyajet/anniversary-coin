/**
 * keypair.ts
 *
 * Utilities for loading Solana Keypairs from environment variables.
 * Supports two serialization formats exported by common Solana tooling:
 *
 *  1. Byte-array JSON:  "[12,34,56,...,255]"   (Solana CLI default)
 *  2. Base58 string:    "5J3mBb..."             (Phantom / most wallets)
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * Parses a raw string into a Solana Keypair.
 * Throws a descriptive error if the format is unrecognised or the key is invalid.
 */
export function keypairFromString(raw: string): Keypair {
  const trimmed = raw.trim();

  try {
    if (trimmed.startsWith('[')) {
      // ── Format 1: JSON byte array ─────────────────────────────────────────
      const bytes: number[] = JSON.parse(trimmed);
      if (!Array.isArray(bytes) || bytes.length !== 64) {
        throw new Error(
          `Byte array must contain exactly 64 bytes; got ${Array.isArray(bytes) ? bytes.length : 'non-array'}.`,
        );
      }
      return Keypair.fromSecretKey(Uint8Array.from(bytes));
    } else {
      // ── Format 2: Base58-encoded secret key ───────────────────────────────
      const secretKey = bs58.decode(trimmed);
      if (secretKey.length !== 64) {
        throw new Error(
          `Base58 secret key must decode to 64 bytes; got ${secretKey.length}.`,
        );
      }
      return Keypair.fromSecretKey(secretKey);
    }
  } catch (err) {
    throw new Error(
      `Failed to parse keypair: ${(err as Error).message}\n` +
        'Accepted formats: JSON byte array ([12,34,...]) or base58 string.',
    );
  }
}

/**
 * Loads the deployer keypair from DEPLOYER_PRIVATE_KEY env variable.
 * Throws if the variable is missing or the key cannot be parsed.
 */
export function loadDeployerKeypair(): Keypair {
  const raw = process.env.DEPLOYER_PRIVATE_KEY;
  if (!raw || raw.trim() === '') {
    throw new Error(
      'DEPLOYER_PRIVATE_KEY is not set in .env.\n' +
        'Run "npm run generate-wallets" to create one, or export from Phantom.',
    );
  }
  return keypairFromString(raw);
}
