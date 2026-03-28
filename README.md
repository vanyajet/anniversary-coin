# Anniversary Coin ($ANN) — Deployment Scripts

TypeScript scripts for creating and distributing the **Anniversary Coin** SPL token on Solana.

| Property | Value |
|---|---|
| Name | Anniversary Coin |
| Symbol | `$ANN` |
| Decimals | 9 |
| Total Supply | 3,000,000,000 |
| Standard | SPL Token (classic Token Program) |
| Metadata | Metaplex Token Metadata v3 |

---

## Project Structure

```
anniversary-coin/
├── src/
│   ├── utils/
│   │   ├── connection.ts       # Solana connection + network helpers
│   │   ├── keypair.ts          # Keypair loading (byte array or base58)
│   │   └── logger.ts           # Colour-coded console logger
│   ├── generate-wallets.ts     # (Optional) Generate 5 fresh keypairs
│   ├── create-token.ts         # MAIN: create mint + metadata + distribute
│   └── daily-mint.ts           # Cron script: mint 1 ANN/day to Anna
├── wallets/                    # Gitignored — keypair JSON files
├── .env                        # Your secrets (never commit)
├── .env.example                # Template with all variables documented
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9

---

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` — the only required secrets are:

```
SOLANA_NETWORK=devnet          # devnet for testing
DEPLOYER_PRIVATE_KEY=          # your deployer keypair (see below)
```

The distribution wallet addresses are pre-filled with the spec defaults. Override them if needed.

### 3. Set Up Your Deployer Wallet

**Option A — Generate a fresh wallet (recommended for testing):**

```bash
npm run generate-wallets
```

This writes 5 keypairs to `/wallets/`. Copy the byte-array content of
`wallets/deployer.json` into `DEPLOYER_PRIVATE_KEY` in `.env`.

**Option B — Use an existing Phantom wallet:**

Export your private key from Phantom → Settings → Export Private Key.
Paste the base58 string directly as `DEPLOYER_PRIVATE_KEY`:

```
DEPLOYER_PRIVATE_KEY=5J3mBbCHbJhNZgj3Y...
```

Both formats are supported.

---

## Usage

### Step 1 (Optional): Generate Wallets

```bash
npm run generate-wallets
```

Generates 5 keypairs and prints public keys. Skip this if you already have wallets.

---

### Step 2: Deploy the Token

```bash
npm run create-token
```

What this does, in order:

1. Loads deployer keypair and connects to Solana
2. Checks SOL balance — auto-airdrops 2 SOL on devnet if balance < 2 SOL
3. Creates the SPL Token Mint + Metaplex metadata in one transaction
4. Revokes Freeze Authority (Mint Authority is **retained** for daily minting)
5. Creates ATAs and mints the initial 3B supply across 4 wallets:

| Wallet | Allocation | Amount |
|---|---|---|
| Anna | 10% | 300,000,000 ANN |
| Dev Fund | 10% | 300,000,000 ANN |
| Airdrop | 20% | 600,000,000 ANN |
| LP Reserve | 60% | 1,800,000,000 ANN |

6. Prints a full summary with Solana Explorer links

**After it runs**, copy `TOKEN_MINT_ADDRESS` from the output into your `.env`:

```
TOKEN_MINT_ADDRESS=<printed mint address>
```

---

### Step 3: Daily Mint (Cron)

```bash
npm run daily-mint
```

Mints exactly **1 ANN** (= 1 × 10⁹ smallest units) to Anna's wallet.

**Set up as a system cron job (midnight UTC daily):**

```bash
crontab -e
```

Add this line (adjust path):

```
0 0 * * * cd /path/to/anniversary-coin && npx ts-node src/daily-mint.ts >> logs/daily-mint.log 2>&1
```

Make sure `.env` is present in the project root so it's picked up at runtime.

---

## Switching from Devnet to Mainnet

This is a **single line change** in `.env`:

```diff
- SOLANA_NETWORK=devnet
+ SOLANA_NETWORK=mainnet-beta
```

> **Mainnet checklist:**
> - Use a dedicated RPC endpoint (set `RPC_URL` to QuickNode / Helius / Triton)
> - Ensure deployer has ≥ 0.1 SOL to cover fees and rent
> - Double-check all wallet addresses in `.env`
> - Run `npm run create-token` once — do **not** re-run it for the same token

---

## Debugging

Enable verbose error output:

```
DEBUG=true npm run create-token
```

---

## Technical Notes

- **Mint Authority** is intentionally **not** revoked. `daily-mint.ts` needs it.
- **Freeze Authority** is revoked immediately after mint creation (Step 5 of `create-token.ts`).
- All token amounts use `BigInt` — the 3B supply × 10⁹ decimals exceeds `Number.MAX_SAFE_INTEGER`.
- Metadata is stored in a Metaplex **Metadata PDA** (separate account, not Token-2022 extension), giving maximum wallet and DEX compatibility.
- `createV1` from `@metaplex-foundation/mpl-token-metadata` v3 is used instead of the deprecated `CreateMetadataAccountV3`.

---

## Security

- Never commit `.env` or the `/wallets` directory.
- Both are listed in `.gitignore`.
- On mainnet, consider using a hardware wallet for the deployer and only using the hot keypair for the daily cron.
