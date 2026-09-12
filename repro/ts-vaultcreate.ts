// Repro A — xrpl.js 5.2.0 / ripple-binary-codec 2.11.0
//
// `BaseTransaction extends Record<string, unknown>`, so the VaultCreate interface accepts ANY
// extra key. The three fields that Track 2 mandates are absent from the interface, so:
//   1. there is no autocomplete and no discoverability for VaultKind/SubscriptionDate/RedemptionDate;
//   2. a typo in any of them type-checks cleanly and fails on-chain as an opaque temMALFORMED.
import { VaultCreate } from 'xrpl'

// Correct spelling — compiles, but nothing in the type told the developer these exist.
export const good: VaultCreate = {
  TransactionType: 'VaultCreate',
  Account: 'rEXAMPLE00000000000000000000000000',
  Asset: { currency: 'XRP' },
  WithdrawalPolicy: 1,
  VaultKind: 1,
  SubscriptionDate: 800000000,
  RedemptionDate: 800000600,
}

// One letter wrong. Type-checks identically. Fails at submit with temMALFORMED.
export const typo: VaultCreate = {
  TransactionType: 'VaultCreate',
  Account: 'rEXAMPLE00000000000000000000000000',
  Asset: { currency: 'XRP' },
  WithdrawalPolicy: 1,
  VaultKind: 1,
  SubscribtionDate: 800000000,   // <-- 'Subscribtion', no error
  RedemptionDate: 800000600,
}
