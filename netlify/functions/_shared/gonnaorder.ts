// Typed GonnaOrder client stub.
//
// Real endpoints + payloads will be plugged in when Ioustinos shares the
// exact call shapes (mint-voucher, top-up, get-balance, reconcile). For now
// this module exposes the surface the rest of the codebase will import so
// callers can be written against stable types.

export type GoVoucher = {
  code: string
  balance: number          // cents
  currency: 'EUR'
  storeId: string
}

export type GoTopupResult = {
  voucherCode: string
  previousBalance: number
  newBalance: number
  appliedAmount: number
  at: string               // ISO timestamp from GonnaOrder
  externalRef?: string
}

type GoClientOpts = {
  baseUrl: string
  apiKey: string
  dryRun?: boolean
}

function makeOpts(): GoClientOpts {
  const baseUrl = process.env.GONNAORDER_API_BASE
  const apiKey = process.env.GONNAORDER_API_KEY
  if (!baseUrl || !apiKey) {
    throw new Error('GonnaOrder: missing GONNAORDER_API_BASE / GONNAORDER_API_KEY')
  }
  return {
    baseUrl,
    apiKey,
    dryRun: process.env.CF_TOPUPS_DRY_RUN === 'true',
  }
}

/**
 * Mint a new voucher for an employee for a given vendor/store.
 *
 * Runs once per (employee, benefit assignment). Top-ups then replenish
 * balance on a schedule — see `topupVoucher`.
 */
export async function mintVoucher(args: {
  storeId: string
  employeeExternalRef: string
  initialBalance: number   // cents
}): Promise<GoVoucher> {
  const opts = makeOpts()
  void opts
  // TODO: wire real POST /vouchers call once the endpoint is provided.
  throw new Error('mintVoucher: not yet implemented — pending GonnaOrder endpoint spec')
}

/**
 * Top up an existing voucher's balance. MUST be idempotent per
 * (voucher, scheduled_for) — the caller is expected to store the attempt
 * in `benefit_topups` with that unique constraint.
 */
export async function topupVoucher(args: {
  voucherCode: string
  amount: number           // cents
  idempotencyKey: string   // `${assignment_id}:${scheduled_for}`
}): Promise<GoTopupResult> {
  const opts = makeOpts()
  void opts
  // TODO: wire real POST /vouchers/{code}/topup once provided.
  throw new Error('topupVoucher: not yet implemented — pending GonnaOrder endpoint spec')
}

/**
 * Fetch current voucher balance from GonnaOrder (source of truth).
 * Used by the reconciliation job.
 */
export async function getVoucherBalance(voucherCode: string): Promise<GoVoucher> {
  const opts = makeOpts()
  void opts
  void voucherCode
  throw new Error('getVoucherBalance: not yet implemented — pending GonnaOrder endpoint spec')
}
