# Developer feedback — XRPL Lending Protocol Hackathon

| | |
|---|---|
| **Team** | `eden` (DevEx participant `sturdy-badger-33`) |
| **Track / flavour** | Track 2 — closed-ended vault · Loaded |
| **Network** | Public XRPL Devnet, `wss://s.devnet.rippletest.net:51233`, `network_id` 2, **`build_version` 3.4.0-rc5** |
| **Also tested** | Hackathon Devnet, `wss://lending-hackathon.dev.ripplex.io:51233`, `network_id` 4001, **`build_version` 3.4.0-rc1** |
| **Library** | `xrpl@5.2.0` (stable, published 2026-09-11), `ripple-binary-codec@2.11.0` |
| **Date** | 2026-09-12 |

Every claim below comes from a transaction we submitted. Hashes resolve at
`https://devnet.xrpl.org/transactions/<hash>`. Reproductions are in `repro/`.

---

## 1. A borrower who is 12 seconds late cannot repay, and the error says "expired"

**Category:** UX (result codes) · **Severity:** high · **Repro:** `repro/loanpay-late.mjs`

Loan with `PaymentInterval` 60 s and `GracePeriod` 60 s. Submitting `LoanPay` for the exact
`PeriodicPayment`, **12 seconds after `NextPaymentDueDate` and well inside the grace period**:

| transaction | result |
|---|---|
| `LoanPay`, exact amount, no flags | **`tecEXPIRED`** |
| the same transaction with `tfLoanLatePayment` | **`tesSUCCESS`**, principal 20 → 13.33 XRP |

Devnet runs on wall-clock time, so any client that signs, submits and waits for validation is
routinely a few seconds past the due date. Our first full lifecycle run lost **all three**
repayments to this (`BF07E432EA35BD06C8384BB0736DB71189422D1E227D406860A1CA3E19BB73A0`); the
loan could not be repaid at all and the second lender's redemption then failed with
`tecINSUFFICIENT_FUNDS`, because the money was still out on a loan nobody could pay back.

**Why this matters beyond the hackathon.** `tecEXPIRED` reads as terminal — the loan or the
offer no longer exists. The actual meaning is "acknowledge lateness with a flag". A borrower's
wallet that does not already know this will conclude the loan is gone and stop retrying. In
production that converts a few seconds of lateness into an avoidable default, and the default
is then paid for by the vault's lenders.

**Proposal.** Accept a late payment inside the grace period without requiring the flag, or
return a code that names the remedy (`tecLATE_PAYMENT_FLAG_REQUIRED`). At minimum, document it
on the `LoanPay` page — today nothing connects `tfLoanLatePayment` to `tecEXPIRED`.

---

## 2. Two networks report identical amendments and behave differently

**Category:** other (network configuration) · **Severity:** high

The `feature` RPC returns the **same enabled amendment list** on both event networks, including
`LendingProtocol`, `LendingProtocolV1_1` and `fixCleanup3_4_0`. The same `LoanBrokerSet` against
an **open-ended** vault behaves in opposite ways:

| | Hackathon Devnet | Public Devnet |
|---|---|---|
| `build_version` | 3.4.0-rc1 | 3.4.0-rc5 |
| `LendingProtocolV1_1` per `feature` | enabled | enabled |
| `LoanBrokerSet` on an open-ended vault | **`tesSUCCESS`** | **`tecNO_PERMISSION`** |

succeeds `020E191549E58D69A98EC88FDE874EE1AE45FE95C235C0BA9ED72AC15FA3149F` ·
fails `953448AD40FAB37BB789C5F7A2BA72384B27967B692BD1AC4A143B0525682432`

**Repro:** create an open-ended vault, then `LoanBrokerSet` against it. Change only the endpoint.

The closed-ended restriction rides the **binary**, not the amendment. `feature` and
`server_definitions` are the documented way to ask a network what it supports, and here they
cannot distinguish the two — so reasoning from the amendment list, which is the correct method,
produces a false conclusion. It is also why Track 1 works at all: its network is pinned to rc1.

**Proposal.** Publish the required `build_version` per track; surface `build_version` next to
`network_id` in clients; gate a behaviour change of this size on an amendment, not a build.

---

## 3. The phase gates answer with codes from opposite families

**Category:** UX (result codes) · **Severity:** medium

The Track 2 brief asks whether phase-gate errors are legible. Measured on one vault:

| attempted in the wrong phase | result |
|---|---|
| `LoanSet` during **Subscription** | `tecTOO_SOON` |
| `VaultDeposit` during **Investment** | **`tecEXPIRED`** |
| `VaultWithdraw` during **Investment** | **`tecTOO_SOON`** |
| `LoanSet` during **Redemption** | `tecEXPIRED` |

The middle two are the **same vault, same phase, same moment**. One says the window has expired,
the other says it is too soon. Each is defensible narrowly — subscription has closed, redemption
has not opened — but no developer can infer "you are in the Investment phase" from either.
`tecTOO_SOON` additionally already means "this payment is not late yet" on `LoanManage`.

**Proposal.** One `tecWRONG_VAULT_PHASE`, or codes that name the phase.

---

## 4. One `temMALFORMED` for six distinct closed-ended misconfigurations

**Category:** UX (result codes) · **Severity:** medium

