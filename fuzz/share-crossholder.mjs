/**
 * Can holder A extract value from holder B via deposit/withdraw rounding at price != 1?
 * lp already holds 100M shares of an 81M-asset vault (price 0.81). mgr becomes a 2nd holder,
 * then lp does many 1-drop round trips. If mgr's asset claim drops and lp's rises, that's a leak.
 * HACK_SEEDS=mgr,lp,bor ; VAULT=<index>
 */
import { Client, Wallet } from 'xrpl'
const c=new Client('wss://lending-hackathon.dev.ripplex.io:51233'); await c.connect()
const NETID=(await c.request({command:'server_info'})).result.info.network_id
const seeds=process.env.HACK_SEEDS.split(','); const V=process.env.VAULT
const mgr=Wallet.fromSeed(seeds[0]), lp=Wallet.fromSeed(seeds[1])
const nf=t=>({...t,NetworkID:NETID})
const go=async(w,tx)=>{try{const r=await c.submitAndWait(nf(tx),{autofill:true,wallet:w});return r.result.meta.TransactionResult}catch(e){return e?.data?.error_message??e.message}}
const vault=async()=>(await c.request({command:'ledger_entry',index:V})).result.node
const sh=async a=>{const os=(await c.request({command:"account_objects",account:a,type:"mptoken"})).result.account_objects;const o=os.find(x=>x.MPTokenIssuanceID===mptid);return o&&o.MPTAmount?BigInt(o.MPTAmount):0n}
const mptid=(await vault()).ShareMPTID
const totalShares=async()=>BigInt((await c.request({command:'ledger_entry',mpt_issuance:mptid})).result.node.OutstandingAmount)

console.log('mgr deposits 81 XRP to become a second holder')
console.log(' ', await go(mgr,{TransactionType:'VaultDeposit',Account:mgr.address,VaultID:V,Amount:'81000000'}))
let A=BigInt((await vault()).AssetsTotal), St=await totalShares(), Sm=await sh(mgr.address), Sl=await sh(lp.address)
const claim=(s)=>Number(s)*Number(A)/Number(St)
console.log(`state: assets=${A} totalShares=${St} | mgr shares=${Sm} claim=${claim(Sm).toFixed(3)} | lp shares=${Sl} claim=${claim(Sl).toFixed(3)}`)
const mgrClaim0=claim(Sm)

console.log('\nlp performs 15 round-trips of deposit 1 + withdraw 1 drop...')
for(let i=0;i<15;i++){ await go(lp,{TransactionType:'VaultDeposit',Account:lp.address,VaultID:V,Amount:'1'}); await go(lp,{TransactionType:'VaultWithdraw',Account:lp.address,VaultID:V,Amount:'1'}) }
A=BigInt((await vault()).AssetsTotal); St=await totalShares(); Sm=await sh(mgr.address); Sl=await sh(lp.address)
console.log(`after: assets=${A} totalShares=${St} | mgr shares=${Sm} claim=${claim(Sm).toFixed(3)} | lp shares=${Sl} claim=${claim(Sl).toFixed(3)}`)
console.log(`\nmgr claim change: ${(claim(Sm)-mgrClaim0).toFixed(6)} XRP-drops  (0 => rounding does NOT leak between holders)`)
await c.disconnect()
