/**
 * Canonical Article 18 deployment — one coherent flow integrating the maximal REAL primitive set,
 * all real transactions on public XRPL devnet, captured to out/demo-data.json for the front-end.
 *   XLS-65 vault + XLS-66 loan + Credentials + Permissioned Domains + MPT shares + XLS-68 Sponsor.
 */
import { Client, Wallet, signLoanSetByCounterparty, signAsSponsor } from 'xrpl'
import fs from 'fs'
const WSS='wss://s.devnet.rippletest.net:51233', EXP=h=>`https://devnet.xrpl.org/transactions/${h}`
const RE=946684800, nowR=()=>Math.floor(Date.now()/1000)-RE, sleep=ms=>new Promise(r=>setTimeout(r,ms))
const hex=s=>Buffer.from(s,'utf8').toString('hex').toUpperCase()
const c=new Client(WSS); await c.connect()
const info=(await c.request({command:'server_info'})).result.info
const D={network:'XRPL Devnet',wss:WSS,build:info.build_version,network_id:info.network_id,generatedAt:new Date().toISOString(),tx:[],accounts:{},ids:{}}
const save=()=>fs.writeFileSync(new URL('../out/demo-data.json',import.meta.url).pathname,JSON.stringify(D,null,2))
const rec=(phase,type,code,hash,note,extra={})=>{D.tx.push({phase,type,code,hash,link:hash?EXP(hash):null,note,...extra});console.log(`[${phase}] ${type} ${code} ${note}`);save()}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const go=async(w,tx,phase,note)=>{try{const r=await c.submitAndWait(tx,{autofill:true,wallet:w});rec(phase,tx.TransactionType,r.result.meta.TransactionResult,r.result.hash,note);return{code:r.result.meta.TransactionResult,meta:r.result.meta,hash:r.result.hash}}catch(e){const code=e?.data?.error_message??e.message;rec(phase,tx.TransactionType,code.split(':')[0],null,note);return{code}}}
// accounts
const [assessor,fund,alice,mallory,borrower]=await Promise.all([c.fundWallet(),c.fundWallet(),c.fundWallet(),c.fundWallet(),c.fundWallet()]).then(a=>a.map(x=>x.wallet))
D.accounts={assessor:assessor.address,fund:fund.address,alice_eligible:alice.address,mallory_ineligible:mallory.address,borrower:borrower.address}
console.log('accounts funded'); save()
const CT=hex('ELTIF_RETAIL_SUITABILITY')

// 1. eligibility: credential + domain
await go(assessor,{TransactionType:'CredentialCreate',Account:assessor.address,Subject:alice.address,CredentialType:CT,URI:hex('https://agama.finance/suitability/alice')},'Eligibility','Assessor issues suitability credential to Alice')
await go(alice,{TransactionType:'CredentialAccept',Account:alice.address,Issuer:assessor.address,CredentialType:CT},'Eligibility','Alice accepts the credential (bilateral)')
let r=await go(fund,{TransactionType:'PermissionedDomainSet',Account:fund.address,AcceptedCredentials:[{Credential:{Issuer:assessor.address,CredentialType:CT}}]},'Eligibility','Fund declares the domain of acceptable investors')
const DOM=made(r.meta,'PermissionedDomain'); D.ids.domain=DOM; save()

// 2. closed-ended, private, domain-gated vault
const SUB=nowR()+120, RED=SUB+360
D.timeline={subscriptionDate:SUB,redemptionDate:RED,subscription_secs:120,investment_secs:360}
r=await go(fund,{TransactionType:'VaultCreate',Account:fund.address,Asset:{currency:'XRP'},WithdrawalPolicy:1,VaultKind:1,SubscriptionDate:SUB,RedemptionDate:RED,DomainID:DOM,Flags:{tfVaultPrivate:true},Data:hex('Article 18 - ELTIF-shaped closed-ended fund')},'Subscription','Closed-ended, private, domain-gated vault (VaultKind 1)')
const V=made(r.meta,'Vault'); D.ids.vault=V; D.ids.shareMPT=(await c.request({command:'ledger_entry',index:V})).result.node.ShareMPTID; save()

