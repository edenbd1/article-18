import { Client, Wallet } from 'xrpl'
import fs from 'fs'

export const NET = {
  wss: 'wss://s.devnet.rippletest.net:51233',
  explorerTx: h => `https://devnet.xrpl.org/transactions/${h}`,
  explorerAcct: a => `https://devnet.xrpl.org/accounts/${a}`,
}
export const RIPPLE_EPOCH = 946684800
export const toRipple = unixSec => Math.floor(unixSec) - RIPPLE_EPOCH
export const nowRipple = () => toRipple(Date.now() / 1000)
export const sleep = ms => new Promise(r => setTimeout(r, ms))

const LOG_PATH = new URL(`../out/${process.env.TX_LOG ?? 'tx-log.json'}`, import.meta.url).pathname
export const txLog = []
export function flushLog() {
  fs.writeFileSync(LOG_PATH, JSON.stringify(txLog, null, 2))
}

/** Submit and record. Never throws on tec/tem — records the code, which is the point. */
export async function submit(client, wallet, tx, note = '') {
  const started = new Date().toISOString()
  let code, hash, meta = null, err = null
  try {
    const r = await client.submitAndWait(tx, { autofill: true, wallet })
    code = r.result.meta.TransactionResult
    hash = r.result.hash
    meta = r.result.meta
  } catch (e) {
    code = e?.data?.error_message ?? e?.message ?? String(e)
    err = code
  }
  const rec = { at: started, note, type: tx.TransactionType, account: tx.Account, code, hash,
                link: hash ? NET.explorerTx(hash) : null }
  txLog.push(rec); flushLog()
  const mark = code === 'tesSUCCESS' ? 'OK ' : '>> '
  console.log(`${mark}${(tx.TransactionType + '        ').slice(0,26)} ${code}${note ? '   — ' + note : ''}`)
  if (hash) console.log(`      ${NET.explorerTx(hash)}`)
  return { code, hash, meta, ok: code === 'tesSUCCESS', err }
}

export async function connect() {
  const c = new Client(NET.wss)
  await c.connect()
  const si = await c.request({ command: 'server_info' })
  console.log(`network: devnet  build ${si.result.info.build_version}  net_id ${si.result.info.network_id}\n`)
  return c
}

export async function fund(client, label) {
  const { wallet } = await client.fundWallet()
  console.log(`funded ${label.padEnd(10)} ${wallet.address}`)
  return wallet
}

export const created = (meta, type) =>
  meta.AffectedNodes.map(n => n.CreatedNode).filter(n => n?.LedgerEntryType === type)[0]?.LedgerIndex

export async function vaultState(client, vaultId) {
  const r = await client.request({ command: 'ledger_entry', index: vaultId })
  return r.result.node
}
