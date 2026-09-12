import { Client, Wallet } from 'xrpl'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const c=new Client('wss://lending-hackathon.dev.ripplex.io:51233'); await c.connect()
const seeds=process.env.HACK_SEEDS.split(',')
const mgr=Wallet.fromSeed(seeds[0]), lp=Wallet.fromSeed(seeds[1])
const vaults=(await c.request({command:'account_objects',account:mgr.address,type:'vault'})).result.account_objects
for(const v of vaults){
  console.log('VAULT', v.index)
  console.log('  ', JSON.stringify({AssetsTotal:v.AssetsTotal,AssetsAvailable:v.AssetsAvailable,LossUnrealized:v.LossUnrealized,VaultKind:v.VaultKind??v.Data,ShareMPTID:v.ShareMPTID,MPTokenIssuanceID:v.MPTokenIssuanceID,mptid:v.shares?.MPTokenIssuanceID}))
  console.log('  full keys:', Object.keys(v).join(','))
}
// lp holdings
const lpobj=(await c.request({command:'account_objects',account:lp.address})).result.account_objects
console.log('\nLP objects:', lpobj.map(o=>o.LedgerEntryType+(o.MPTAmount?(' '+o.MPTAmount):'' )).join(' | '))
console.log('LP MPTokens raw:', JSON.stringify(lpobj.filter(o=>o.LedgerEntryType==='MPToken'),null,1).slice(0,800))
await c.disconnect()
