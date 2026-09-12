/**
 * Article 18 — closed-ended XLS-65 vault + XLS-66 loan, full lifecycle on XRPL Devnet.
 *
 * Track 2 / Loaded. Every transaction is recorded to out/tx-log.json with its result code
 * and explorer link, including the ones we EXPECT to fail: the phase gates are the point.
 */
import { Wallet } from 'xrpl'
import { connect, fund, submit, nowRipple, created, sleep, txLog, flushLog, NET } from './lib.mjs'

const SUBSCRIPTION_SECS = Number(process.env.SUB_SECS ?? 150)
const INVESTMENT_SECS   = Number(process.env.INV_SECS ?? 330)   // >= 180 (kMinInvestmentPeriod)
const PAYMENT_INTERVAL  = 60
const PAYMENT_TOTAL     = 3

const banner = t => console.log(`\n${'='.repeat(70)}\n  ${t}\n${'='.repeat(70)}`)
const waitUntil = async (rippleTs, what) => {
  const ms = (rippleTs - nowRipple()) * 1000
  if (ms <= 0) return
  console.log(`\n… waiting ${Math.ceil(ms/1000)}s for ${what}`)
  await sleep(ms + 4000)
}

const c = await connect()

banner('0. Accounts')
const fundMgr  = await fund(c, 'fundMgr')   // owns the vault AND the loan broker
const lenderA  = await fund(c, 'lenderA')
const lenderB  = await fund(c, 'lenderB')
const borrower = await fund(c, 'borrower')

const T0 = nowRipple()
const SUBSCRIPTION_DATE = T0 + SUBSCRIPTION_SECS          // end of Subscription / start of Investment
const REDEMPTION_DATE   = SUBSCRIPTION_DATE + INVESTMENT_SECS  // start of Redemption
console.log(`\ntimeline (ripple epoch): now=${T0}  SubscriptionDate=${SUBSCRIPTION_DATE} (+${SUBSCRIPTION_SECS}s)  RedemptionDate=${REDEMPTION_DATE} (+${SUBSCRIPTION_SECS+INVESTMENT_SECS}s)`)

banner('1. VaultCreate — closed-ended (VaultKind 1)')
const vc = await submit(c, fundMgr, {
  TransactionType: 'VaultCreate', Account: fundMgr.address,
  Asset: { currency: 'XRP' }, WithdrawalPolicy: 1,
  VaultKind: 1, SubscriptionDate: SUBSCRIPTION_DATE, RedemptionDate: REDEMPTION_DATE,
  Data: Buffer.from('Article 18 — ELTIF-shaped closed-ended fund').toString('hex').toUpperCase(),
}, 'closed-ended vault, dates compressed to the event timeline')
if (!vc.ok) { console.log('FATAL: vault not created'); await c.disconnect(); process.exit(1) }
const VAULT = created(vc.meta, 'Vault')
console.log(`      VaultID ${VAULT}`)

const phase = async () => {
  const r = await c.request({ command: 'ledger_entry', index: VAULT })
  return r.result.node
}
const showVault = async tag => {
  const v = await phase()
  console.log(`      [vault ${tag}] AssetsTotal=${v.AssetsTotal} AssetsAvailable=${v.AssetsAvailable} LossUnrealized=${v.LossUnrealized ?? '0'}`)
  return v
}
await showVault('created')

banner('2. SUBSCRIPTION phase — deposits allowed, lending blocked')
await submit(c, lenderA, { TransactionType:'VaultDeposit', Account:lenderA.address, VaultID:VAULT, Amount:'40000000' }, 'lender A subscribes 40 XRP')
await submit(c, lenderB, { TransactionType:'VaultDeposit', Account:lenderB.address, VaultID:VAULT, Amount:'30000000' }, 'lender B subscribes 30 XRP')
await showVault('after subscription')

