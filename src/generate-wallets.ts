/**
 * generate-wallets.ts
 *
 * Generates 5 fresh Solana keypairs (Deployer, Anna, Dev, Airdrop, LP Reserve)
 * and saves each one as a JSON byte-array file under /wallets/.
 *
 * Usage:
 *   npm run generate-wallets
 *
 * Output:
 *   wallets/deployer.json   ← load this into DEPLOYER_PRIVATE_KEY in .env
 *   wallets/anna.json
 *   wallets/dev.json
 *   wallets/airdrop.json
 *   wallets/lp.json
 *
 * NOTE: The main create-token.ts script is fully independent of this helper.
 * You can skip this and paste Phantom-exported keys directly into .env instead.
 *
 * SECURITY: Keep the /wallets directory out of version control (.gitignore).
 *           Never share the JSON files — they contain private keys.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './utils/logger';

// ─── Wallet definitions ───────────────────────────────────────────────────────

const WALLETS = [
  { id: 'deployer', label: 'Deployer (pays fees, holds Mint Authority)' },
  { id: 'anna',     label: 'Anna (10% allocation — daily mint recipient)' },
  { id: 'dev',      label: 'Dev Fund (10% allocation)' },
  { id: 'airdrop',  label: 'Airdrop (20% allocation)' },
  { id: 'lp',       label: 'LP Reserve (60% allocation)' },
] as const;

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  const walletsDir = path.join(__dirname, '..', 'wallets');

  // Create /wallets directory if it doesn't exist
  if (!fs.existsSync(walletsDir)) {
    fs.mkdirSync(walletsDir, { recursive: true });
    log.success(`Created directory: ${walletsDir}`);
  }

  log.section('Generating Solana Keypairs');

  const generated: Array<{ id: string; publicKey: string; filePath: string }> = [];

  for (const wallet of WALLETS) {
    const keypair = Keypair.generate();
    const secretKeyArray = Array.from(keypair.secretKey);
    const filePath = path.join(walletsDir, `${wallet.id}.json`);

    // Save as a JSON byte array — compatible with `solana-keygen` and @solana/web3.js
    fs.writeFileSync(filePath, JSON.stringify(secretKeyArray, null, 2), 'utf8');

    generated.push({
      id: wallet.id,
      publicKey: keypair.publicKey.toBase58(),
      filePath,
    });

    log.success(`${wallet.label}`);
    log.info(`  Public Key:  ${keypair.publicKey.toBase58()}`);
    log.detail(`  Saved to:    ${filePath}`);
    console.log();
  }

  // ── Print .env snippet ─────────────────────────────────────────────────────
  log.section('Copy these public keys into your .env');

  const anna    = generated.find((w) => w.id === 'anna')!;
  const dev     = generated.find((w) => w.id === 'dev')!;
  const airdrop = generated.find((w) => w.id === 'airdrop')!;
  const lp      = generated.find((w) => w.id === 'lp')!;

  console.log(`WALLET_ANNA=${anna.publicKey}`);
  console.log(`WALLET_DEV=${dev.publicKey}`);
  console.log(`WALLET_AIRDROP=${airdrop.publicKey}`);
  console.log(`WALLET_LP=${lp.publicKey}`);
  console.log();

  // ── Print deployer loading instruction ────────────────────────────────────
  const deployer = generated.find((w) => w.id === 'deployer')!;
  log.section('Set DEPLOYER_PRIVATE_KEY in .env');
  log.info('Paste the byte array from wallets/deployer.json into DEPLOYER_PRIVATE_KEY.');
  log.info('Or run this command to read it:');
  console.log(`\n  cat ${deployer.filePath}\n`);

  log.warn('Keep /wallets/ private — these files contain secret keys!');
}

main();
