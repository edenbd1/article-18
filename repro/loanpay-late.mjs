import { Client, signLoanSetByCounterparty } from 'xrpl'
const RE=946684800, now=()=>Math.floor(Date.now()/1000)-RE, sleep=ms=>new Promise(r=>setTimeout(r,ms))
const c=new Client('wss://s.devnet.rippletest.net:51233'); await c.connect()
const {wallet:mgr}=await c.fundWallet(), {wallet:lp}=await c.fundWallet(), {wallet:bor}=await c.fundWallet()
const go=async(w,tx)=>{try{const r=await c.submitAndWait(tx,{autofill:true,wallet:w});return{code:r.result.meta.TransactionResult,meta:r.result.meta,hash:r.result.hash}}catch(e){return{code:(e?.data?.error_message??e.message)}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const SUB=now()+45, RED=SUB+500
let r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:'XRP'},WithdrawalPolicy:1,VaultKind:1,SubscriptionDate:SUB,RedemptionDate:RED}); const V=made(r.meta,'Vault')
await go(lp,{TransactionType:'VaultDeposit',Account:lp.address,VaultID:V,Amount:'60000000'})
r=await go(mgr,{TransactionType:'LoanBrokerSet',Account:mgr.address,VaultID:V,DebtMaximum:'50000000',ManagementFeeRate:1000,CoverRateMinimum:10000,CoverRateLiquidation:50000}); const B=made(r.meta,'LoanBroker')
await go(mgr,{TransactionType:'LoanBrokerCoverDeposit',Account:mgr.address,LoanBrokerID:B,Amount:'6000000'})
await sleep((SUB-now()+6)*1000)
const prep=await c.autofill({TransactionType:'LoanSet',Account:mgr.address,LoanBrokerID:B,Counterparty:bor.address,PrincipalRequested:'20000000',InterestRate:5000,PaymentInterval:60,PaymentTotal:3,GracePeriod:60})
const lr=await c.submitAndWait(signLoanSetByCounterparty(bor,mgr.sign(prep).tx_blob).tx_blob)
const L=made(lr.result.meta,'Loan')
const ln=(await c.request({command:'ledger_entry',index:L})).result.node
const per=Math.ceil(Number(ln.PeriodicPayment))
console.log(`LoanSet ok | periodic ${per} | NextPaymentDueDate ${ln.NextPaymentDueDate} | GracePeriod ${ln.GracePeriod ?? 'n/a'} | now ${now()}`)
const w=ln.NextPaymentDueDate-now()+12
console.log(`\n… waiting ${w}s to be genuinely LATE (past NextPaymentDueDate)`); await sleep(w*1000)
console.log(`now ${now()} vs due ${ln.NextPaymentDueDate} -> late by ${now()-ln.NextPaymentDueDate}s\n`)
console.log('  periodic, NO flag           :', (await go(bor,{TransactionType:'LoanPay',Account:bor.address,LoanID:L,Amount:String(per)})).code)
console.log('  periodic + tfLoanLatePayment:', (await go(bor,{TransactionType:'LoanPay',Account:bor.address,LoanID:L,Amount:String(per)})).code === 'x' ? '' : (await go(bor,{TransactionType:'LoanPay',Account:bor.address,LoanID:L,Amount:String(per),Flags:{tfLoanLatePayment:true}})).code)
try{const x=(await c.request({command:'ledger_entry',index:L})).result.node; console.log(`  loan now: Principal=${x.PrincipalOutstanding} Remaining=${x.PaymentRemaining}`)}catch{console.log('  loan CLOSED')}
await c.disconnect()