// The loan broker must exist before we can attempt a LoanSet in the wrong phase.
const lb = await submit(c, fundMgr, {
  TransactionType:'LoanBrokerSet', Account:fundMgr.address, VaultID:VAULT,
  DebtMaximum:'60000000', ManagementFeeRate:1000,
  CoverRateMinimum:10000, CoverRateLiquidation:50000,
}, 'loan broker, 10% cover minimum x 50% liquidation')
const BROKER = lb.ok ? created(lb.meta, 'LoanBroker') : null
console.log(`      LoanBrokerID ${BROKER}`)
if (BROKER) await submit(c, fundMgr, { TransactionType:'LoanBrokerCoverDeposit', Account:fundMgr.address, LoanBrokerID:BROKER, Amount:'6000000' }, 'first-loss cover 6 XRP')

// ---- GATE 1: lending during Subscription must be rejected
const mkLoan = () => ({
  TransactionType:'LoanSet', Account:fundMgr.address, LoanBrokerID:BROKER,
  Counterparty: borrower.address, PrincipalRequested:'20000000',
  InterestRate: 5000, PaymentInterval: PAYMENT_INTERVAL, PaymentTotal: PAYMENT_TOTAL,
  GracePeriod: 60,
})
const signedLoan = async () => {
  const prepared = await c.autofill(mkLoan())
  const first = fundMgr.sign(prepared)
  const { signLoanSetByCounterparty } = await import('xrpl')
  const both = signLoanSetByCounterparty(borrower, first.tx_blob)
  return both
}
if (BROKER) {
  try {
    const b = await signedLoan()
    const r = await c.submitAndWait(b.tx_blob)
    const code = r.result.meta.TransactionResult
    txLog.push({ at:new Date().toISOString(), note:'GATE: LoanSet during Subscription (expected reject)', type:'LoanSet', account:fundMgr.address, code, hash:r.result.hash, link:NET.explorerTx(r.result.hash) }); flushLog()
    console.log(`>> LoanSet (during Subscription)      ${code}   — GATE, expected rejection`)
    console.log(`      ${NET.explorerTx(r.result.hash)}`)
  } catch (e) {
    const code = e?.data?.error_message ?? e.message
    txLog.push({ at:new Date().toISOString(), note:'GATE: LoanSet during Subscription (expected reject)', type:'LoanSet', account:fundMgr.address, code, hash:null, link:null }); flushLog()
    console.log(`>> LoanSet (during Subscription)      ${code}   — GATE, expected rejection`)
  }
}

await waitUntil(SUBSCRIPTION_DATE, 'the INVESTMENT phase')

banner('3. INVESTMENT phase — lending allowed, deposits/withdrawals blocked')
// ---- GATE 2 & 3: deposit and withdraw during Investment must be rejected
await submit(c, lenderA, { TransactionType:'VaultDeposit', Account:lenderA.address, VaultID:VAULT, Amount:'5000000' }, 'GATE: deposit during Investment (expected reject)')
await submit(c, lenderA, { TransactionType:'VaultWithdraw', Account:lenderA.address, VaultID:VAULT, Amount:'5000000' }, 'GATE: withdraw during Investment (expected reject)')

// ---- the loan itself, double-signed
let LOAN = null
if (BROKER) {
  try {
    const b = await signedLoan()
    const r = await c.submitAndWait(b.tx_blob)
    const code = r.result.meta.TransactionResult
    LOAN = created(r.result.meta, 'Loan')
    txLog.push({ at:new Date().toISOString(), note:'origination, double-signed (broker + borrower)', type:'LoanSet', account:fundMgr.address, code, hash:r.result.hash, link:NET.explorerTx(r.result.hash) }); flushLog()
    console.log(`${code==='tesSUCCESS'?'OK ':'>> '}LoanSet (Investment)             ${code}   — 20 XRP, ${PAYMENT_TOTAL} payments of ${PAYMENT_INTERVAL}s`)
    console.log(`      ${NET.explorerTx(r.result.hash)}`)
    console.log(`      LoanID ${LOAN}`)
  } catch (e) { console.log('>> LoanSet (Investment) THREW:', e?.data?.error_message ?? e.message) }
}
await showVault('after drawdown')

