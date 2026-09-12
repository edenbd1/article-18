/**
 * XLS-68 Sponsor integration: a lender's VaultDeposit with the fund sponsoring fee + reserve
 * (SponsorFlags=3). The lender does not spend XRP on the transaction fee or on the owner reserve
 * for the new share MPToken. Real tx on public devnet.
 */
import { Client, Wallet, signAsSponsor } from 'xrpl'
const c=new Client('wss://s.devnet.rippletest.net:51233'); await c.connect()
console.log('build', (await c.request({command:'server_info'})).result.info.build_version)
const go=async(w,tx)=>{try{const r=await c.submitAndWait(tx,{autofill:true,wallet:w});return{code:r.result.meta.TransactionResult,meta:r.result.meta,hash:r.result.hash}}catch(e){return{code:e?.data?.error_message??e.message}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const [fund,lender]=await Promise.all([c.fundWallet(),c.fundWallet()]).then(a=>a.map(x=>x.wallet))
console.log('fund(sponsor)',fund.address,'lender',lender.address)
let r=await go(fund,{TransactionType:'VaultCreate',Account:fund.address,Asset:{currency:'XRP'},WithdrawalPolicy:1})
const V=made(r.meta,'Vault'); console.log('vault',r.code)
const bal=async a=>c.getXrpBalance(a)
const lb0=await bal(lender.address), fb0=await bal(fund.address)
console.log(`\nbefore: lender ${lb0} XRP, fund ${fb0} XRP`)

console.log('\n=== sponsored VaultDeposit: lender deposits 20 XRP, fund pays fee + reserve ===')
const prep=await c.autofill({TransactionType:'VaultDeposit',Account:lender.address,VaultID:V,Amount:'20000000',Sponsor:fund.address,SponsorFlags:3})
console.log('  Fee on tx:', prep.Fee, '| Sponsor:', prep.Sponsor, '| SponsorFlags:', prep.SponsorFlags)
const signed=lender.sign(prep)
const sponsored=signAsSponsor(fund, signed.tx_blob)
const rr=await c.submitAndWait(sponsored.tx_blob)
console.log('  result:', rr.result.meta.TransactionResult, '| tx', rr.result.hash)
console.log('  https://devnet.xrpl.org/transactions/'+rr.result.hash)

const lb1=await bal(lender.address), fb1=await bal(fund.address)
console.log(`\nafter: lender ${lb1} XRP, fund ${fb1} XRP`)
console.log(`  lender spent: ${(lb0-lb1).toFixed(6)} XRP (should be ~20, the deposit only, no fee/reserve)`)
console.log(`  fund spent:   ${(fb0-fb1).toFixed(6)} XRP (fee + reserve sponsored on lender's behalf)`)
await c.disconnect()
