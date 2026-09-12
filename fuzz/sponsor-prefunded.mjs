/**
 * Pre-funded sponsorship: fund establishes a SponsorshipSet for a lender, then the lender's
 * VaultDeposit draws fee + reserve from it (addPreFundedSponsor). Goal: a lender needs no XRP
 * beyond a minimal account. Public devnet.
 */
import { Client, Wallet, addPreFundedSponsor, SponsorFlags } from 'xrpl'
const c=new Client('wss://s.devnet.rippletest.net:51233'); await c.connect()
const go=async(w,tx,note)=>{try{const r=await c.submitAndWait(tx,{autofill:true,wallet:w});console.log(' ',(note||tx.TransactionType).padEnd(46),r.result.meta.TransactionResult);return{code:r.result.meta.TransactionResult,meta:r.result.meta,hash:r.result.hash}}catch(e){const code=e?.data?.error_message??e.message;console.log(' ',(note||tx.TransactionType).padEnd(46),code);return{code}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const [fund,lender]=await Promise.all([c.fundWallet(),c.fundWallet()]).then(a=>a.map(x=>x.wallet))
let r=await go(fund,{TransactionType:'VaultCreate',Account:fund.address,Asset:{currency:'XRP'},WithdrawalPolicy:1},'fund VaultCreate')
const V=made(r.meta,'Vault')
const bal=a=>c.getXrpBalance(a); const oc=async a=>(await c.request({command:'account_info',account:a})).result.account_data.OwnerCount

console.log('\n=== 1. establish SponsorshipSet (fund pre-funds lender fee + reserves) ===')
const variants=[
  {Sponsee:lender.address, RemainingOwnerCountDelta:5, FeeAmountDelta:'1000000', MaxFee:'1000'},
  {Sponsee:lender.address, RemainingOwnerCountDelta:5},
  {Sponsee:lender.address, FeeAmountDelta:'1000000', RemainingOwnerCountDelta:5, Flags:{tfSponsorshipSetRequireSignForFee:false}},
]
let established=false
for(const v of variants){ const rr=await go(fund,{TransactionType:'SponsorshipSet',Account:fund.address,...v},'SponsorshipSet '+JSON.stringify(v).slice(0,40)); if(rr.code==='tesSUCCESS'){established=true;break} }

console.log('\n=== 2. lender VaultDeposit drawing fee + reserve from the pre-funded sponsorship ===')
const lb0=await bal(lender.address), oc0=await oc(lender.address)
console.log('  lender before: balance',lb0,'XRP, ownerCount',oc0)
const dep=addPreFundedSponsor({TransactionType:'VaultDeposit',Account:lender.address,VaultID:V,Amount:'20000000'}, fund.address, SponsorFlags.spfSponsorFee|SponsorFlags.spfSponsorReserve)
await go(lender, dep, 'VaultDeposit (pre-funded fee+reserve)')
const lb1=await bal(lender.address), oc1=await oc(lender.address)
console.log('  lender after:  balance',lb1,'XRP, ownerCount',oc1)
console.log('  lender spent:',(lb0-lb1).toFixed(6),'XRP (deposit 20 only => fee+reserve sponsored)')
await c.disconnect()
