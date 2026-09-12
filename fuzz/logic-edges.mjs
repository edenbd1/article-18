/**
 * Logic / economic edge cases the protocol may or may not prevent. Run on hackathon rc1 with an
 * OPEN-ended vault (immediate lending, no phase wait). These are risk findings, not codec bugs.
 * HACK_SEEDS=s0,s1,s2  (mgr, lp, borrower)
 */
import { Client, Wallet, signLoanSetByCounterparty } from 'xrpl'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const c=new Client('wss://lending-hackathon.dev.ripplex.io:51233'); await c.connect()
const si=await c.request({command:'server_info'}); const NETID=si.result.info.network_id
console.log('HACK build',si.result.info.build_version,'net',NETID,'\n')
const seeds=process.env.HACK_SEEDS.split(',')
const w=async i=>{const x=Wallet.fromSeed(seeds[i]);for(let k=0;k<150;k++){try{await c.request({command:'account_info',account:x.address});break}catch{await sleep(3000)}}return x}
const nf=tx=>({...tx,NetworkID:NETID})
const go=async(wal,tx)=>{try{const r=await c.submitAndWait(nf(tx),{autofill:true,wallet:wal});return{code:r.result.meta.TransactionResult,meta:r.result.meta}}catch(e){return{code:e?.data?.error_message??e.message}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex

const mgr=await w(0), lp=await w(1), bor=await w(2)
let r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:'XRP'},WithdrawalPolicy:1}) // OPEN-ended
const V=made(r.meta,'Vault'); console.log('open vault',r.code)
console.log('lp deposit 200 XRP:',(await go(lp,{TransactionType:'VaultDeposit',Account:lp.address,VaultID:V,Amount:'200000000'})).code)
r=await go(mgr,{TransactionType:'LoanBrokerSet',Account:mgr.address,VaultID:V,DebtMaximum:'200000000',ManagementFeeRate:1000,CoverRateMinimum:10000,CoverRateLiquidation:50000})
const B=made(r.meta,'LoanBroker'); console.log('broker',r.code)
console.log('cover deposit 10 XRP:',(await go(mgr,{TransactionType:'LoanBrokerCoverDeposit',Account:mgr.address,LoanBrokerID:B,Amount:'10000000'})).code)

const originate=async(counterpartyWallet,P,label)=>{
  const prep=await c.autofill(nf({TransactionType:'LoanSet',Account:mgr.address,LoanBrokerID:B,Counterparty:counterpartyWallet.address,PrincipalRequested:P,InterestRate:5000,PaymentInterval:86400,PaymentTotal:3,GracePeriod:3600}))
  try{const both=signLoanSetByCounterparty(counterpartyWallet,mgr.sign(prep).tx_blob);const rr=await c.submitAndWait(both.tx_blob);console.log(label,'->',rr.result.meta.TransactionResult);return made(rr.result.meta,'Loan')}
  catch(e){console.log(label,'->',e?.data?.error_message??e.message);return null}
}

console.log('\n=== A. SELF-DEALING: broker owner borrows from their own vault ===')
await originate(mgr, '20000000', 'LoanSet Counterparty=broker owner (self-loan)')

console.log('\n=== B. FIRST-LOSS COVER WITHDRAWAL while a loan is outstanding ===')
const L=await originate(bor, '50000000', 'LoanSet to borrower 50 XRP')
const cover=async()=>{try{const b=(await c.request({command:'ledger_entry',index:B})).result.node;return b.CoverAvailable}catch{return '?'}}
console.log('CoverAvailable before withdraw:', await cover())
console.log('withdraw full 10 XRP cover with loan active:', (await go(mgr,{TransactionType:'LoanBrokerCoverWithdraw',Account:mgr.address,LoanBrokerID:B,Amount:'10000000'})).code)
console.log('CoverAvailable after withdraw:', await cover())

console.log('\n=== C. COVER over-withdrawal (more than deposited) ===')
console.log('withdraw 999 XRP:', (await go(mgr,{TransactionType:'LoanBrokerCoverWithdraw',Account:mgr.address,LoanBrokerID:B,Amount:'999000000'})).code)
await c.disconnect()
