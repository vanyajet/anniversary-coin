/**
 * logger.ts
 *
 * Minimal, colour-coded console logger with section headers.
 * Uses ANSI escape codes — works in any modern terminal.
 */

const R = '\x1b[0m';   // reset
const B = '\x1b[1m';   // bold
const DIM = '\x1b[2m'; // dim
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';

export const log = {
  /** Informational message */
  info: (msg: string) => console.log(`  ${CYAN}ℹ${R}  ${msg}`),

  /** Success confirmation */
  success: (msg: string) => console.log(`  ${GREEN}✓${R}  ${msg}`),

  /** Non-fatal warning */
  warn: (msg: string) => console.log(`  ${YELLOW}⚠${R}  ${msg}`),

  /** Fatal error (program will exit after this) */
  error: (msg: string) => console.error(`  ${RED}✗${R}  ${msg}`),

  /** Prominent section divider */
  section: (title: string) => {
    const line = '─'.repeat(60);
    console.log(`\n${MAGENTA}${B}${line}${R}`);
    console.log(`${MAGENTA}${B}  ${title}${R}`);
    console.log(`${MAGENTA}${B}${line}${R}`);
  },

  /** Dimmed supplementary info (e.g. explorer links) */
  detail: (msg: string) => console.log(`  ${DIM}${msg}${R}`),

  /** Plain output with no prefix (for summary tables) */
  raw: (msg: string) => console.log(msg),
};

/** Format a token amount with comma thousands separators */
export function formatTokens(amount: bigint): string {
  return Number(amount).toLocaleString('en-US');
}
