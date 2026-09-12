import { Client, Wallet } from 'xrpl'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const c=new Client('wss://lending-hackathon.dev.ripplex.io:51233'); await c.connect()
const NETID=(await c.request({command:'server_info'})).result.info.network_id
const seeds=process.env.HACK_SEEDS.split(',')
const w=async i=>{const x=Wallet.fromSeed(seeds[i]);for(let k=0;k<150;k++){try{await c.request({command:'account_info',account:x.address});break}catch{await sleep(3000)}}return x}
const nf=t=>({...t,NetworkID:NETID}); const TF=0x40000000
const mgr=await w(0), lp=await w(1)
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
async function batch(inners,label){
  const raw=inners.map(t=>({RawTransaction:{...t,Account:mgr.address,Flags:(t.Flags||0)|TF}}))
  const outer=nf({TransactionType:'Batch',Account:mgr.address,Flags:{tfAllOrNothing:true},RawTransactions:raw})
  try{const f=await c.autofill(outer);const s=mgr.sign(f);const r=await c.submitAndWait(s.tx_blob);console.log(`  ${label}: ${r.result.meta.TransactionResult}`)}
  catch(e){console.log(`  ${label}: ${e?.data?.error_message??e.message}`)}
}
console.log('CONTROL: batch of two plain Payments (known-batchable)')
await batch([
  {TransactionType:'Payment',Destination:lp.address,Amount:'1000000'},
  {TransactionType:'Payment',Destination:lp.address,Amount:'2000000'},
],'2x Payment')

console.log('\nLENDING: single VaultCreate inner')
await batch([{TransactionType:'VaultCreate',Asset:{currency:'XRP'},WithdrawalPolicy:1}],'1x VaultCreate')

console.log('\nMIXED: Payment + VaultCreate')
await batch([
  {TransactionType:'Payment',Destination:lp.address,Amount:'1000000'},
  {TransactionType:'VaultCreate',Asset:{currency:'XRP'},WithdrawalPolicy:1},
],'Payment+VaultCreate')
await c.disconnect()
