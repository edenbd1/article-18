/**
 * Can XLS-65/66 operations be composed atomically with BatchV1_1?
 * (1) atomic VaultDeposit + LoanBrokerCoverDeposit by the fund manager
 * (2) atomicity guarantee: tfAllOrNothing with one good + one doomed op must revert BOTH
 * HACK_SEEDS=mgr,lp,bor
 */
import { Client, Wallet } from 'xrpl'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const c=new Client('wss://lending-hackathon.dev.ripplex.io:51233'); await c.connect()
const NETID=(await c.request({command:'server_info'})).result.info.network_id
console.log('HACK net',NETID)
const seeds=process.env.HACK_SEEDS.split(',')
const w=async i=>{const x=Wallet.fromSeed(seeds[i]);for(let k=0;k<150;k++){try{await c.request({command:'account_info',account:x.address});break}catch{await sleep(3000)}}return x}
const nf=t=>({...t,NetworkID:NETID})
const go=async(wal,tx)=>{try{const r=await c.submitAndWait(nf(tx),{autofill:true,wallet:wal});return{code:r.result.meta.TransactionResult,meta:r.result.meta}}catch(e){return{code:e?.data?.error_message??e.message}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex

const mgr=await w(0), lp=await w(1)
let r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:'XRP'},WithdrawalPolicy:1})
const V=made(r.meta,'Vault'); console.log('vault',r.code)
r=await go(mgr,{TransactionType:'LoanBrokerSet',Account:mgr.address,VaultID:V,DebtMaximum:'100000000',ManagementFeeRate:1000,CoverRateMinimum:10000,CoverRateLiquidation:50000})
const B=made(r.meta,'LoanBroker'); console.log('broker',r.code)
const vault=async()=>(await c.request({command:'ledger_entry',index:V})).result.node
const broker=async()=>(await c.request({command:'ledger_entry',index:B})).result.node

// helper to build+submit a single-account Batch of mgr's own inner txs
const TF_INNER=0x40000000
async function batch(flagName, inners, label){
  const raw=inners.map(t=>({RawTransaction:{...t,Account:mgr.address,Flags:(t.Flags||0)|TF_INNER}}))
  const outer=nf({TransactionType:'Batch',Account:mgr.address,Flags:{[flagName]:true},RawTransactions:raw})
  try{
    const filled=await c.autofill(outer)
    const signed=mgr.sign(filled)
    const r=await c.submitAndWait(signed.tx_blob)
    console.log(`  ${label}: ${r.result.meta.TransactionResult}`)
    return r.result.meta
  }catch(e){ console.log(`  ${label}: ${e?.data?.error_message??e.message}`); return null }
}

console.log('\n=== (1) atomic VaultDeposit(10) + LoanBrokerCoverDeposit(2), all mgr ===')
const v0=await vault(), b0=await broker()
await batch('tfAllOrNothing',[
  {TransactionType:'VaultDeposit',VaultID:V,Amount:'10000000'},
  {TransactionType:'LoanBrokerCoverDeposit',LoanBrokerID:B,Amount:'2000000'},
],'batch deposit+cover')
const v1=await vault(), b1=await broker()
console.log(`  vault AssetsTotal ${v0.AssetsTotal??0} -> ${v1.AssetsTotal??0} | cover ${b0.CoverAvailable??0} -> ${b1.CoverAvailable??0}`)

console.log('\n=== (2) atomicity: tfAllOrNothing [ good deposit 5 , doomed deposit 100000 XRP ] must revert BOTH ===')
const v2=await vault()
await batch('tfAllOrNothing',[
  {TransactionType:'VaultDeposit',VaultID:V,Amount:'5000000'},
  {TransactionType:'VaultDeposit',VaultID:V,Amount:'100000000000'}, // 100000 XRP, mgr can't afford
],'all-or-nothing with a doomed inner')
const v3=await vault()
console.log(`  vault AssetsTotal ${v2.AssetsTotal??0} -> ${v3.AssetsTotal??0}  (unchanged => atomic revert works)`)
await c.disconnect()
