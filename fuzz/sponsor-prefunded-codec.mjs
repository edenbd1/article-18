import { Client, Wallet } from 'xrpl'
import { encode, encodeForSigning } from 'ripple-binary-codec'
import { sign as kpSign } from 'ripple-keypairs'
const c=new Client('wss://s.devnet.rippletest.net:51233'); await c.connect()
const go=async(w,tx,note)=>{try{const r=await c.submitAndWait(tx,{autofill:true,wallet:w});console.log(' ',(note||tx.TransactionType).padEnd(44),r.result.meta.TransactionResult);return{code:r.result.meta.TransactionResult,meta:r.result.meta}}catch(e){console.log(' ',(note||tx.TransactionType).padEnd(44),(e?.data?.error_message??e.message).slice(0,70));return{code:'ERR'}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const signCodec=(w,tx)=>{const t={...tx,SigningPubKey:w.publicKey};t.TxnSignature=kpSign(encodeForSigning(t),w.privateKey);return t}
const [fund,lender]=await Promise.all([c.fundWallet(),c.fundWallet()]).then(a=>a.map(x=>x.wallet))
let r=await go(fund,{TransactionType:'VaultCreate',Account:fund.address,Asset:{currency:'XRP'},WithdrawalPolicy:1},'fund VaultCreate')
const V=made(r.meta,'Vault')
await go(fund,{TransactionType:'SponsorshipSet',Account:fund.address,Sponsee:lender.address,RemainingOwnerCountDelta:5,FeeAmountDelta:'2000000',MaxFee:'1000'},'SponsorshipSet (pre-fund lender)')

console.log('\n=== codec-signed VaultDeposit with pre-funded fee+reserve (SponsorFlags=3), bypassing SDK validate ===')
const ai=await c.request({command:'account_info',account:lender.address,ledger_index:'current'})
const cur=await c.getLedgerIndex()
const tx={TransactionType:'VaultDeposit',Account:lender.address,VaultID:V,Amount:'20000000',Sequence:ai.result.account_data.Sequence,Fee:'20',LastLedgerSequence:cur+8,Sponsor:fund.address,SponsorFlags:3}
try{ const blob=encode(signCodec(lender,tx)); const rr=await c.submitAndWait(blob); console.log('  server result:', rr.result.meta.TransactionResult, '| tx', rr.result.hash) }
catch(e){ console.log('  server result:', (e?.data?.error_message??e.message).slice(0,90)) }
// compare: fee-only (2) pre-funded via SDK path works?
console.log('\n=== control: fee-only sponsored deposit is fine (SDK allows) ===')
await c.disconnect()
