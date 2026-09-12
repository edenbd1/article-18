/**
 * Can the vault owner re-gate a private vault (VaultSet DomainID) AFTER lenders subscribed,
 * stranding an existing holder who no longer matches the new domain? rc1 (Credentials+Domains).
 * HACK_SEEDS=assessor,mgr,lp
 */
import { Client, Wallet } from 'xrpl'
const c=new Client('wss://lending-hackathon.dev.ripplex.io:51233'); await c.connect()
const NETID=(await c.request({command:'server_info'})).result.info.network_id
const hex=s=>Buffer.from(s,'utf8').toString('hex').toUpperCase()
const seeds=process.env.HACK_SEEDS.split(','); const w=i=>Wallet.fromSeed(seeds[i])
const nf=t=>({...t,NetworkID:NETID})
const go=async(wal,tx)=>{try{const r=await c.submitAndWait(nf(tx),{autofill:true,wallet:wal});return{code:r.result.meta.TransactionResult,meta:r.result.meta}}catch(e){return{code:e?.data?.error_message??e.message}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const assessor=w(0),mgr=w(1),lp=w(2)
const CT_A=hex('CRED_A'), CT_B=hex('CRED_B')
// lp gets CRED_A only
await go(assessor,{TransactionType:'CredentialCreate',Account:assessor.address,Subject:lp.address,CredentialType:CT_A})
await go(lp,{TransactionType:'CredentialAccept',Account:lp.address,Issuer:assessor.address,CredentialType:CT_A})
let r=await go(mgr,{TransactionType:'PermissionedDomainSet',Account:mgr.address,AcceptedCredentials:[{Credential:{Issuer:assessor.address,CredentialType:CT_A}}]})
const DOM_A=made(r.meta,'PermissionedDomain'); console.log('domain A (CRED_A):',r.code)
r=await go(mgr,{TransactionType:'PermissionedDomainSet',Account:mgr.address,AcceptedCredentials:[{Credential:{Issuer:assessor.address,CredentialType:CT_B}}]})
const DOM_B=made(r.meta,'PermissionedDomain'); console.log('domain B (CRED_B, lp lacks it):',r.code)
r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:'XRP'},WithdrawalPolicy:1,DomainID:DOM_A,Flags:{tfVaultPrivate:true}})
const V=made(r.meta,'Vault'); console.log('private vault gated to domain A:',r.code)
console.log('lp (in domain A) deposits 30 XRP:',(await go(lp,{TransactionType:'VaultDeposit',Account:lp.address,VaultID:V,Amount:'30000000'})).code)

console.log('\n=== owner re-gates the vault to domain B (which lp does NOT qualify for) ===')
console.log('  VaultSet DomainID -> B:',(await go(mgr,{TransactionType:'VaultSet',Account:mgr.address,VaultID:V,DomainID:DOM_B})).code)
console.log('\n  can the now-ineligible lp still WITHDRAW its 30 XRP?')
console.log('  lp VaultWithdraw 30 XRP:',(await go(lp,{TransactionType:'VaultWithdraw',Account:lp.address,VaultID:V,Amount:'30000000'})).code)
await c.disconnect()
