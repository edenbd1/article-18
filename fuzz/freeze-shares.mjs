/**
 * Can a lender's vault shares be frozen/locked (position lock-in risk)?
 * The share MPT issuance flags seen earlier were 0x3C (RequireAuth+CanEscrow+CanTrade+CanTransfer),
 * with no CanLock (0x02). Verify lock attempts fail. HACK_SEEDS=mgr,lp,bor ; make a fresh vault.
 */
import { Client, Wallet } from 'xrpl'
const c=new Client('wss://lending-hackathon.dev.ripplex.io:51233'); await c.connect()
const NETID=(await c.request({command:'server_info'})).result.info.network_id
const seeds=process.env.HACK_SEEDS.split(',')
const w=async i=>Wallet.fromSeed(seeds[i])
const nf=t=>({...t,NetworkID:NETID})
const go=async(wal,tx)=>{try{const r=await c.submitAndWait(nf(tx),{autofill:true,wallet:wal});return{code:r.result.meta.TransactionResult,meta:r.result.meta}}catch(e){return{code:e?.data?.error_message??e.message}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const mgr=await w(0), lp=await w(1)
let r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:'XRP'},WithdrawalPolicy:1})
const V=made(r.meta,'Vault'); const mptid=(await c.request({command:'ledger_entry',index:V})).result.node.ShareMPTID
console.log('vault',r.code,'shareMPTID',mptid)
await go(lp,{TransactionType:'VaultDeposit',Account:lp.address,VaultID:V,Amount:'30000000'})
const iss=(await c.request({command:'ledger_entry',mpt_issuance:mptid})).result.node
const F=iss.Flags
const bit=(b,n)=>`${n}:${(F&b)?'Y':'-'}`
console.log('share issuance Flags',F,'=',[bit(1,'Locked'),bit(2,'CanLock'),bit(4,'ReqAuth'),bit(8,'CanEscrow'),bit(16,'CanTrade'),bit(32,'CanTransfer'),bit(64,'CanClawback')].join(' '))
console.log('issuer of share MPT (vault pseudo-acct):', iss.Issuer)

console.log('\n=== can the vault OWNER freeze lender shares? ===')
console.log('  mgr lock whole issuance (tfMPTLock=1):', (await go(mgr,{TransactionType:'MPTokenIssuanceSet',Account:mgr.address,MPTokenIssuanceID:mptid,Flags:1})).code)
console.log('  mgr lock lp individually (Holder):    ', (await go(mgr,{TransactionType:'MPTokenIssuanceSet',Account:mgr.address,MPTokenIssuanceID:mptid,Holder:lp.address,Flags:1})).code)
// verify lp can still withdraw (not frozen)
console.log('  lp withdraw 5 XRP still works:        ', (await go(lp,{TransactionType:'VaultWithdraw',Account:lp.address,VaultID:V,Amount:'5000000'})).code)
await c.disconnect()
