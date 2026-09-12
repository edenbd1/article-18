import { Client, Wallet } from 'xrpl'
const c = new Client('wss://s.devnet.rippletest.net:51233'); await c.connect()
const { wallet: w } = await c.fundWallet()
const N = Math.floor(Date.now()/1000) - 946684800
const base = { TransactionType:'VaultCreate', Account:w.address, Asset:{currency:'XRP'}, WithdrawalPolicy:1, VaultKind:1 }
const run = async (label, tx) => {
  try { const r = await c.submitAndWait(tx,{autofill:true,wallet:w}); console.log(label.padEnd(34), r.result.meta.TransactionResult) }
  catch(e){ console.log(label.padEnd(34), (e?.data?.error_message ?? e.message)) }
}
await run('correct spelling',  { ...base, SubscriptionDate:N+300, RedemptionDate:N+900 })
await run("typo 'SubscribtionDate'", { ...base, SubscribtionDate:N+300, RedemptionDate:N+900 })
await run("typo 'RedemtionDate'",    { ...base, SubscriptionDate:N+300, RedemtionDate:N+900 })
await run("typo 'VaultType'",        { TransactionType:'VaultCreate', Account:w.address, Asset:{currency:'XRP'}, WithdrawalPolicy:1, VaultType:1, SubscriptionDate:N+300, RedemptionDate:N+900 })
await c.disconnect()
