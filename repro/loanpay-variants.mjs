import { Client, Wallet, signLoanSetByCounterparty } from 'xrpl'
const RE = 946684800, now = () => Math.floor(Date.now()/1000) - RE
const sleep = ms => new Promise(r=>setTimeout(r,ms))
const c = new Client('wss://s.devnet.rippletest.net:51233'); await c.connect()
const si = await c.request({command:'server_info'}); console.log('build', si.result.info.build_version)
const { wallet: mgr } = await c.fundWallet()
const { wallet: lp }  = await c.fundWallet()
const { wallet: bor } = await c.fundWallet()
const go = async (w,tx) => { try { const r = await c.submitAndWait(tx,{autofill:true,wallet:w}); return {code:r.result.meta.TransactionResult, meta:r.result.meta, hash:r.result.hash} } catch(e){ return {code:(e?.data?.error_message ?? e.message)} } }
const made = (m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex

const SUB = now()+45, RED = SUB+300
let r = await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:'XRP'},WithdrawalPolicy:1,VaultKind:1,SubscriptionDate:SUB,RedemptionDate:RED})
console.log('VaultCreate', r.code); const V = made(r.meta,'Vault')
console.log('VaultDeposit', (await go(lp,{TransactionType:'VaultDeposit',Account:lp.address,VaultID:V,Amount:'60000000'})).code)
r = await go(mgr,{TransactionType:'LoanBrokerSet',Account:mgr.address,VaultID:V,DebtMaximum:'50000000',ManagementFeeRate:1000,CoverRateMinimum:10000,CoverRateLiquidation:50000})
console.log('LoanBrokerSet', r.code); const B = made(r.meta,'LoanBroker')
console.log('CoverDeposit', (await go(mgr,{TransactionType:'LoanBrokerCoverDeposit',Account:mgr.address,LoanBrokerID:B,Amount:'6000000'})).code)

console.log(`\n… waiting ${SUB-now()+6}s for INVESTMENT`); await sleep((SUB-now()+6)*1000)

const prep = await c.autofill({TransactionType:'LoanSet',Account:mgr.address,LoanBrokerID:B,Counterparty:bor.address,
  PrincipalRequested:'20000000',InterestRate:5000,PaymentInterval:60,PaymentTotal:1,GracePeriod:60})
const both = signLoanSetByCounterparty(bor, mgr.sign(prep).tx_blob)
const lr = await c.submitAndWait(both.tx_blob)
console.log('LoanSet', lr.result.meta.TransactionResult); const L = made(lr.result.meta,'Loan')
const ln = (await c.request({command:'ledger_entry',index:L})).result.node
console.log('  PeriodicPayment', ln.PeriodicPayment, '| TotalValueOutstanding', ln.TotalValueOutstanding, '| PaymentRemaining', ln.PaymentRemaining)
console.log('  NextPaymentDueDate', ln.NextPaymentDueDate, '| now', now(), '| RedemptionDate', RED)

const periodic = Math.ceil(Number(ln.PeriodicPayment))
const variants = [
  ['exact PeriodicPayment (ceil)',            { Amount: String(periodic) }],
  ['1 XRP, well under periodic',              { Amount: '1000000' }],
  ['8 XRP, over periodic, no flag',           { Amount: '8000000' }],
  ['8 XRP + tfLoanOverpayment',               { Amount: '8000000', Flags:{tfLoanOverpayment:true} }],
  ['TotalValueOutstanding + tfLoanFullPayment',{ Amount: String(Math.ceil(Number(ln.TotalValueOutstanding))), Flags:{tfLoanFullPayment:true} }],
]
console.log('\n--- LoanPay variants, all inside the Investment phase ---')
for (const [label, extra] of variants) {
  const res = await go(bor, { TransactionType:'LoanPay', Account:bor.address, LoanID:L, ...extra })
  console.log(' ', label.padEnd(44), res.code)
}
console.log('\n… now waiting past NextPaymentDueDate and retrying the exact amount')
const wait = Math.max(0, ln.NextPaymentDueDate - now() + 5)
if (wait>0) await sleep(wait*1000)
console.log('  after due date, exact periodic:', (await go(bor,{TransactionType:'LoanPay',Account:bor.address,LoanID:L,Amount:String(periodic)})).code)
await c.disconnect()
