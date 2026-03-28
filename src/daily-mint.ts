/**
 * daily-mint.ts
 *
 * Mints exactly 1 ANN token to Anna's wallet.
 * Designed to be invoked by a cron job (system crontab or node-cron).
 *
 * Required .env variables:
 *   TOKEN_MINT_ADDRESS  — the mint address printed by create-token.ts
 *   DEPLOYER_PRIVATE_KEY — the deployer keypair (holds Mint Authority)
 *   SOLANA_NETWORK      — "devnet" or "mainnet-beta"
 *
 * Optional .env variables:
 *   WALLET_ANNA         — Anna's public key (falls back to the hard-coded default)
 *   RPC_URL             — custom RPC endpoint
 *
 * Usage (manual):
 *   npm run daily-mint
 *
 * Usage (system crontab — fire at midnight UTC every day):
 *   0 0 * * * cd /path/to/anniversary-coin && npx ts-node src/daily-mint.ts >> logs/daily-mint.log 2>&1
 *
 * Usage (node-cron inside a long-running process):
 *   import cron from 'node-cron';
 *   cron.schedule('0 0 * * *', () => { require('./daily-mint'); });
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { explorerUrl, getConnection, getNetwork } from './utils/connection';
import { loadDeployerKeypair } from './utils/keypair';
import { log } from './utils/logger';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Anna's default wallet — can be overridden with WALLET_ANNA in .env */
const ANNA_DEFAULT_WALLET = 'DVS3MKunGmucdGowjd7aD2FKebdMwEmbaLb4LSpHj567';

/** 1 ANN expressed in the smallest on-chain unit (decimals = 9) */
const ONE_ANN_LAMPORTS = 1_000_000_000n; // 1 × 10^9

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = new Date();
  const timestamp = startTime.toISOString();

  log.raw(`\n[${ timestamp }] anniversary-coin daily-mint — starting`);

  // ── Load configuration ─────────────────────────────────────────────────────
  const mintAddress = (process.env.TOKEN_MINT_ADDRESS ?? '').trim();
  if (!mintAddress) {
    throw new Error(
      'TOKEN_MINT_ADDRESS is not set in .env.\n' +
        'Run "npm run create-token" first, then add the printed mint address to .env.',
    );
  }

  const annaWallet = (process.env.WALLET_ANNA ?? '').trim() || ANNA_DEFAULT_WALLET;
  const network    = getNetwork();

  // Validate public keys early to surface typos before making any RPC calls
  let mintPublicKey: PublicKey;
  let annaPubkey: PublicKey;
  try {
    mintPublicKey = new PublicKey(mintAddress);
  } catch {
    throw new Error(`TOKEN_MINT_ADDRESS is not a valid Solana public key: "${mintAddress}"`);
  }
  try {
    annaPubkey = new PublicKey(annaWallet);
  } catch {
    throw new Error(`WALLET_ANNA is not a valid Solana public key: "${annaWallet}"`);
  }

  log.info(`Network:  ${network}`);
  log.info(`Mint:     ${mintAddress}`);
  log.info(`To:       ${annaWallet} (Anna)`);
  log.info(`Amount:   1 ANN (${ONE_ANN_LAMPORTS.toLocaleString()} smallest units)`);

  // ── Connect ────────────────────────────────────────────────────────────────
  const connection = getConnection();
  const deployer   = loadDeployerKeypair();

  log.info(`Deployer: ${deployer.publicKey.toBase58()}`);

  // ── Get or create Anna's ATA ───────────────────────────────────────────────
  // idempotent: no-ops if the ATA already exists
  let ataAddress: string;
  try {
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      deployer,      // payer for ATA rent if it needs to be created
      mintPublicKey,
      annaPubkey,
    );
    ataAddress = ata.address.toBase58();
  } catch (err) {
    throw new Error(`Failed to get/create Anna's ATA: ${(err as Error).message}`);
  }

  // ── Mint 1 ANN ────────────────────────────────────────────────────────────
  let txSig: string;
  try {
    txSig = await mintTo(
      connection,
      deployer,                   // payer
      mintPublicKey,              // token mint
      new PublicKey(ataAddress),  // destination: Anna's ATA
      deployer,                   // mint authority (deployer)
      ONE_ANN_LAMPORTS,           // 1 ANN in smallest units
    );
  } catch (err) {
    throw new Error(`mintTo failed: ${(err as Error).message}`);
  }

  // ── Log success ───────────────────────────────────────────────────────────
  const elapsed = Date.now() - startTime.getTime();
  log.success(`Minted 1 ANN to Anna's wallet`);
  log.info(`ATA:      ${ataAddress}`);
  log.info(`Tx:       ${txSig}`);
  log.info(`Explorer: ${explorerUrl(txSig, 'tx', network)}`);
  log.info(`Duration: ${elapsed}ms`);
  log.raw(`[${ new Date().toISOString() }] daily-mint complete\n`);
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

main().catch((err: unknown) => {
  const message = (err as Error).message ?? String(err);
  log.error(`daily-mint failed: ${message}`);
  if (process.env.DEBUG === 'true') {
    console.error((err as Error).stack);
  }
  // Exit code 1 causes cron / process managers to flag the failure
  process.exit(1);
});
