/**
 * Does a private, domain-gated vault stop an eligible holder from transferring shares to an
 * INELIGIBLE account? If shares move freely, the Permissioned-Domain eligibility gate is
 * defeated on the secondary market. Public devnet (Credentials + PermissionedDomains enabled).
 */
import { Client, Wallet } from 'xrpl'
const c=new Client('wss://s.devnet.rippletest.net:51233'); await c.connect()
const hex=s=>Buffer.from(s,'utf8').toString('hex').toUpperCase()
const CT=hex('ELIGIBLE')
const go=async(w,tx)=>{try{const r=await c.submitAndWait(tx,{autofill:true,wallet:w});return{code:r.result.meta.TransactionResult,meta:r.result.meta}}catch(e){return{code:e?.data?.error_message??e.message}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const [assessor,mgr,alice,bob]=await Promise.all([c.fundWallet(),c.fundWallet(),c.fundWallet(),c.fundWallet()]).then(a=>a.map(x=>x.wallet))
console.log('alice(eligible)',alice.address,'bob(ineligible)',bob.address)

await go(assessor,{TransactionType:'CredentialCreate',Account:assessor.address,Subject:alice.address,CredentialType:CT})
await go(alice,{TransactionType:'CredentialAccept',Account:alice.address,Issuer:assessor.address,CredentialType:CT})
let r=await go(mgr,{TransactionType:'PermissionedDomainSet',Account:mgr.address,AcceptedCredentials:[{Credential:{Issuer:assessor.address,CredentialType:CT}}]})
const DOM=made(r.meta,'PermissionedDomain'); console.log('domain:',r.code)
r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:'XRP'},WithdrawalPolicy:1,DomainID:DOM,Flags:{tfVaultPrivate:true}})
const V=made(r.meta,'Vault'); console.log('private domain-gated vault:',r.code)
const mptid=(await c.request({command:'ledger_entry',index:V})).result.node.ShareMPTID
console.log('share MPTID:',mptid)

console.log('\nalice deposits 30 XRP:',(await go(alice,{TransactionType:'VaultDeposit',Account:alice.address,VaultID:V,Amount:'30000000'})).code)
// inspect the share MPToken issuance flags (transferable?)
const iss=(await c.request({command:'ledger_entry',mpt_issuance:mptid})).result.node
console.log('share issuance Flags:',iss.Flags,'| (0x20 tfMPTCanTransfer =',(iss.Flags&0x20)?'set':'unset',')')
const aliceShares=async()=>{const os=(await c.request({command:'account_objects',account:alice.address,type:'mptoken'})).result.account_objects.find(x=>x.MPTokenIssuanceID===mptid);return os?.MPTAmount}
console.log('alice shares:',await aliceShares())

console.log('\n=== can alice send shares to INELIGIBLE bob? ===')
console.log('  bob MPTokenAuthorize (opt-in to hold share):',(await go(bob,{TransactionType:'MPTokenAuthorize',Account:bob.address,MPTokenIssuanceID:mptid})).code)
console.log('  alice -> bob 10 share units:',(await go(alice,{TransactionType:'Payment',Account:alice.address,Destination:bob.address,Amount:{mpt_issuance_id:mptid,value:'10000000'}})).code)
const bobShares=async()=>{const os=(await c.request({command:'account_objects',account:bob.address,type:'mptoken'})).result.account_objects.find(x=>x.MPTokenIssuanceID===mptid);return os?.MPTAmount}
console.log('  bob shares now:',await bobShares(),'  => ', (await bobShares())&&(await bobShares())!=='0'?'GATE BYPASSED (ineligible holds shares)':'gate held')
await c.disconnect()
