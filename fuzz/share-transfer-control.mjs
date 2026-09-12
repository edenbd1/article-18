import { Client, Wallet } from 'xrpl'
const c=new Client('wss://s.devnet.rippletest.net:51233'); await c.connect()
const hex=s=>Buffer.from(s,'utf8').toString('hex').toUpperCase(); const CT=hex('ELIGIBLE')
const go=async(w,tx)=>{try{const r=await c.submitAndWait(tx,{autofill:true,wallet:w});return{code:r.result.meta.TransactionResult,meta:r.result.meta}}catch(e){return{code:e?.data?.error_message??e.message}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const [assessor,mgr,alice,alice2]=await Promise.all([c.fundWallet(),c.fundWallet(),c.fundWallet(),c.fundWallet()]).then(a=>a.map(x=>x.wallet))
for(const a of [alice,alice2]){ await go(assessor,{TransactionType:'CredentialCreate',Account:assessor.address,Subject:a.address,CredentialType:CT}); await go(a,{TransactionType:'CredentialAccept',Account:a.address,Issuer:assessor.address,CredentialType:CT}) }
let r=await go(mgr,{TransactionType:'PermissionedDomainSet',Account:mgr.address,AcceptedCredentials:[{Credential:{Issuer:assessor.address,CredentialType:CT}}]})
const DOM=made(r.meta,'PermissionedDomain')
r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:'XRP'},WithdrawalPolicy:1,DomainID:DOM,Flags:{tfVaultPrivate:true}})
const V=made(r.meta,'Vault'); const mptid=(await c.request({command:'ledger_entry',index:V})).result.node.ShareMPTID
await go(alice,{TransactionType:'VaultDeposit',Account:alice.address,VaultID:V,Amount:'30000000'})
console.log('POSITIVE CONTROL: alice -> alice2 (both eligible)')
console.log('  alice2 authorize:',(await go(alice2,{TransactionType:'MPTokenAuthorize',Account:alice2.address,MPTokenIssuanceID:mptid})).code)
console.log('  alice -> alice2 10 units:',(await go(alice,{TransactionType:'Payment',Account:alice.address,Destination:alice2.address,Amount:{mpt_issuance_id:mptid,value:'10000000'}})).code)
const a2=(await c.request({command:'account_objects',account:alice2.address,type:'mptoken'})).result.account_objects.find(x=>x.MPTokenIssuanceID===mptid)
console.log('  alice2 shares:',a2?.MPTAmount,'=>', a2&&a2.MPTAmount!=='0'?'transfer to eligible SUCCEEDS (gate enforced by eligibility, not a blanket block)':'blocked')
await c.disconnect()
