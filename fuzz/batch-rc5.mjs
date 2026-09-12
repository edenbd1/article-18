import { Client } from 'xrpl'
const c=new Client('wss://s.devnet.rippletest.net:51233'); await c.connect()
console.log('PUBLIC build', (await c.request({command:'server_info'})).result.info.build_version)
const { wallet: mgr } = await c.fundWallet()
const { wallet: dst } = await c.fundWallet()
const TF=0x40000000
async function batch(inners,label){
  const raw=inners.map(t=>({RawTransaction:{...t,Account:mgr.address,Flags:(t.Flags||0)|TF}}))
  const outer={TransactionType:'Batch',Account:mgr.address,Flags:{tfAllOrNothing:true},RawTransactions:raw}
  try{const f=await c.autofill(outer);const s=mgr.sign(f);const r=await c.submitAndWait(s.tx_blob);console.log(`  ${label}: ${r.result.meta.TransactionResult}`)}
  catch(e){console.log(`  ${label}: ${e?.data?.error_message??e.message}`)}
}
await batch([{TransactionType:'Payment',Destination:dst.address,Amount:'1000000'},{TransactionType:'Payment',Destination:dst.address,Amount:'2000000'}],'CONTROL 2x Payment')
await batch([{TransactionType:'Payment',Destination:dst.address,Amount:'1000000'},{TransactionType:'VaultCreate',Asset:{currency:'XRP'},WithdrawalPolicy:1}],'Payment + VaultCreate')
await c.disconnect()
