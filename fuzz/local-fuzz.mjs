/**
 * Local, zero-network fuzz of XLS-65/66 field validation.
 * For every field we mutate with an edge dictionary and record what each of the two
 * client-side gates says: the binary codec (encode) and xrpl.js validate().
 * A DISAGREEMENT (one accepts, the other rejects) is the interesting signal — it means
 * one gate will let through what the other, and possibly the server, will not.
 */
import { encode } from 'ripple-binary-codec'
import pkg from 'xrpl'
const { validate } = pkg

const R = '0'.repeat(64)
const ACC = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const meta = { Fee:'10', Sequence:1, SigningPubKey:'' }

const bases = {
  VaultCreate:  { TransactionType:'VaultCreate', Account:ACC, Asset:{currency:'XRP'}, WithdrawalPolicy:1, VaultKind:1, SubscriptionDate:800000000, RedemptionDate:800000600 },
  LoanBrokerSet:{ TransactionType:'LoanBrokerSet', Account:ACC, VaultID:R, DebtMaximum:'1000000000', ManagementFeeRate:1000, CoverRateMinimum:10000, CoverRateLiquidation:50000 },
  LoanSet:      { TransactionType:'LoanSet', Account:ACC, LoanBrokerID:R, Counterparty:ACC, PrincipalRequested:'20000000', InterestRate:5000, PaymentInterval:60, PaymentTotal:3, GracePeriod:60 },
  LoanPay:      { TransactionType:'LoanPay', Account:ACC, LoanID:R, Amount:'8000000' },
}

// edge dictionaries by conceptual field kind
const RATE = [-1, 0, 1, 10000, 10001, 65535, 65536, 100000, 100001, 1000000, 4294967295, 4294967296, 2.5, '10000']
const UINT32 = [-1, 0, 1, 4294967295, 4294967296, 2.5, '5', 99999999999]
const UINT8  = [-1, 0, 1, 2, 3, 255, 256, 1.5]
const NUM = ['0','-1','1','1.5','20000000','99999999999999999999999999','1e20','0x10','','abc','  5 ', '000', '9'.repeat(50), -20000000, 20000000]
const DATE = [-1, 0, 1, 800000000, 4294967295, 4294967296]

const fieldKinds = {
  VaultKind:UINT8, WithdrawalPolicy:UINT8, Scale:UINT8,
  SubscriptionDate:DATE, RedemptionDate:DATE,
  ManagementFeeRate:RATE, CoverRateMinimum:RATE, CoverRateLiquidation:RATE,
  InterestRate:RATE, PaymentInterval:UINT32, PaymentTotal:UINT32, GracePeriod:UINT32,
  DebtMaximum:NUM, PrincipalRequested:NUM, AssetsMaximum:NUM,
  Amount:NUM,
}

const run = (tx) => {
  let enc, val
  try { encode(tx); enc = 'accept' } catch(e){ enc = 'reject' }
  try { validate({ ...tx, ...meta }); val = 'accept' } catch(e){ val = 'reject:'+(e.message.match(/must be[^.]*/)?.[0] ?? e.message.slice(0,50)) }
  return { enc, val }
}

const disagreements = []
for (const [txType, base] of Object.entries(bases)) {
  for (const [field, edges] of Object.entries(fieldKinds)) {
    if (!(field in base)) continue
    for (const v of edges) {
      const tx = { ...base, [field]: v }
      const { enc, val } = run(tx)
      const encA = enc === 'accept', valA = val === 'accept'
      if (encA !== valA) disagreements.push({ txType, field, value: v, enc, val })
    }
  }
}

console.log(`\n=== codec vs validate() DISAGREEMENTS (${disagreements.length}) ===`)
console.log('these values pass one client gate and fail the other\n')
let last=''
for (const d of disagreements) {
  const tag = `${d.txType}.${d.field}`
  if (tag !== last) { console.log(`\n${tag}:`); last = tag }
  const codec = d.enc === 'accept' ? 'codec✓' : 'codec✗'
  const va = d.val === 'accept' ? 'validate✓' : 'validate✗'
  console.log(`  ${String(JSON.stringify(d.value)).padEnd(30)} ${codec}  ${va}  ${d.val.startsWith('reject:')?d.val.slice(7):''}`)
}
