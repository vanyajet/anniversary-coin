/**
 * create-token.ts
 *
 * Main deployment script for the Anniversary Coin ($ANN) SPL token.
 *
 * Execution order:
 *   1. Load configuration from .env
 *   2. Connect to Solana (devnet or mainnet-beta)
 *   3. Check deployer SOL balance; auto-airdrop on devnet if < 2 SOL
 *   4. Create the SPL Token Mint + Metaplex metadata in one transaction
 *   5. Revoke Freeze Authority (Mint Authority is intentionally retained)
 *   6. For each distribution wallet: create ATA and mint allocated tokens
 *   7. Print a full deployment summary with explorer links
 *
 * Usage:
 *   npm run create-token
 *
 * Prerequisites:
 *   - DEPLOYER_PRIVATE_KEY set in .env
 *   - SOLANA_NETWORK set to "devnet" or "mainnet-beta"
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import {
  AuthorityType,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
} from '@solana/spl-token';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  generateSigner,
  keypairIdentity,
  percentAmount,
  some,
} from '@metaplex-foundation/umi';
import {
  createV1,
  findMetadataPda,
  mplTokenMetadata,
  TokenStandard,
} from '@metaplex-foundation/mpl-token-metadata';
import {
  fromWeb3JsKeypair,
  toWeb3JsPublicKey,
} from '@metaplex-foundation/umi-web3js-adapters';
import bs58 from 'bs58';

import { explorerUrl, getConnection, getNetwork, getRpcUrl } from './utils/connection';
import { loadDeployerKeypair } from './utils/keypair';
import { formatTokens, log } from './utils/logger';

// ─── Token Configuration ──────────────────────────────────────────────────────

const TOKEN_NAME     = 'Anniversary Coin';
const TOKEN_SYMBOL   = 'ANN';
const TOKEN_DECIMALS = 9;
const TOKEN_URI      =
  'https://emerald-fancy-sparrow-826.mypinata.cloud/ipfs/bafkreibxlhrbqqliyqgp3ijbmrbhx26ta6qimv6daw3pfpclbtdd5ewq34';

/** Multiplier to convert whole ANN to the smallest on-chain unit (lamports equivalent) */
const DECIMALS_FACTOR = 10n ** BigInt(TOKEN_DECIMALS);

/** Total supply in whole ANN tokens */
const TOTAL_SUPPLY_ANN = 3_000_000_000n;

// ─── Distribution Plan ────────────────────────────────────────────────────────

interface Distribution {
  /** Human-readable label for logging */
  name: string;
  /** .env key that overrides defaultWallet */
  envKey: string;
  /** Hard-coded default public key */
  defaultWallet: string;
  /** Percentage label for display */
  allocation: string;
  /** Whole-token amount to mint (BigInt, will be scaled by DECIMALS_FACTOR) */
  tokens: bigint;
}

/**
 * Distribution wallets and allocations.
 * The defaultWallet values match the spec exactly.
 * Override any wallet via the corresponding .env key without touching code.
 */
