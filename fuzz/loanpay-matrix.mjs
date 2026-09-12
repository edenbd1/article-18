/**
 * LoanPay amount/flag semantics on one loan (rc1 open vault, PaymentInterval 600s so all test
 * payments are on-time and the "late" dimension is isolated out). Maps the confusing cases:
 * underpay, exact, overpay, with/without tfLoanOverpayment / tfLoanFullPayment, paying a closed loan.
 * HACK_SEEDS=mgr,lp,bor
 */
import { Client, Wallet, signLoanSetByCounterparty } from 'xrpl'
const c=new Client('wss://lending-hackathon.dev.ripplex.io:51233'); await c.connect()
const NETID=(await c.request({command:'server_info'})).result.info.network_id
const seeds=process.env.HACK_SEEDS.split(','); const w=i=>Wallet.fromSeed(seeds[i])
const nf=t=>({...t,NetworkID:NETID})
const go=async(wal,tx)=>{try{const r=await c.submitAndWait(nf(tx),{autofill:true,wallet:wal});return{code:r.result.meta.TransactionResult,meta:r.result.meta}}catch(e){return{code:e?.data?.error_message??e.message}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const mgr=w(0), lp=w(1), bor=w(2)
let r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:'XRP'},WithdrawalPolicy:1})
const V=made(r.meta,'Vault')
await go(lp,{TransactionType:'VaultDeposit',Account:lp.address,VaultID:V,Amount:'200000000'})
r=await go(mgr,{TransactionType:'LoanBrokerSet',Account:mgr.address,VaultID:V,DebtMaximum:'200000000',ManagementFeeRate:1000,CoverRateMinimum:10000,CoverRateLiquidation:50000})
const B=made(r.meta,'LoanBroker')
await go(mgr,{TransactionType:'LoanBrokerCoverDeposit',Account:mgr.address,LoanBrokerID:B,Amount:'10000000'})
const prep=await c.autofill(nf({TransactionType:'LoanSet',Account:mgr.address,LoanBrokerID:B,Counterparty:bor.address,PrincipalRequested:'60000000',InterestRate:5000,PaymentInterval:600,PaymentTotal:5,GracePeriod:120}))
const both=signLoanSetByCounterparty(bor,mgr.sign(prep).tx_blob)
const rr=await c.submitAndWait(both.tx_blob); const L=made(rr.result.meta,'Loan')
const loan=async()=>{try{return (await c.request({command:'ledger_entry',index:L})).result.node}catch{return null}}
let ln=await loan(); const per=Math.ceil(Number(ln.PeriodicPayment))
console.log(`loan ok: periodic=${per} remaining=${ln.PaymentRemaining} principal=${ln.PrincipalOutstanding}\n`)
const pay=async(amt,flags,label)=>{
  const before=await loan()
  const r=await go(bor,{TransactionType:'LoanPay',Account:bor.address,LoanID:L,Amount:String(amt),...(flags?{Flags:flags}:{})})
  const after=await loan()
  const dP=after&&before?Number(before.PrincipalOutstanding)-Number(after.PrincipalOutstanding):(after?0:'CLOSED')
  const rem=after?after.PaymentRemaining:'-'
  console.log(`  ${label.padEnd(40)} ${String(r.code).padEnd(22)} dPrincipal=${dP} remaining=${rem}`)
}
console.log('all on-time (interval 600s). periodic ~'+per)
await pay(1000,               null,                    'underpay 0.001 XRP, no flag')
await pay(per*2,              null,                    'overpay 2x periodic, no flag')
await pay(per*2,              {tfLoanOverpayment:true},'overpay 2x + tfLoanOverpayment')
await pay(per,                null,                    'exact periodic, no flag')
await pay(per,                {tfLoanFullPayment:true},'exact periodic + tfLoanFullPayment')
let cur=await loan(); if(cur){const tot=Math.ceil(Number(cur.TotalValueOutstanding||cur.PrincipalOutstanding));
  await pay(tot,              {tfLoanFullPayment:true},'full remaining + tfLoanFullPayment (close)')}
await pay(per,                null,                    'pay again after (maybe) closed')
await c.disconnect()
