/**
 * When the asset issuer claws back ONE lender's vault position, is the loss isolated (that
 * lender's shares burned) or socialised to all holders (AssetsTotal drops, everyone's share
 * price falls)? issuer I, vault owner mgr, lenders lp1 & lp2. I claws lp1; check lp2.
 */
import { Client, Wallet } from 'xrpl'
const c=new Client('wss://s.devnet.rippletest.net:51233'); await c.connect()
const go=async(w,tx)=>{try{const r=await c.submitAndWait(tx,{autofill:true,wallet:w});return{code:r.result.meta.TransactionResult,meta:r.result.meta}}catch(e){return{code:e?.data?.error_message??e.message}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const [I,mgr,lp1,lp2]=await Promise.all([c.fundWallet(),c.fundWallet(),c.fundWallet(),c.fundWallet()]).then(a=>a.map(x=>x.wallet))
const CUR='USD', IOU=v=>({currency:CUR,issuer:I.address,value:String(v)})
await go(I,{TransactionType:'AccountSet',Account:I.address,SetFlag:8})
await go(I,{TransactionType:'AccountSet',Account:I.address,SetFlag:16})
for(const lp of [lp1,lp2]){ await go(lp,{TransactionType:'TrustSet',Account:lp.address,LimitAmount:IOU(1000000)}); await go(I,{TransactionType:'Payment',Account:I.address,Destination:lp.address,Amount:IOU(100)}) }
await go(mgr,{TransactionType:'TrustSet',Account:mgr.address,LimitAmount:IOU(1000000)})
let r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:CUR,issuer:I.address},WithdrawalPolicy:1})
const V=made(r.meta,'Vault'); console.log('USD vault:', r.code)
const mptid=(await c.request({command:'ledger_entry',index:V})).result.node.ShareMPTID
const vault=async()=>(await c.request({command:'ledger_entry',index:V})).result.node
const sh=async a=>{const os=(await c.request({command:'account_objects',account:a,type:'mptoken'})).result.account_objects;const o=os.find(x=>x.MPTokenIssuanceID===mptid);return o&&o.MPTAmount?BigInt(o.MPTAmount):0n}
const totShares=async()=>BigInt((await c.request({command:'ledger_entry',mpt_issuance:mptid})).result.node.OutstandingAmount)
console.log('lp1 deposit 50:', (await go(lp1,{TransactionType:'VaultDeposit',Account:lp1.address,VaultID:V,Amount:IOU(50)})).code)
console.log('lp2 deposit 50:', (await go(lp2,{TransactionType:'VaultDeposit',Account:lp2.address,VaultID:V,Amount:IOU(50)})).code)

let A=BigInt((await vault()).AssetsTotal), St=await totShares(), s1=await sh(lp1.address), s2=await sh(lp2.address)
const claim=s=>Number(s)*Number(A)/Number(St)
console.log(`\nBEFORE clawback: AssetsTotal=${A} totalShares=${St}`)
console.log(`  lp1 shares=${s1} claim=${claim(s1).toFixed(3)} | lp2 shares=${s2} claim=${claim(s2).toFixed(3)}`)
const lp2claim0=claim(s2)

console.log('\nissuer claws back ALL of lp1:', (await go(I,{TransactionType:'VaultClawback',Account:I.address,VaultID:V,Holder:lp1.address})).code)
A=BigInt((await vault()).AssetsTotal||0); St=await totShares(); s1=await sh(lp1.address); s2=await sh(lp2.address)
const claim2=s=>St===0n?0:Number(s)*Number(A)/Number(St)
console.log(`\nAFTER clawback: AssetsTotal=${A} totalShares=${St}`)
console.log(`  lp1 shares=${s1} | lp2 shares=${s2} claim=${claim2(s2).toFixed(3)}`)
console.log(`\n  lp2 claim change: ${(claim2(s2)-lp2claim0).toFixed(3)}  => ${Math.abs(claim2(s2)-lp2claim0)<0.001?'ISOLATED (lp1 shares burned, lp2 safe)':'SOCIALISED (lp2 diluted by lp1 clawback!)'}`)
await c.disconnect()
