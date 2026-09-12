/**
 * Differential fixed-point math test. The hackathon network (rc1) lacks fixUniversalNumber,
 * fixSTAmountCanonicalize and fixInnerObjTemplate; public devnet (rc5) has them. The lending
 * protocol computes PeriodicPayment as an STNumber. We originate identical loans on a network
 * and dump the computed values so the two runs can be diffed byte for byte.
 * NET=pub|hack ; HACK_SEEDS=s1,s2,s3
 */
import { Client, Wallet, signLoanSetByCounterparty } from 'xrpl'
const NET = process.env.NET === 'hack'
  ? { wss:'wss://lending-hackathon.dev.ripplex.io:51233', name:'HACK-rc1' }
  : { wss:'wss://s.devnet.rippletest.net:51233', name:'PUB-rc5' }
const sleep = ms => new Promise(r=>setTimeout(r,ms))
const c = new Client(NET.wss); await c.connect()
const si = await c.request({ command:'server_info' })
const NETID = si.result.info.network_id, needsNet = NETID>1024
console.error(`${NET.name} build ${si.result.info.build_version} net ${NETID}`)

async function acct(idx){ if(process.env.HACK_SEEDS){ const w=Wallet.fromSeed(process.env.HACK_SEEDS.split(',')[idx]); for(let i=0;i<150;i++){try{await c.request({command:'account_info',account:w.address});break}catch{await sleep(3000)}} return w } return (await c.fundWallet()).wallet }
const netf = tx => needsNet ? { ...tx, NetworkID:NETID } : tx
async function go(w,tx){ try{ const r=await c.submitAndWait(netf(tx),{autofill:true,wallet:w}); return {code:r.result.meta.TransactionResult,meta:r.result.meta} }catch(e){ return {code:e?.data?.error_message??e.message} } }
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const N=()=>Math.floor(Date.now()/1000)-946684800

const mgr=await acct(0), lp=await acct(1), bor=await acct(2)
const SUB=N()+50, RED=SUB+1200
let r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:'XRP'},WithdrawalPolicy:1,VaultKind:1,SubscriptionDate:SUB,RedemptionDate:RED})
const V=made(r.meta,'Vault'); console.error('vault',r.code)
console.error('deposit', (await go(lp,{TransactionType:'VaultDeposit',Account:lp.address,VaultID:V,Amount:'90000000'})).code)
r=await go(mgr,{TransactionType:'LoanBrokerSet',Account:mgr.address,VaultID:V,DebtMaximum:'90000000',ManagementFeeRate:1000,CoverRateMinimum:10000,CoverRateLiquidation:50000})
const B=made(r.meta,'LoanBroker'); console.error('broker',r.code)
await go(mgr,{TransactionType:'LoanBrokerCoverDeposit',Account:mgr.address,LoanBrokerID:B,Amount:'5000000'})
console.error(`waiting ${SUB-N()+6}s for investment`); await sleep((SUB-N()+6)*1000)

const combos=[
  {P:'20000000', rate:5000,  total:3, int:60},
  {P:'10000000', rate:33333, total:3, int:60},
  {P:'1000000',  rate:100000,total:7, int:60},
  {P:'7',        rate:12345, total:3, int:60},
  {P:'3000001',  rate:12345, total:7, int:60},
  {P:'7777777',  rate:66667, total:3, int:60},
]
const out=[]
for(const k of combos){
  const prep=await c.autofill(netf({TransactionType:'LoanSet',Account:mgr.address,LoanBrokerID:B,Counterparty:bor.address,PrincipalRequested:k.P,InterestRate:k.rate,PaymentInterval:k.int,PaymentTotal:k.total,GracePeriod:60}))
  let rec={...k}
  try{
    const both=signLoanSetByCounterparty(bor,mgr.sign(prep).tx_blob)
    const rr=await c.submitAndWait(both.tx_blob)
    rec.code=rr.result.meta.TransactionResult
    const L=made(rr.result.meta,'Loan')
    if(L){ const ln=(await c.request({command:'ledger_entry',index:L})).result.node
      rec.PeriodicPayment=ln.PeriodicPayment; rec.TotalValueOutstanding=ln.TotalValueOutstanding
      rec.PrincipalOutstanding=ln.PrincipalOutstanding; rec.InterestRate=ln.InterestRate }
  }catch(e){ rec.code=e?.data?.error_message??e.message }
  out.push(rec)
  console.error(' ', k.P, 'rate', k.rate, '->', rec.code, rec.PeriodicPayment??'')
}
console.log(JSON.stringify(out,null,1))
await c.disconnect()
