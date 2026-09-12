/**
 * Map XLS-68 Sponsor over lending txs: fee-only (flag 1), reserve (flag 2), both (3).
 * validate() blocks spfSponsorReserve on VaultDeposit claiming it creates no objects, but the
 * first VaultDeposit creates the depositor share MPToken. Test protocol truth via codec bypass.
 */
import { Client, Wallet, signAsSponsor } from 'xrpl'
import { encode, encodeForSigning } from 'ripple-binary-codec'
import { sign as kpSign } from 'ripple-keypairs'
const c=new Client('wss://s.devnet.rippletest.net:51233'); await c.connect()
const go=async(w,tx)=>{try{const r=await c.submitAndWait(tx,{autofill:true,wallet:w});return{code:r.result.meta.TransactionResult,meta:r.result.meta,hash:r.result.hash}}catch(e){return{code:e?.data?.error_message??e.message}}}
const made=(m,t)=>m.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType===t)[0]?.LedgerIndex
const signCodec=(w,tx)=>{const t={...tx,SigningPubKey:w.publicKey};t.TxnSignature=kpSign(encodeForSigning(t),w.privateKey);return t}
const [fund,lender]=await Promise.all([c.fundWallet(),c.fundWallet()]).then(a=>a.map(x=>x.wallet))
let r=await go(fund,{TransactionType:'VaultCreate',Account:fund.address,Asset:{currency:'XRP'},WithdrawalPolicy:1})
const V=made(r.meta,'Vault')
const bal=a=>c.getXrpBalance(a)

// helper: sponsored submit (account signs, sponsor co-signs). bypass=true signs via codec (skip validate)
async function sponsoredSubmit(acct, sponsor, txin, flags, bypass){
  const ai=await c.request({command:'account_info',account:acct.address,ledger_index:'current'})
  const cur=await c.getLedgerIndex()
  const base={...txin,Account:acct.address,Sequence:ai.result.account_data.Sequence,Fee:'20',LastLedgerSequence:cur+8,Sponsor:sponsor.address,SponsorFlags:flags}
  try{
    let blob
    if(bypass){ const signed=signCodec(acct,base);
      // sponsor co-signs the codec-signed tx
      const st={...signed}; const sp={...st}; delete sp.SponsorSignature
      const msg='53504e00'+encodeForSigning(sp).slice(8)  // SponsorTxSign prefix
      st.SponsorSignature={SigningPubKey:sponsor.publicKey,TxnSignature:kpSign(msg,sponsor.privateKey)}
      blob=encode(st)
    } else {
      const signed=acct.sign(base); blob=signAsSponsor(sponsor,signed.tx_blob).tx_blob
    }
    const rr=await c.submitAndWait(blob)
    return rr.result.meta.TransactionResult
  }catch(e){return e?.data?.error_message??e.message}
}

console.log('=== Sponsor over VaultDeposit ===')
console.log('  fee-only (flag 1), normal flow:', await sponsoredSubmit(lender,fund,{TransactionType:'VaultDeposit',VaultID:V,Amount:'20000000'},1,false))
const lb=await bal(lender.address)
console.log('  lender balance after fee-sponsored deposit:', lb, 'XRP')
console.log('  reserve (flag 2) via codec bypass (protocol truth):', await sponsoredSubmit(lender,fund,{TransactionType:'VaultDeposit',VaultID:V,Amount:'10000000'},2,true))
console.log('  both (flag 3) via codec bypass:', await sponsoredSubmit(lender,fund,{TransactionType:'VaultDeposit',VaultID:V,Amount:'10000000'},3,true))
console.log('\n=== Sponsor over VaultCreate (creates objects) ===')
const [fund2,creator]=await Promise.all([c.fundWallet(),c.fundWallet()]).then(a=>a.map(x=>x.wallet))
console.log('  VaultCreate reserve-sponsored (flag 3) codec:', await sponsoredSubmit(creator,fund2,{TransactionType:'VaultCreate',Asset:{currency:'XRP'},WithdrawalPolicy:1},3,true))
await c.disconnect()
