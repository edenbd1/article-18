/**
 * Full delinquency cycle on rc1 open-ended vault (Track 1 env, no phase waits):
 * originate -> go delinquent -> impair -> default, measuring how much first-loss cover is
 * actually consumed vs the loss the LPs absorb, and who is authorised to call LoanManage.
 * HACK_SEEDS=mgr,lp,borrower
 */
import { Client, Wallet, signLoanSetByCounterparty } from 'xrpl'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const c=new Client('wss://lending-hackathon.dev.ripplex.io:51233'); await c.connect()
const si=await c.request({command:'server_info'}); const NETID=si.result.info.network_id
console.log('HACK build',si.result.info.build_version,'net',NETID,'\n')
const seeds=process.env.HACK_SEEDS.split(',')
const w=async i=>{const x=Wallet.fromSeed(seeds[i]);for(let k=0;k<150;k++){try{await c.request({command:'account_info',account:x.address});break}catch{await sleep(3000)}}return x}
const nf=tx=>({...tx,NetworkID:NETID})
const go=async(wal,tx)=>{try{const r=await c.submitAndWait(nf(tx),{autofill:true,wallet:wal});return{code:r.result.meta.TransactionResult,meta:r.result.meta}}catch(e){return{code:e?.data?.error_message??e.message}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const N=()=>Math.floor(Date.now()/1000)-946684800
const drops=x=>x===undefined?'—':(Number(x)/1e6).toFixed(6)

const mgr=await w(0), lp=await w(1), bor=await w(2)
let r=await go(mgr,{TransactionType:'VaultCreate',Account:mgr.address,Asset:{currency:'XRP'},WithdrawalPolicy:1})
const V=made(r.meta,'Vault'); console.log('open vault',r.code)
console.log('lp deposit 100 XRP:',(await go(lp,{TransactionType:'VaultDeposit',Account:lp.address,VaultID:V,Amount:'100000000'})).code)
r=await go(mgr,{TransactionType:'LoanBrokerSet',Account:mgr.address,VaultID:V,DebtMaximum:'100000000',ManagementFeeRate:1000,CoverRateMinimum:10000,CoverRateLiquidation:50000})
const B=made(r.meta,'LoanBroker'); console.log('broker (cover 10% x liq 50%):',r.code)
console.log('cover deposit 5 XRP:',(await go(mgr,{TransactionType:'LoanBrokerCoverDeposit',Account:mgr.address,LoanBrokerID:B,Amount:'5000000'})).code)

const vault=async()=>(await c.request({command:'ledger_entry',index:V})).result.node
const broker=async()=>(await c.request({command:'ledger_entry',index:B})).result.node
const show=async tag=>{const v=await vault(),b=await broker();console.log(`  [${tag}] vault AssetsTotal=${drops(v.AssetsTotal)} Available=${drops(v.AssetsAvailable)} LossUnrealized=${drops(v.LossUnrealized??'0')} | broker DebtTotal=${drops(b.DebtTotal)} CoverAvailable=${drops(b.CoverAvailable)}`)}

console.log('\n=== originate 20 XRP loan, 60s interval, 60s grace, borrower will NOT pay ===')
const prep=await c.autofill(nf({TransactionType:'LoanSet',Account:mgr.address,LoanBrokerID:B,Counterparty:bor.address,PrincipalRequested:'20000000',InterestRate:5000,PaymentInterval:60,PaymentTotal:3,GracePeriod:60}))
r=await(async()=>{try{const both=signLoanSetByCounterparty(bor,mgr.sign(prep).tx_blob);const rr=await c.submitAndWait(both.tx_blob);return{code:rr.result.meta.TransactionResult,meta:rr.result.meta}}catch(e){return{code:e?.data?.error_message??e.message}}})()
const L=made(r.meta,'Loan'); console.log('LoanSet',r.code)
const ln=(await c.request({command:'ledger_entry',index:L})).result.node
console.log('  NextPaymentDueDate',ln.NextPaymentDueDate,'now',N(),'| PaymentRemaining',ln.PaymentRemaining)
await show('after drawdown')

console.log('\n=== authorization: who may call LoanManage? ===')
console.log('  borrower impair:', (await go(bor,{TransactionType:'LoanManage',Account:bor.address,LoanID:L,Flags:{tfLoanImpair:true}})).code)
console.log('  lp impair:      ', (await go(lp, {TransactionType:'LoanManage',Account:lp.address, LoanID:L,Flags:{tfLoanImpair:true}})).code)

const due=ln.NextPaymentDueDate
let wait=due-N()+8; if(wait>0){console.log(`\n… waiting ${wait}s past NextPaymentDueDate`);await sleep(wait*1000)}
console.log('\n=== IMPAIR (owner) — should raise LossUnrealized / drop NAV ===')
console.log('  mgr impair:', (await go(mgr,{TransactionType:'LoanManage',Account:mgr.address,LoanID:L,Flags:{tfLoanImpair:true}})).code)
await show('after impair')

wait=due+60-N()+8; if(wait>0){console.log(`\n… waiting ${wait}s past grace for default`);await sleep(wait*1000)}
console.log('\n=== DEFAULT (owner) — measure cover consumed vs LP loss ===')
const bBefore=await broker(), vBefore=await vault()
console.log('  mgr default:', (await go(mgr,{TransactionType:'LoanManage',Account:mgr.address,LoanID:L,Flags:{tfLoanDefault:true}})).code)
await show('after default')
const bAfter=await broker(), vAfter=await vault()
const coverUsed=Number(bBefore.CoverAvailable||0)-Number(bAfter.CoverAvailable||0)
const debt=Number(bBefore.DebtTotal||0)
const vaultLoss=Number(vBefore.AssetsTotal||0)-Number(vAfter.AssetsTotal||0)
console.log('\n=== FIRST-LOSS REALITY ===')
console.log(`  debt at default:            ${drops(debt)} XRP`)
console.log(`  cover CONSUMED:             ${drops(coverUsed)} XRP`)
console.log(`  displayed CoverAvailable/DebtTotal (naive UI): ${(Number(bBefore.CoverAvailable||0)/debt*100).toFixed(1)}%`)
console.log(`  EFFECTIVE coverage (cover consumed / debt):     ${(coverUsed/debt*100).toFixed(1)}%`)
console.log(`  vault AssetsTotal drop (LP loss):               ${drops(vaultLoss)} XRP`)
await c.disconnect()
