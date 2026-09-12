import { connect, fund, submit, nowRipple, created } from './src/lib.mjs'
const c = await connect()
const w = await fund(c, 'probe')
const N = nowRipple()
const base = { TransactionType:'VaultCreate', Account:w.address, Asset:{currency:'XRP'}, WithdrawalPolicy:1, VaultKind:1 }
const cases = [
  ['no dates at all',                    {}],
  ['SubscriptionDate only',              { SubscriptionDate:N+300 }],
  ['investment window = 60s (<180 min)', { SubscriptionDate:N+300, RedemptionDate:N+360 }],
  ['investment window = 179s',           { SubscriptionDate:N+300, RedemptionDate:N+479 }],
  ['investment window = 180s (exact)',   { SubscriptionDate:N+300, RedemptionDate:N+480 }],
  ['SubscriptionDate in the past',       { SubscriptionDate:N-300, RedemptionDate:N+600 }],
  ['Redemption before Subscription',     { SubscriptionDate:N+600, RedemptionDate:N+300 }],
  ['VaultKind:0 + dates',                { SubscriptionDate:N+300, RedemptionDate:N+900, VaultKind:0 }],
]
for (const [note, extra] of cases) await submit(c, w, { ...base, ...extra }, note)
await c.disconnect()
