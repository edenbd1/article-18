/**
 * Can vault shares be held confidentially (ConfidentialTransfer)? Requires the share MPT issuance
 * to carry tfMPTCanHoldConfidentialBalance (128). VaultCreate never sets it and exposes no way to.
 * HACK_SEEDS=mgr,lp,bor
 */
import { Client, Wallet } from 'xrpl'
import * as xrpl from 'xrpl'
const c=new Client('wss://lending-hackathon.dev.ripplex.io:51233'); await c.connect()
const NETID=(await c.request({command:'server_info'})).result.info.network_id
const seeds=process.env.HACK_SEEDS.split(','); const w=i=>Wallet.fromSeed(seeds[i])
const nf=t=>({...t,NetworkID:NETID})
const go=async(wal,tx)=>{try{const r=await c.submitAndWait(nf(tx),{autofill:true,wallet:wal});return{code:r.result.meta.TransactionResult,meta:r.result.meta}}catch(e){return{code:e?.data?.error_message??e.message}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const mgr=w(0),lp=w(1)
let r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:'XRP'},WithdrawalPolicy:1})
const V=made(r.meta,'Vault'); const mptid=(await c.request({command:'ledger_entry',index:V})).result.node.ShareMPTID
await go(lp,{TransactionType:'VaultDeposit',Account:lp.address,VaultID:V,Amount:'30000000'})
const iss=(await c.request({command:'ledger_entry',mpt_issuance:mptid})).result.node
console.log('share issuance Flags:',iss.Flags,'| tfMPTCanHoldConfidentialBalance(128):',(iss.Flags&128)?'SET':'ABSENT')

console.log('\n=== attempt to convert vault shares to a confidential balance ===')
try {
  const kp = await xrpl.deriveConfidentialKeypair(lp)
  const prep = await xrpl.prepareConfidentialConvert(c, { account: lp.address, mptIssuanceID: mptid, amount: '1000000', keypair: kp })
  const rr = await c.submitAndWait(nf(prep),{autofill:true,wallet:lp})
  console.log('  convert result:', rr.result.meta.TransactionResult)
} catch(e) {
  console.log('  convert blocked:', (e.message||String(e)).slice(0,160))
}
await c.disconnect()