| `VaultCreate` attempt | result |
|---|---|
| `VaultKind: 1`, no dates | `temMALFORMED` |
| `SubscriptionDate` only | `temMALFORMED` |
| investment window 60 s | `temMALFORMED` |
| investment window **179 s** | `temMALFORMED` |
| `RedemptionDate` < `SubscriptionDate` | `temMALFORMED` |
| `VaultKind: 0` together with dates | `temMALFORMED` |
| investment window **180 s** | `tesSUCCESS` |
| `SubscriptionDate` in the past | `tecEXPIRED` — a `tec`: fee burned, ledger slot used |

Six configuration mistakes, one opaque code, no field named. The last row is worth separating:
drifting past your own `SubscriptionDate` while assembling the transaction is the likeliest
mistake when compressing a lifecycle into minutes, and it is the only one that charges you.

**Proposal.** Distinct codes, or name the offending field.

---

## 5. `kMinInvestmentPeriod` = 180 s is documented nowhere a developer will look

**Category:** documentation/tutorials · **Severity:** medium

`RedemptionDate − SubscriptionDate` must be at least **180 seconds**. We established this by
bisecting on-chain: 179 s fails, 180 s succeeds. The constant is in `Protocol.h` and on neither
the `VaultCreate` reference page nor the Lending Protocol V1.1 page. For a track whose brief says
to compress the lifecycle to the event timeline, it is the first number anyone needs.

---

## 6. The three fields Track 2 mandates are missing from the `VaultCreate` TypeScript model

**Category:** client libraries · **Severity:** low–medium · `xrpl@5.2.0` · **Repro:** `repro/ts-vaultcreate.ts`

`ripple-binary-codec@2.11.0` knows `VaultKind`, `SubscriptionDate` and `RedemptionDate` and they
submit correctly, but the exported `VaultCreate` interface declares none of them. Because
`BaseTransaction extends Record<string, unknown>`, adding them raises no TypeScript error either,
so the omission is invisible in both directions: the type system neither offers the fields nor
objects to them. A developer working from autocomplete cannot discover that closed-ended vaults
exist. **Credit where due:** a misspelling is caught client-side with a genuinely clear message
(`Field SubscribtionDate is not defined in the definitions`), not silently.

**Proposal.** Add the three fields to the interface. One line each.

---

## 7. The hackathon faucet answers instantly and funds minutes later

**Category:** other (infrastructure) · **Severity:** medium

`POST https://lending-hackathon-faucet.dev.ripplex.io/accounts` returns
`{address, secret, balance: 1000}` in under a second; the funding payment did not land for
roughly **three minutes**. Ledgers were closing normally at ~3 s, so this is the faucet queue,
not the network. Two of our runs polled `account_info` for 30 s and 160 s and aborted with
`actNotFound` on accounts funded shortly after. Every team writing the obvious retry loop loses
the same two runs.

**Proposal.** Fund before responding, or return an expected-ready hint.

---

## 8. First-loss cover: names mislead, measured live end to end

**Category:** UX / protocol · **Severity:** high · **Repro:** `fuzz/default-cycle.mjs`

Answering the Track feedback question directly: **the first-loss parameters do NOT behave as their
names suggest.** Full delinquency cycle on the hackathon network (rc1, open-ended vault):

| | |
|---|---|
| deposited | 100 XRP |
| first-loss cover | 5 XRP |
| `CoverRateMinimum` / `CoverRateLiquidation` | 10% / 50% |
| loan, unpaid | 20 XRP |
| naive UI `CoverAvailable / DebtTotal` | **25%** |
| cover actually consumed on default | **1 XRP** |
| **effective coverage** | **5%** |
| loss absorbed by lenders (`AssetsTotal` 100 → 81) | **19 XRP** |

The two rate fields **multiply** (10% × 50% = 5%), so two adjacent percentages that both read as
"coverage" compound into something ~5× smaller. Also measured: `LoanManage` impair sets
`LossUnrealized` to the *full* debt (20 XRP) before default realises the smaller net loss; and only
the broker owner may call impair/default — the borrower and a lender both get `tecNO_PERMISSION`.
Combined with self-dealing being permitted (see `fuzz/FUZZING.md` §5), one party can borrow the
pool and be the only one able to declare its default.

**Proposal.** Expose an `effectiveCoverage` figure in `vault_info`/broker queries, and state at the
point of use that the two rates multiply. Reinforces XRPL-Standards PR #494.

---

## 9. What worked

- **`signLoanSetByCounterparty` is correct in 5.2.0 and worked first try.** In `5.1.0` it signed
  with the plain transaction prefix instead of the dedicated counterparty prefix, so *every*
  `LoanSet` failed local checks. Two-party origination is now a three-line flow — a real fix.
- The library **warns that the auto-calculated `Fee` accounts for the counterparty signer
  count**, pre-empting exactly the failure you would otherwise hit.
- Phase enforcement itself is strict and predictable. Nothing leaked across a phase boundary in
  any run; the complaint in issue 3 is about the codes, not the behaviour.
- **Credentials + Permissioned Domains + `tfVaultPrivate` worked first try, and the refusal code
  is the right one.** An investor without the accepted credential is refused with **`tecNO_AUTH`**
  (`77B338DD56B260971C9109ACFEBEB48BBD453589E6DDC3E92BB2DE092C29A269`) — one code, unambiguous,
  and it names the actual reason. This is the direct contrast that makes issue 3 worth fixing:
  the same protocol already knows how to answer an authorisation question legibly, so the phase
  gates are the outlier, not the norm.