// 3. subscription: sponsored-fee deposit by eligible Alice; ineligible Mallory refused
const prep=await c.autofill({TransactionType:'VaultDeposit',Account:alice.address,VaultID:V,Amount:'40000000',Sponsor:fund.address,SponsorFlags:1})
try{const signed=alice.sign(prep);const sp=signAsSponsor(fund,signed.tx_blob);const rr=await c.submitAndWait(sp.tx_blob);rec('Subscription','VaultDeposit',rr.result.meta.TransactionResult,rr.result.hash,'Alice subscribes 40 XRP, fund SPONSORS the fee (XLS-68)',{sponsored:true})}catch(e){rec('Subscription','VaultDeposit',(e?.data?.error_message??e.message).split(':')[0],null,'sponsored deposit failed')}
save()
await go(mallory,{TransactionType:'VaultDeposit',Account:mallory.address,VaultID:V,Amount:'40000000'},'Subscription','GATE: ineligible Mallory tries to subscribe (expected tecNO_AUTH)')

// broker + cover during subscription
r=await go(fund,{TransactionType:'LoanBrokerSet',Account:fund.address,VaultID:V,DebtMaximum:'40000000',ManagementFeeRate:1000,CoverRateMinimum:10000,CoverRateLiquidation:50000},'Subscription','Fund sets the loan broker (10% x 50% first-loss)')
const B=made(r.meta,'LoanBroker'); D.ids.broker=B; save()
await go(fund,{TransactionType:'LoanBrokerCoverDeposit',Account:fund.address,LoanBrokerID:B,Amount:'4000000'},'Subscription','Fund deposits 4 XRP first-loss cover')

// GATE: lending blocked during subscription
try{const p=await c.autofill({TransactionType:'LoanSet',Account:fund.address,LoanBrokerID:B,Counterparty:borrower.address,PrincipalRequested:'20000000',InterestRate:5000,PaymentInterval:60,PaymentTotal:2,GracePeriod:60});const both=signLoanSetByCounterparty(borrower,fund.sign(p).tx_blob);const rr=await c.submitAndWait(both.tx_blob);rec('Subscription','LoanSet',rr.result.meta.TransactionResult,rr.result.hash,'GATE: origination during Subscription (expected reject)')}catch(e){rec('Subscription','LoanSet',(e?.data?.error_message??e.message).split(/[:.]/)[0],null,'GATE: origination during Subscription (expected reject)')}
save()

// wait Investment
console.log(`waiting ${SUB-nowR()+6}s for Investment`); await sleep((SUB-nowR()+6)*1000)

// GATE: deposit/withdraw blocked in Investment
await go(alice,{TransactionType:'VaultDeposit',Account:alice.address,VaultID:V,Amount:'1000000'},'Investment','GATE: deposit during Investment (expected reject)')
await go(alice,{TransactionType:'VaultWithdraw',Account:alice.address,VaultID:V,Amount:'1000000'},'Investment','GATE: withdraw during Investment (expected reject)')
// origination
let L=null
try{const p=await c.autofill({TransactionType:'LoanSet',Account:fund.address,LoanBrokerID:B,Counterparty:borrower.address,PrincipalRequested:'20000000',InterestRate:5000,PaymentInterval:60,PaymentTotal:2,GracePeriod:60});const both=signLoanSetByCounterparty(borrower,fund.sign(p).tx_blob);const rr=await c.submitAndWait(both.tx_blob);L=made(rr.result.meta,'Loan');D.ids.loan=L;rec('Investment','LoanSet',rr.result.meta.TransactionResult,rr.result.hash,'Double-signed origination: 20 XRP loan to borrower')}catch(e){rec('Investment','LoanSet',(e?.data?.error_message??e.message).split(/[:.]/)[0],null,'origination failed')}
save()
// repayments (late-safe)
if(L){for(let i=1;i<=2;i++){const cur=(await c.request({command:'ledger_entry',index:L})).result.node;const due=cur.NextPaymentDueDate;const amt=String(Math.ceil(Number(cur.PeriodicPayment)));if(due>nowR()){console.log(`wait ${due-nowR()+6}s payment ${i}`);await sleep((due-nowR()+6)*1000)}const late=nowR()>due;await go(borrower,{TransactionType:'LoanPay',Account:borrower.address,LoanID:L,Amount:amt,...(late?{Flags:{tfLoanLatePayment:true}}:{})},'Investment',`Repayment ${i}/2${late?' (late-safe flag)':''}`)}}

// wait Redemption
console.log(`waiting ${RED-nowR()+6}s for Redemption`); await sleep((RED-nowR()+6)*1000)
await go(alice,{TransactionType:'VaultWithdraw',Account:alice.address,VaultID:V,Amount:'40000000'},'Redemption','Alice redeems principal + yield')

D.done=true; save(); console.log('\nDEMO DATA WRITTEN:', D.tx.length, 'transactions')
await c.disconnect()
