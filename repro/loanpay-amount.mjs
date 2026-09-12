import { Client, signLoanSetByCounterparty } from 'xrpl'
const RE=946684800, now=()=>Math.floor(Date.now()/1000)-RE, sleep=ms=>new Promise(r=>setTimeout(r,ms))
const c = new Client('wss://s.devnet.rippletest.net:51233'); await c.connect()
const {wallet:mgr}=await c.fundWallet(), {wallet:lp}=await c.fundWallet(), {wallet:bor}=await c.fundWallet()
const go=async(w,tx)=>{try{const r=await c.submitAndWait(tx,{autofill:true,wallet:w});return{code:r.result.meta.TransactionResult,meta:r.result.meta}}catch(e){return{code:(e?.data?.error_message??e.message)}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const SUB=now()+45, RED=SUB+400
let r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:'XRP'},WithdrawalPolicy:1,VaultKind:1,SubscriptionDate:SUB,RedemptionDate:RED}); const V=made(r.meta,'Vault')
await go(lp,{TransactionType:'VaultDeposit',Account:lp.address,VaultID:V,Amount:'60000000'})
r=await go(mgr,{TransactionType:'LoanBrokerSet',Account:mgr.address,VaultID:V,DebtMaximum:'50000000',ManagementFeeRate:1000,CoverRateMinimum:10000,CoverRateLiquidation:50000}); const B=made(r.meta,'LoanBroker')
await go(mgr,{TransactionType:'LoanBrokerCoverDeposit',Account:mgr.address,LoanBrokerID:B,Amount:'6000000'})
await sleep((SUB-now()+6)*1000)
const prep=await c.autofill({TransactionType:'LoanSet',Account:mgr.address,LoanBrokerID:B,Counterparty:bor.address,PrincipalRequested:'20000000',InterestRate:5000,PaymentInterval:60,PaymentTotal:3,GracePeriod:60})
const lr=await c.submitAndWait(signLoanSetByCounterparty(bor,mgr.sign(prep).tx_blob).tx_blob)
const L=made(lr.result.meta,'Loan'); console.log('LoanSet', lr.result.meta.TransactionResult)
const ln=(await c.request({command:'ledger_entry',index:L})).result.node
const periodic=Math.ceil(Number(ln.PeriodicPayment))
console.log(`PeriodicPayment ${ln.PeriodicPayment} -> ceil ${periodic} | PaymentRemaining ${ln.PaymentRemaining}`)
console.log(`NextPaymentDueDate ${ln.NextPaymentDueDate} | now ${now()} (due in ${ln.NextPaymentDueDate-now()}s)`)
const alive=async()=>{try{const x=(await c.request({command:'ledger_entry',index:L})).result.node;return `alive Principal=${x.PrincipalOutstanding} Remaining=${x.PaymentRemaining}`}catch{return 'CLOSED'}}
console.log('\n--- BEFORE NextPaymentDueDate ---')
console.log('  overpay 8 XRP, no flag :', (await go(bor,{TransactionType:'LoanPay',Account:bor.address,LoanID:L,Amount:'8000000'})).code, '|', await alive())
console.log('  underpay 1 XRP         :', (await go(bor,{TransactionType:'LoanPay',Account:bor.address,LoanID:L,Amount:'1000000'})).code, '|', await alive())
const w=Math.max(0,ln.NextPaymentDueDate-now()+5); console.log(`\n… waiting ${w}s past NextPaymentDueDate`); await sleep(w*1000)
console.log('--- AFTER NextPaymentDueDate ---')
console.log('  overpay 8 XRP, no flag :', (await go(bor,{TransactionType:'LoanPay',Account:bor.address,LoanID:L,Amount:'8000000'})).code, '|', await alive())
console.log('  exact periodic         :', (await go(bor,{TransactionType:'LoanPay',Account:bor.address,LoanID:L,Amount:String(periodic)})).code, '|', await alive())
await c.disconnect()
