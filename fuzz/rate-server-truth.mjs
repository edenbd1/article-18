/**
 * Server-enforced bounds on lending rate fields vs what xrpl.js validate() claims.
 * True bypass: sign with the codec + keypairs only, never xrpl.js validate()/sign().
 * Each rate value gets a FRESH vault+broker so update semantics don't confound it.
 * NET=pub|hack ; HACK_SEEDS=s1,s2,... for the hackathon faucet accounts.
 */
import { Client, Wallet } from 'xrpl'
import { encode, encodeForSigning } from 'ripple-binary-codec'
import { sign as kpSign } from 'ripple-keypairs'

const NET = process.env.NET === 'hack'
  ? { wss:'wss://lending-hackathon.dev.ripplex.io:51233', name:'HACKATHON rc1' }
  : { wss:'wss://s.devnet.rippletest.net:51233', name:'PUBLIC rc5' }
const c = new Client(NET.wss); await c.connect()
const si = await c.request({ command:'server_info' })
const NETID = si.result.info.network_id
const needsNetId = NETID > 1024
console.log(`\n=== ${NET.name} · build ${si.result.info.build_version} · net ${si.result.info.network_id} ===\n`)

async function acct(idx) {
  if (process.env.HACK_SEEDS) {
    const w = Wallet.fromSeed(process.env.HACK_SEEDS.split(',')[idx])
    for (let i=0;i<150;i++){ try { await c.request({command:'account_info',account:w.address}); break } catch { await new Promise(r=>setTimeout(r,3000)) } }
    return w
  }
  return (await c.fundWallet()).wallet
}
function signCodec(w, tx) {                     // bypasses validate entirely
  const t = { ...tx, SigningPubKey: w.publicKey }
  t.TxnSignature = kpSign(encodeForSigning(t), w.privateKey)
  return encode(t)
}
async function raw(w, tx) {
  const ai = await c.request({ command:'account_info', account:w.address, ledger_index:'current' })
  const cur = await c.getLedgerIndex()
  const full = { ...tx, Sequence: ai.result.account_data.Sequence, Fee:'100', LastLedgerSequence: cur+20, ...(needsNetId?{NetworkID:NETID}:{}) }
  let blob
  try { blob = signCodec(w, full) } catch(e){ return { code:'CODEC_THROW: '+e.message.slice(0,50) } }
  try { const r = await c.submitAndWait(blob); return { code:r.result.meta.TransactionResult, meta:r.result.meta } }
  catch(e){ return { code: e?.data?.error_message ?? e.message } }
}
const objIndex = async (addr, type) => (await c.request({ command:'account_objects', account:addr, type })).result.account_objects

const mgr = await acct(0)
console.log('mgr', mgr.address, '\n')
const N = () => Math.floor(Date.now()/1000) - 946684800

async function freshBroker(mgmt, mn, lq) {
  const vc = await raw(mgr, { TransactionType:'VaultCreate', Account:mgr.address, Asset:{currency:'XRP'}, WithdrawalPolicy:1, VaultKind:1, SubscriptionDate:N()+3600, RedemptionDate:N()+7200 })
  if (vc.code !== 'tesSUCCESS') return { vc: vc.code }
  const vaults = await objIndex(mgr.address, 'vault')
  const VAULT = vaults[vaults.length-1].index
  const bs = await raw(mgr, { TransactionType:'LoanBrokerSet', Account:mgr.address, VaultID:VAULT, DebtMaximum:'1000000000', ManagementFeeRate:mgmt, CoverRateMinimum:mn, CoverRateLiquidation:lq })
  let onledger = null
  if (bs.code === 'tesSUCCESS' && bs.meta) {
    const idx = bs.meta.AffectedNodes.map(n=>n.CreatedNode).filter(n=>n?.LedgerEntryType==='LoanBroker')[0]?.LedgerIndex
    const b = (await c.request({ command:'ledger_entry', index:idx })).result.node
    onledger = { mgmt:b.ManagementFeeRate, mn:b.CoverRateMinimum, lq:b.CoverRateLiquidation }
  }
  return { vc: vc.code, bs: bs.code, onledger }
}

console.log('--- ManagementFeeRate at broker creation (validate caps 10000; codec caps 65535) ---')
for (const v of [1000, 10000, 10001, 30000, 65535]) {
  const r = await freshBroker(v, 10000, 50000)
  console.log(`  ManagementFeeRate=${String(v).padStart(6)}  ->  ${String(r.bs ?? r.vc).padEnd(26)}  on-ledger=${r.onledger?.mgmt ?? '—'}`)
}
console.log('\n--- CoverRate min x liq at creation (is first-loss capped at 100%?) ---')
for (const [mn,lq] of [[100000,100000],[100001,50000],[0,50000],[100000,1]]) {
  const r = await freshBroker(1000, mn, lq)
  console.log(`  min=${String(mn).padStart(6)} liq=${String(lq).padStart(6)}  ->  ${String(r.bs ?? r.vc).padEnd(26)}  on-ledger min=${r.onledger?.mn ?? '—'} liq=${r.onledger?.lq ?? '—'}`)
}
await c.disconnect()
