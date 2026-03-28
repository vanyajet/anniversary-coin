/**
 * distribute.ts
 *
 * Recovery / standalone distribution script.
 * Uses an existing mint (TOKEN_MINT_ADDRESS in .env) and distributes tokens
 * to all allocation wallets. Skips any wallet that already has the correct balance.
 *
 * Usage:
 *   npx ts-node src/distribute.ts
 *
 * Required .env:
 *   DEPLOYER_PRIVATE_KEY
 *   TOKEN_MINT_ADDRESS
 *   SOLANA_NETWORK
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { PublicKey } from '@solana/web3.js';
import {
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';

import { explorerUrl, getConnection, getNetwork } from './utils/connection';
import { loadDeployerKeypair } from './utils/keypair';
import { formatTokens, log } from './utils/logger';

const DECIMALS_FACTOR = 10n ** 9n;

const DISTRIBUTIONS = [
  {
    name:          'Anna',
    envKey:        'WALLET_ANNA',
    defaultWallet: 'DVS3MKunGmucdGowjd7aD2FKebdMwEmbaLb4LSpHj567',
    allocation:    '10%',
    tokens:        300_000_000n,
  },
  {
    name:          'Dev Fund',
    envKey:        'WALLET_DEV',
    defaultWallet: '4eRS2oRvWJCYdkhnCSroYgBbeep8fVfqSSqhuZG4KsZZ',
    allocation:    '10%',
    tokens:        300_000_000n,
  },
  {
    name:          'Airdrop',
    envKey:        'WALLET_AIRDROP',
    defaultWallet: 'u9Uv8ZkKV6kYmyZHY2Z1DcFL8hShvnEMPA9FtnqzFkm',
    allocation:    '20%',
    tokens:        600_000_000n,
  },
  {
    name:          'LP Reserve',
    envKey:        'WALLET_LP',
    defaultWallet: 'ECgnGXk2gviaGZHDdvEizXGfu7rsgYQLuCwSyJ98tMV6',
    allocation:    '60%',
    tokens:        1_800_000_000n,
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('\n');
  log.section('Anniversary Coin ($ANN) — Token Distribution');

  const network    = getNetwork();
  const deployer   = loadDeployerKeypair();
  const connection = getConnection();

  const mintAddressStr = (process.env.TOKEN_MINT_ADDRESS ?? '').trim();
  if (!mintAddressStr) {
    throw new Error('TOKEN_MINT_ADDRESS is not set in .env');
  }

  const mintPublicKey = new PublicKey(mintAddressStr);

  log.success(`Network:  ${network}`);
  log.success(`Deployer: ${deployer.publicKey.toBase58()}`);
  log.success(`Mint:     ${mintAddressStr}`);
  log.detail(`          ${explorerUrl(mintAddressStr, 'address', network)}`);

  log.section('Distributing Tokens');

  for (const dist of DISTRIBUTIONS) {
    const walletAddress = (process.env[dist.envKey] ?? '').trim() || dist.defaultWallet;
    const walletPubkey  = new PublicKey(walletAddress);
    const expectedAmount = dist.tokens * DECIMALS_FACTOR;

    log.raw('');
    log.info(`${dist.name} — ${dist.allocation} — ${formatTokens(dist.tokens)} ANN`);
    log.info(`  Wallet: ${walletAddress}`);

    // Check if ATA already exists and has the correct balance — skip if so
    const ataAddress = getAssociatedTokenAddressSync(mintPublicKey, walletPubkey);
    let alreadyMinted = false;
    try {
      const account = await getAccount(connection, ataAddress);
      if (account.amount >= expectedAmount) {
        log.success(`  Already funded (${formatTokens(account.amount / DECIMALS_FACTOR)} ANN) — skipping`);
        alreadyMinted = true;
      }
    } catch {
      // ATA doesn't exist yet — will create below
    }

    if (alreadyMinted) continue;

    // Create ATA (idempotent — safe to call even if it exists)
    let ataAddressStr: string;
    try {
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        deployer,
        mintPublicKey,
        walletPubkey,
      );
      ataAddressStr = ata.address.toBase58();
      log.success(`  ATA: ${ataAddressStr}`);
    } catch (err) {
      throw new Error(`Failed to create ATA for ${dist.name}: ${(err as Error).message}`);
    }

    // Brief pause to avoid RPC rate limits
    await sleep(2000);

    // Mint tokens
    try {
      const mintTxSig = await mintTo(
        connection,
        deployer,
        mintPublicKey,
        new PublicKey(ataAddressStr),
        deployer,
        expectedAmount,
      );
      log.success(`  Minted ${formatTokens(dist.tokens)} ANN`);
      log.detail(`    ${explorerUrl(mintTxSig, 'tx', network)}`);
    } catch (err) {
      throw new Error(`Failed to mint tokens to ${dist.name}: ${(err as Error).message}`);
    }

    // Pause before next wallet
    await sleep(2000);
  }

  log.raw('');
  log.section('Distribution Complete');
  log.success(`All wallets funded. Mint: ${mintAddressStr}`);
  log.detail(`  ${explorerUrl(mintAddressStr, 'address', network)}`);
}

main().catch(err => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