if (LOAN) {
  const ln = (await c.request({ command:'ledger_entry', index:LOAN })).result.node
  console.log(`      [loan] Principal=${ln.PrincipalOutstanding} TotalValue=${ln.TotalValueOutstanding} Periodic=${ln.PeriodicPayment} Remaining=${ln.PaymentRemaining}`)
  for (let i = 1; i <= PAYMENT_TOTAL; i++) {
    const cur = (await c.request({ command:'ledger_entry', index:LOAN })).result.node
    const due = cur.NextPaymentDueDate
    const amount = String(Math.ceil(Number(cur.PeriodicPayment)))
    await waitUntil(due, `payment ${i} to fall due`)

    // A payment submitted after NextPaymentDueDate is rejected with tecEXPIRED unless
    // tfLoanLatePayment is set — see FEEDBACK.md issue 2. Devnet runs on wall-clock time,
    // so by the time the transaction is signed and validated we are routinely a few
    // seconds late. Decide the flag from the ledger, not from hope.
    const late = nowRipple() > due
    const flags = late ? { tfLoanLatePayment: true } : undefined
    await submit(c, borrower,
      { TransactionType:'LoanPay', Account:borrower.address, LoanID:LOAN, Amount:amount, ...(flags?{Flags:flags}:{}) },
      `repayment ${i}/${PAYMENT_TOTAL}${late ? ' (late -> tfLoanLatePayment)' : ' (on time)'}`)
    try {
      const l2 = (await c.request({ command:'ledger_entry', index:LOAN })).result.node
      console.log(`      [loan] Principal=${l2.PrincipalOutstanding} Remaining=${l2.PaymentRemaining}`)
    } catch { console.log('      [loan] closed'); break }
  }
}
await showVault('after repayment')

await waitUntil(REDEMPTION_DATE, 'the REDEMPTION phase')

banner('4. REDEMPTION phase — withdrawals allowed, new loans blocked')
// ---- GATE 4: new loan during Redemption must be rejected
if (BROKER) {
  try {
    const b = await signedLoan()
    const r = await c.submitAndWait(b.tx_blob)
    const code = r.result.meta.TransactionResult
    txLog.push({ at:new Date().toISOString(), note:'GATE: LoanSet during Redemption (expected reject)', type:'LoanSet', account:fundMgr.address, code, hash:r.result.hash, link:NET.explorerTx(r.result.hash) }); flushLog()
    console.log(`>> LoanSet (during Redemption)        ${code}   — GATE, expected rejection`)
  } catch (e) {
    const code = e?.data?.error_message ?? e.message
    txLog.push({ at:new Date().toISOString(), note:'GATE: LoanSet during Redemption (expected reject)', type:'LoanSet', account:fundMgr.address, code, hash:null, link:null }); flushLog()
    console.log(`>> LoanSet (during Redemption)        ${code}   — GATE, expected rejection`)
  }
}
await submit(c, lenderA, { TransactionType:'VaultWithdraw', Account:lenderA.address, VaultID:VAULT, Amount:'40000000' }, 'lender A redeems principal + yield')
await submit(c, lenderB, { TransactionType:'VaultWithdraw', Account:lenderB.address, VaultID:VAULT, Amount:'30000000' }, 'lender B redeems principal + yield')
await showVault('after redemption')

banner('Summary')
console.log(`vault   ${VAULT}`)
console.log(`broker  ${BROKER}`)
console.log(`loan    ${LOAN}`)
console.log(`\n${txLog.length} transactions recorded in out/tx-log.json`)
for (const t of txLog) console.log(`  ${(t.type+'                  ').slice(0,24)} ${(t.code+'                       ').slice(0,26)} ${t.note}`)
await c.disconnect()
