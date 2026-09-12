/** DID for the fund identity: publish an on-ledger DID document (prospectus URI). Public devnet. */
import { Client } from 'xrpl'
const c=new Client('wss://s.devnet.rippletest.net:51233'); await c.connect()
const hex=s=>Buffer.from(s,'utf8').toString('hex').toUpperCase()
const go=async(w,tx,note)=>{try{const r=await c.submitAndWait(tx,{autofill:true,wallet:w});console.log(' ',note.padEnd(40),r.result.meta.TransactionResult,'| tx',r.result.hash);return{code:r.result.meta.TransactionResult,hash:r.result.hash}}catch(e){console.log(' ',note.padEnd(40),(e?.data?.error_message??e.message).slice(0,70));return{code:'ERR'}}}
const { wallet: fund } = await c.fundWallet()
console.log('fund',fund.address,'\n=== DIDSet: fund publishes its identity / prospectus on-ledger ===')
const didDoc=JSON.stringify({"@context":"https://www.w3.org/ns/did/v1",id:`did:xrpl:${fund.address}`,alsoKnownAs:"Article 18 Fund",service:[{id:"#prospectus",type:"ELTIFProspectus",serviceEndpoint:"https://agama.finance/article18/prospectus"}]})
const r=await go(fund,{TransactionType:'DIDSet',Account:fund.address,URI:hex('https://agama.finance/article18/did.json'),Data:hex('Article 18 — ELTIF-shaped closed-ended fund'),DIDDocument:hex(didDoc)},'DIDSet (fund identity)')
// read it back
const objs=(await c.request({command:'account_objects',account:fund.address,type:'did'})).result.account_objects
if(objs[0]){console.log('\n  on-ledger DID:', objs[0].LedgerEntryType, '| URI decodes to:', Buffer.from(objs[0].URI,'hex').toString('utf8'))}
await c.disconnect()
