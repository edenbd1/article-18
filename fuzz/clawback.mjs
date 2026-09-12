/**
 * Who can claw back a lender's position / the broker's cover?
 * XRP vault (no issuer) — VaultClawback by owner and by a third party; LoanBrokerCoverClawback.
 * HACK_SEEDS=mgr,lp,bor ; VAULT=<index> ; BROKER=<index optional>
 */
import { Client, Wallet } from 'xrpl'
const c=new Client('wss://lending-hackathon.dev.ripplex.io:51233'); await c.connect()
const NETID=(await c.request({command:'server_info'})).result.info.network_id
const seeds=process.env.HACK_SEEDS.split(','); const V=process.env.VAULT
const mgr=Wallet.fromSeed(seeds[0]), lp=Wallet.fromSeed(seeds[1]), bor=Wallet.fromSeed(seeds[2])
const nf=t=>({...t,NetworkID:NETID})
const go=async(w,tx)=>{try{const r=await c.submitAndWait(nf(tx),{autofill:true,wallet:w});return r.result.meta.TransactionResult}catch(e){return e?.data?.error_message??e.message}}
const vault=async()=>(await c.request({command:'ledger_entry',index:V})).result.node
const v=await vault(); console.log('vault asset:', JSON.stringify(v.Asset), '| AssetsTotal', v.AssetsTotal)

console.log('\n=== VaultClawback on an XRP vault ===')
console.log('  owner claws lp full position (no Amount):', await go(mgr,{TransactionType:'VaultClawback',Account:mgr.address,VaultID:V,Holder:lp.address}))
console.log('  owner claws lp 5 XRP:                    ', await go(mgr,{TransactionType:'VaultClawback',Account:mgr.address,VaultID:V,Holder:lp.address,Amount:'5000000'}))
console.log('  third party (borrower) claws lp:         ', await go(bor,{TransactionType:'VaultClawback',Account:bor.address,VaultID:V,Holder:lp.address,Amount:'5000000'}))
console.log('  owner claws OWN position (Holder=mgr):   ', await go(mgr,{TransactionType:'VaultClawback',Account:mgr.address,VaultID:V,Holder:mgr.address,Amount:'5000000'}))
const v2=await vault(); console.log('  AssetsTotal after attempts:', v2.AssetsTotal, v2.AssetsTotal===v.AssetsTotal?'(unchanged)':'(CHANGED)')
await c.disconnect()
