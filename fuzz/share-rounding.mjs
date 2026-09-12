/**
 * Vault share-math rounding direction at price != 1 (defaulted vault, ~0.81 assets/share).
 * A safe vault rounds AGAINST the user: mint floor(assets*S/A) on deposit, burn ceil(assets*S/A)
 * on withdraw. If withdraw burns floor (fewer shares for the assets out), micro-withdrawals
 * extract value repeatably. We measure exact shares/assets deltas.
 * HACK_SEEDS=mgr,lp,bor ; VAULT=<index>
 */
import { Client, Wallet } from 'xrpl'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const c=new Client('wss://lending-hackathon.dev.ripplex.io:51233'); await c.connect()
const NETID=(await c.request({command:'server_info'})).result.info.network_id
const seeds=process.env.HACK_SEEDS.split(',')
const lp=Wallet.fromSeed(seeds[1])
const V=process.env.VAULT
const nf=t=>({...t,NetworkID:NETID})
const go=async(wal,tx)=>{try{const r=await c.submitAndWait(nf(tx),{autofill:true,wallet:wal});return{code:r.result.meta.TransactionResult}}catch(e){return{code:e?.data?.error_message??e.message}}}
const vault=async()=>(await c.request({command:'ledger_entry',index:V})).result.node
const shares=async()=>{const o=(await c.request({command:'account_objects',account:lp.address,type:'mptoken'})).result.account_objects[0];return BigInt(o.MPTAmount)}

let v=await vault(), S=await shares()
console.log(`start: AssetsTotal=${v.AssetsTotal} shares=${S} price=${(Number(v.AssetsTotal)/Number(S)).toFixed(6)} assets/share\n`)

const probe=async(kind, amt)=>{
  const A0=BigInt((await vault()).AssetsTotal), S0=await shares()
  const tx = kind==='withdraw'
    ? {TransactionType:'VaultWithdraw',Account:lp.address,VaultID:V,Amount:String(amt)}
    : {TransactionType:'VaultDeposit', Account:lp.address,VaultID:V,Amount:String(amt)}
  const r=await go(lp,tx)
  const A1=BigInt((await vault()).AssetsTotal), S1=await shares()
  const dA=A1-A0, dS=S1-S0
  // expected shares change magnitude if proportional (real number)
  const exact = Number(amt)*Number(S0)/Number(A0)
  console.log(`  ${kind} ${String(amt).padStart(4)}: ${r.code.padEnd(20)} dAssets=${dA} dShares=${dS}  exact|dShares|=${exact.toFixed(4)}  (${kind==='withdraw'?(dS===0n?'ZERO shares burned!':(-Number(dS)<exact?'floor/undershoot=user gains':'ceil/ok')):(Number(dS)>exact?'over-mint=user gains':'floor/ok')})`)
}

console.log('--- micro WITHDRAWALS (asset amount out) at price 0.81 ---')
for(const a of [1,2,3,4,5,10]) await probe('withdraw', a)
console.log('\n--- micro DEPOSITS at price 0.81 ---')
for(const a of [1,2,3,4,5,10]) await probe('deposit', a)

const vf=await vault(), Sf=await shares()
console.log(`\nend: AssetsTotal=${vf.AssetsTotal} shares=${Sf}`)
await c.disconnect()
