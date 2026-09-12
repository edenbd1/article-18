/**
 * Does depositing into a vault expose a lender to the underlying asset ISSUER's clawback?
 * Public devnet (Clawback enabled). issuer I, vault owner mgr, lender lp.
 * lp holds an IOU from I, deposits it into mgr's vault; then I tries VaultClawback on lp.
 */
import { Client, Wallet } from 'xrpl'
const c=new Client('wss://s.devnet.rippletest.net:51233'); await c.connect()
console.log('PUBLIC build', (await c.request({command:'server_info'})).result.info.build_version)
const go=async(w,tx)=>{try{const r=await c.submitAndWait(tx,{autofill:true,wallet:w});return{code:r.result.meta.TransactionResult,meta:r.result.meta}}catch(e){return{code:e?.data?.error_message??e.message}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const { wallet: I } = await c.fundWallet()
const { wallet: mgr } = await c.fundWallet()
const { wallet: lp } = await c.fundWallet()
const CUR='USD'; const IOU=v=>({currency:CUR,issuer:I.address,value:String(v)})
console.log('issuer',I.address,'mgr',mgr.address,'lp',lp.address)

console.log('\n0. issuer DefaultRipple:   ', (await go(I,{TransactionType:'AccountSet',Account:I.address,SetFlag:8})).code) // asfDefaultRipple
console.log('1. issuer enables clawback:', (await go(I,{TransactionType:'AccountSet',Account:I.address,SetFlag:16})).code) // asfAllowTrustLineClawback
console.log('2. lp trustline to USD:    ', (await go(lp,{TransactionType:'TrustSet',Account:lp.address,LimitAmount:IOU(1000000)})).code)
console.log('3. issuer sends 100 USD:   ', (await go(I,{TransactionType:'Payment',Account:I.address,Destination:lp.address,Amount:IOU(100)})).code)
let r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:CUR,issuer:I.address},WithdrawalPolicy:1})
console.log('4. mgr creates USD vault:  ', r.code)
if(!r.meta){ console.log('   VaultCreate failed; trying with mgr trustline to USD first'); 
  console.log('   mgr trustline:', (await go(mgr,{TransactionType:'TrustSet',Account:mgr.address,LimitAmount:IOU(1000000)})).code)
  r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:CUR,issuer:I.address},WithdrawalPolicy:1})
  console.log('   retry VaultCreate:', r.code)
}
const V=r.meta?made(r.meta,'Vault'):null; if(!V){console.log('   still no vault, aborting'); await c.disconnect(); process.exit(0)}
console.log('5. lp deposits 50 USD:     ', (await go(lp,{TransactionType:'VaultDeposit',Account:lp.address,VaultID:V,Amount:IOU(50)})).code)
const vault=async()=>(await c.request({command:'ledger_entry',index:V})).result.node
console.log('   vault AssetsTotal:', (await vault()).AssetsTotal)

console.log('\n=== does the ISSUER reach into the vault and claw a lender position? ===')
console.log('  issuer VaultClawback Holder=lp, 20 USD:', (await go(I,{TransactionType:'VaultClawback',Account:I.address,VaultID:V,Holder:lp.address,Amount:IOU(20)})).code)
console.log('  issuer VaultClawback Holder=lp, all:   ', (await go(I,{TransactionType:'VaultClawback',Account:I.address,VaultID:V,Holder:lp.address})).code)
console.log('   vault AssetsTotal after:', (await vault()).AssetsTotal)
console.log('  vault OWNER (mgr) tries VaultClawback:  ', (await go(mgr,{TransactionType:'VaultClawback',Account:mgr.address,VaultID:V,Holder:lp.address,Amount:IOU(20)})).code)
await c.disconnect()