const DISTRIBUTIONS: Distribution[] = [
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Converts a UMI signature (Uint8Array) to a base58 transaction ID string */
function sigToBase58(sig: Uint8Array): string {
  return bs58.encode(Buffer.from(sig));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n');
  log.section(`Anniversary Coin ($ANN) — Token Deployment`);
  log.raw(`  Token:        ${TOKEN_NAME} | ${TOKEN_SYMBOL}`);
  log.raw(`  Decimals:     ${TOKEN_DECIMALS}`);
  log.raw(`  Total Supply: ${formatTokens(TOTAL_SUPPLY_ANN)} ANN`);
  log.raw(`  Metadata URI: ${TOKEN_URI}`);

  // ── Step 1: Configuration ──────────────────────────────────────────────────
  log.section('Step 1 — Loading Configuration');

  const network  = getNetwork();
  const deployer = loadDeployerKeypair();
  const rpcUrl   = getRpcUrl();

  log.success(`Network:   ${network}`);
  log.success(`RPC:       ${rpcUrl}`);
  log.success(`Deployer:  ${deployer.publicKey.toBase58()}`);
  log.detail(`           ${explorerUrl(deployer.publicKey.toBase58(), 'address', network)}`);

  // ── Step 2: Connection ────────────────────────────────────────────────────
  log.section('Step 2 — Connecting to Solana');

  const connection = getConnection();
  let balance = await connection.getBalance(deployer.publicKey);
  log.success(`Connection established`);
  log.info(`Deployer balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  log.detail(`  (This is the wallet in DEPLOYER_PRIVATE_KEY — not your Phantom unless you exported that key)`);

  // ── Step 3: Auto-airdrop on devnet ────────────────────────────────────────
  log.section('Step 3 — Balance Check');

  if (network === 'devnet' && balance < 0.05 * LAMPORTS_PER_SOL) {
    log.warn(`Balance too low for deployment. Requesting devnet airdrop...`);

    try {
      const sig = await connection.requestAirdrop(
        deployer.publicKey,
        LAMPORTS_PER_SOL,
      );

      // Use the modern blockhash-based confirmation strategy
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        'confirmed',
      );

      balance = await connection.getBalance(deployer.publicKey);
      log.success(`Airdrop received! New balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    } catch (err) {
      if (balance > 0) {
        log.warn(`Airdrop failed (${(err as Error).message}). Proceeding with ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL.`);
      } else {
        throw new Error(
          `Deployer wallet has 0 SOL and the devnet airdrop failed.\n` +
          `Deployer address: ${deployer.publicKey.toBase58()}\n` +
          `Fund it at: https://faucet.solana.com\n` +
          `Or transfer SOL from your Phantom wallet to this address.`,
        );
      }
    }
  } else if (network === 'mainnet-beta' && balance < 0.1 * LAMPORTS_PER_SOL) {
    throw new Error(
      `Deployer balance too low for mainnet (${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL). ` +
        'Ensure at least 0.1 SOL to cover transaction fees and rent.',
    );
  } else {
    log.success(`Balance sufficient: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  }

  // ── Step 4: Create Mint + Metadata via Metaplex UMI ──────────────────────
  log.section('Step 4 — Creating Token Mint + Metaplex Metadata');
  log.info('Using Metaplex mpl-token-metadata createV1 (fungible token standard)');
  log.info('This creates the SPL Token Mint and the Metadata PDA in one transaction...');

  // Set up UMI with the Token Metadata plugin and deployer as identity
  const umi = createUmi(rpcUrl).use(mplTokenMetadata());
  const umiKeypair = fromWeb3JsKeypair(deployer);
  umi.use(keypairIdentity(umiKeypair));

  // Generate a fresh keypair that will become the token mint address
  const mintSigner = generateSigner(umi);
  log.info(`Mint address (pre-generated): ${mintSigner.publicKey}`);

  let createTxSig: string;
  try {
    const { signature } = await createV1(umi, {
      // The mint signer: UMI will call InitializeMint2 for us
      mint:                 mintSigner,
      // Deployer becomes the mint authority (intentionally NOT revoked per spec)
      authority:            umi.identity,
      name:                 TOKEN_NAME,
      symbol:               TOKEN_SYMBOL,
      uri:                  TOKEN_URI,
      // 0% royalty — standard for utility/memecoin fungible tokens
      sellerFeeBasisPoints: percentAmount(0),
      // Token standard: Fungible (not NFT, not semi-fungible)
      tokenStandard:        TokenStandard.Fungible,
      // Decimals: wrapped in Option<number> as required by the UMI instruction
      decimals:             some(TOKEN_DECIMALS),
      // Metadata can be updated by the authority (useful for future branding tweaks)
      isMutable:            true,
    }).sendAndConfirm(umi, {
      send:    { commitment: 'confirmed' },
      confirm: { commitment: 'confirmed' },
    });

    createTxSig = sigToBase58(signature);
  } catch (err) {
    throw new Error(
      `Mint + Metadata creation failed: ${(err as Error).message}\n` +
        'Common causes: insufficient SOL balance, RPC rate limits, or network congestion.\n' +
        'Check your balance and try again.',
    );
  }

  // Convert UMI types to web3.js types for subsequent spl-token operations
  const mintPublicKey = toWeb3JsPublicKey(mintSigner.publicKey);

  // Derive the Metaplex metadata PDA address for display
  const [metadataPdaUmi] = findMetadataPda(umi, { mint: mintSigner.publicKey });
  const metadataAddress = toWeb3JsPublicKey(metadataPdaUmi);

  log.success(`Mint created:     ${mintPublicKey.toBase58()}`);
  log.detail(`  ${explorerUrl(mintPublicKey.toBase58(), 'address', network)}`);
  log.success(`Metadata PDA:     ${metadataAddress.toBase58()}`);
  log.success(`Create Tx:        ${createTxSig}`);
  log.detail(`  ${explorerUrl(createTxSig, 'tx', network)}`);

  // ── Step 5: Revoke Freeze Authority ──────────────────────────────────────
  log.section('Step 5 — Revoking Freeze Authority');
  log.info('Mint Authority is RETAINED by deployer (required for daily-mint.ts)');
  log.info('Revoking Freeze Authority — no account freezing needed for this token...');

  let freezeRevokeTxSig: string;
  try {
    freezeRevokeTxSig = await setAuthority(
      connection,
      deployer,           // payer
      mintPublicKey,      // the mint account
      deployer,           // current freeze authority (set by createV1 to deployer)
      AuthorityType.FreezeAccount,
      null,               // null = permanently revoke
    );
  } catch (err) {
    throw new Error(
      `Failed to revoke freeze authority: ${(err as Error).message}`,
    );
  }

  log.success(`Freeze authority revoked`);
  log.detail(`  ${explorerUrl(freezeRevokeTxSig, 'tx', network)}`);

  // ── Step 6: Distribute Tokens ─────────────────────────────────────────────
  log.section('Step 6 — Distributing Tokens to Allocation Wallets');

  // Collected for the final summary table
  const results: Array<{
    name: string;
    allocation: string;
    tokens: bigint;
    wallet: string;
    ata: string;
    mintTxSig: string;
  }> = [];

  for (const dist of DISTRIBUTIONS) {
    const walletAddress = (process.env[dist.envKey] ?? '').trim() || dist.defaultWallet;
    const tokenAmount   = dist.tokens * DECIMALS_FACTOR; // scale to smallest units

    log.raw('');
    log.info(`${dist.name} — ${dist.allocation} — ${formatTokens(dist.tokens)} ANN`);
    log.info(`  Wallet: ${walletAddress}`);

    let walletPubkey: PublicKey;
    try {
      walletPubkey = new PublicKey(walletAddress);
    } catch {
      throw new Error(
        `Invalid public key for ${dist.name}: "${walletAddress}". ` +
          `Check ${dist.envKey} in .env.`,
      );
    }

    // Create the Associated Token Account if it doesn't exist yet.
    // getOrCreateAssociatedTokenAccount is idempotent — safe to call multiple times.
    let ataAddress: string;
    try {
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        deployer,      // payer for ATA creation
        mintPublicKey,
        walletPubkey,
      );
      ataAddress = ata.address.toBase58();
      log.success(`  ATA: ${ataAddress}`);
    } catch (err) {
      throw new Error(
        `Failed to create ATA for ${dist.name}: ${(err as Error).message}`,
      );
    }

    // Mint the allocated amount to the ATA.
    // mintTo uses deployer as the mint authority.
    let mintTxSig: string;
    try {
      mintTxSig = await mintTo(
        connection,
        deployer,            // payer
        mintPublicKey,       // token mint
        new PublicKey(ataAddress), // destination ATA
        deployer,            // mint authority
        tokenAmount,         // BigInt amount in smallest units
      );
      log.success(`  Minted ${formatTokens(dist.tokens)} ANN`);
      log.detail(`    ${explorerUrl(mintTxSig, 'tx', network)}`);
    } catch (err) {
      throw new Error(
        `Failed to mint tokens to ${dist.name}: ${(err as Error).message}`,
      );
    }

    results.push({
      name:       dist.name,
      allocation: dist.allocation,
      tokens:     dist.tokens,
      wallet:     walletAddress,
      ata:        ataAddress,
      mintTxSig,
    });
  }

  // ── Step 7: Deployment Summary ─────────────────────────────────────────────
  log.section('Deployment Complete — Summary');

  const border = '═'.repeat(76);
  log.raw(`\n  ${border}`);
  log.raw(`  TOKEN MINT     ${mintPublicKey.toBase58()}`);
  log.raw(`  METADATA PDA   ${metadataAddress.toBase58()}`);
  log.raw(`  NETWORK        ${network}`);
  log.raw(`  EXPLORER       ${explorerUrl(mintPublicKey.toBase58(), 'address', network)}`);
  log.raw(`  ${border}`);

  log.raw(`\n  ${'WALLET'.padEnd(12)} ${'ALLOCATION'.padEnd(8)} ${'AMOUNT (ANN)'.padStart(18)}   ATA`);
  log.raw(`  ${'─'.repeat(72)}`);
  for (const r of results) {
    log.raw(
      `  ${r.name.padEnd(12)} ${r.allocation.padEnd(8)} ${formatTokens(r.tokens).padStart(18)}   ${r.ata}`,
    );
    log.raw(`  ${''.padEnd(40)}tx: ${explorerUrl(r.mintTxSig, 'tx', network)}`);
  }
  log.raw(`  ${border}`);

  // Print the .env snippet so the user can immediately update their config
  log.raw(`\n  ── Add to .env ────────────────────────────────────────────`);
  log.raw(`  TOKEN_MINT_ADDRESS=${mintPublicKey.toBase58()}`);
  log.raw(`  ───────────────────────────────────────────────────────────\n`);

  log.success(
    'Token created and fully distributed. ' +
      'Mint Authority retained — run daily-mint.ts to start minting.',
  );
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

main().catch((err: unknown) => {
  log.error(`\nDeployment failed: ${(err as Error).message}`);
  // Print stack trace only in DEBUG mode to keep normal output clean
  if (process.env.DEBUG === 'true') {
    console.error((err as Error).stack);
  }
  process.exit(1);
});
