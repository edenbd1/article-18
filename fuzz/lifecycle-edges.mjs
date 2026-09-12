/**
 * DebtMaximum over-origination cap, delete preconditions (rug vector), VaultSet limits.
 * rc1 open vault. HACK_SEEDS=mgr,lp,bor
 */
import { Client, Wallet, signLoanSetByCounterparty } from 'xrpl'
const c=new Client('wss://lending-hackathon.dev.ripplex.io:51233'); await c.connect()
const NETID=(await c.request({command:'server_info'})).result.info.network_id
const seeds=process.env.HACK_SEEDS.split(','); const w=i=>Wallet.fromSeed(seeds[i])
const nf=t=>({...t,NetworkID:NETID})
const go=async(wal,tx)=>{try{const r=await c.submitAndWait(nf(tx),{autofill:true,wallet:wal});return{code:r.result.meta.TransactionResult,meta:r.result.meta}}catch(e){return{code:e?.data?.error_message??e.message}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const mgr=w(0),lp=w(1),bor=w(2)
let r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:'XRP'},WithdrawalPolicy:1})
const V=made(r.meta,'Vault'); console.log('vault',r.code)
await go(lp,{TransactionType:'VaultDeposit',Account:lp.address,VaultID:V,Amount:'200000000'})
r=await go(mgr,{TransactionType:'LoanBrokerSet',Account:mgr.address,VaultID:V,DebtMaximum:'30000000',ManagementFeeRate:1000,CoverRateMinimum:10000,CoverRateLiquidation:50000})
const B=made(r.meta,'LoanBroker'); console.log('broker DebtMaximum=30 XRP:',r.code)
await go(mgr,{TransactionType:'LoanBrokerCoverDeposit',Account:mgr.address,LoanBrokerID:B,Amount:'5000000'})
const loan=async(P)=>{const prep=await c.autofill(nf({TransactionType:'LoanSet',Account:mgr.address,LoanBrokerID:B,Counterparty:bor.address,PrincipalRequested:P,InterestRate:5000,PaymentInterval:86400,PaymentTotal:3,GracePeriod:3600}));try{const both=signLoanSetByCounterparty(bor,mgr.sign(prep).tx_blob);const rr=await c.submitAndWait(both.tx_blob);return{code:rr.result.meta.TransactionResult,L:made(rr.result.meta,'Loan')}}catch(e){return{code:e?.data?.error_message??e.message}}}

console.log('\n=== A. DebtMaximum over-origination (cap=30 XRP) ===')
const l1=await loan('20000000'); console.log('  loan 20 XRP:', l1.code)
const l2=await loan('20000000'); console.log('  loan 20 XRP more (total 40 > 30 cap):', l2.code)

console.log('\n=== B. delete preconditions (rug vector) ===')
console.log('  VaultDelete with assets + broker present:', (await go(mgr,{TransactionType:'VaultDelete',Account:mgr.address,VaultID:V})).code)
console.log('  LoanBrokerDelete with loan/cover outstanding:', (await go(mgr,{TransactionType:'LoanBrokerDelete',Account:mgr.address,LoanBrokerID:B})).code)
if(l1.L) console.log('  LoanDelete on an active loan:', (await go(mgr,{TransactionType:'LoanDelete',Account:mgr.address,LoanID:l1.L})).code)

console.log('\n=== C. VaultSet limits ===')
console.log('  lower AssetsMaximum below AssetsTotal (set 1 drop):', (await go(mgr,{TransactionType:'VaultSet',Account:mgr.address,VaultID:V,AssetsMaximum:'1'})).code)
console.log('  NON-owner (lp) VaultSet:', (await go(lp,{TransactionType:'VaultSet',Account:lp.address,VaultID:V,Data:'DEADBEEF'})).code)
console.log('  owner VaultSet Data ok:', (await go(mgr,{TransactionType:'VaultSet',Account:mgr.address,VaultID:V,Data:'DEADBEEF'})).code)
await c.disconnect()
