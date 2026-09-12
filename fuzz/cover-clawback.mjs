/**
 * Can the cover asset's ISSUER claw back a broker's first-loss cover (LoanBrokerCoverClawback),
 * eroding lender protection? IOU cover on public devnet (Clawback enabled).
 */
import { Client, Wallet } from 'xrpl'
const c=new Client('wss://s.devnet.rippletest.net:51233'); await c.connect()
const go=async(w,tx)=>{try{const r=await c.submitAndWait(tx,{autofill:true,wallet:w});return{code:r.result.meta.TransactionResult,meta:r.result.meta}}catch(e){return{code:e?.data?.error_message??e.message}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const [I,mgr,lp]=await Promise.all([c.fundWallet(),c.fundWallet(),c.fundWallet()]).then(a=>a.map(x=>x.wallet))
const CUR='USD', IOU=v=>({currency:CUR,issuer:I.address,value:String(v)})
await go(I,{TransactionType:'AccountSet',Account:I.address,SetFlag:8})
await go(I,{TransactionType:'AccountSet',Account:I.address,SetFlag:16})
for(const a of [mgr,lp]){ await go(a,{TransactionType:'TrustSet',Account:a.address,LimitAmount:IOU(1000000)}); await go(I,{TransactionType:'Payment',Account:I.address,Destination:a.address,Amount:IOU(100)}) }
const NOW=Math.floor(Date.now()/1000)-946684800
let r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:CUR,issuer:I.address},WithdrawalPolicy:1,VaultKind:1,SubscriptionDate:NOW+3600,RedemptionDate:NOW+7200})
const V=made(r.meta,'Vault'); console.log('USD vault:',r.code)
await go(lp,{TransactionType:'VaultDeposit',Account:lp.address,VaultID:V,Amount:IOU(50)})
r=await go(mgr,{TransactionType:'LoanBrokerSet',Account:mgr.address,VaultID:V,DebtMaximum:'50',ManagementFeeRate:1000,CoverRateMinimum:10000,CoverRateLiquidation:50000})
console.log('broker:',r.code)
const B=r.meta?made(r.meta,'LoanBroker'):null
if(!B){console.log('  no broker created, aborting'); await c.disconnect(); process.exit(0)}
console.log('cover deposit 20 USD:',(await go(mgr,{TransactionType:'LoanBrokerCoverDeposit',Account:mgr.address,LoanBrokerID:B,Amount:IOU(20)})).code)
const broker=async()=>(await c.request({command:'ledger_entry',index:B})).result.node
console.log('CoverAvailable before:',(await broker()).CoverAvailable)

console.log('\n=== issuer claws the first-loss cover ===')
console.log('  issuer LoanBrokerCoverClawback 10 USD:',(await go(I,{TransactionType:'LoanBrokerCoverClawback',Account:I.address,LoanBrokerID:B,Amount:IOU(10)})).code)
console.log('  CoverAvailable after partial:',(await broker()).CoverAvailable)
console.log('  issuer LoanBrokerCoverClawback ALL:',(await go(I,{TransactionType:'LoanBrokerCoverClawback',Account:I.address,LoanBrokerID:B})).code)
console.log('  CoverAvailable after full:',(await broker()).CoverAvailable)
console.log('  vault owner tries CoverClawback:',(await go(mgr,{TransactionType:'LoanBrokerCoverClawback',Account:mgr.address,LoanBrokerID:B,Amount:IOU(5)})).code)
await c.disconnect()
