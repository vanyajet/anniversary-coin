/**
 * connection.ts
 *
 * Creates and exports a Solana Connection based on the SOLANA_NETWORK
 * and optional RPC_URL environment variables.
 */

import { Connection, clusterApiUrl } from '@solana/web3.js';

export type Network = 'devnet' | 'mainnet-beta';

/**
 * Reads SOLANA_NETWORK from env and validates it.
 * Defaults to 'devnet' if not set.
 */
export function getNetwork(): Network {
  const raw = process.env.SOLANA_NETWORK ?? 'devnet';
  if (raw !== 'devnet' && raw !== 'mainnet-beta') {
    throw new Error(
      `Invalid SOLANA_NETWORK="${raw}". ` +
        'Must be "devnet" or "mainnet-beta".',
    );
  }
  return raw;
}

/**
 * Returns the RPC endpoint URL for the current network.
 * Prefers RPC_URL env var; falls back to the public cluster default.
 */
export function getRpcUrl(): string {
  if (process.env.RPC_URL) return process.env.RPC_URL;
  return clusterApiUrl(getNetwork());
}

/**
 * Creates a Solana Connection with 'confirmed' commitment.
 */
export function getConnection(): Connection {
  const url = getRpcUrl();
  return new Connection(url, 'confirmed');
}

/**
 * Builds a Solana Explorer URL for an address or transaction.
 */
export function explorerUrl(
  value: string,
  type: 'address' | 'tx',
  network: Network,
): string {
  const base = `https://explorer.solana.com/${type}/${value}`;
  return network === 'mainnet-beta' ? base : `${base}?cluster=${network}`;
}
