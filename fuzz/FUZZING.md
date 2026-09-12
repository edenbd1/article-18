# Fuzzing & differential testing — XLS-65/66

Method: **fuzz locally first** (binary codec + `xrpl.js validate()`, zero network, unbounded),
then send only the surviving suspicious cases to the servers. Rate-limited, low volume — the
public devnet is shared with the other teams this weekend, so nothing here floods it.

Scripts: `local-fuzz.mjs` (codec vs validate), `rate-server-truth.mjs` (real server bounds,
both networks), `diff-loan-math.mjs` (fixed-point math, both networks), `logic-edges.mjs`
(economic edge cases).

## 1. `xrpl.js validate()` is systematically weaker than the codec (sdk)

54 codec-vs-`validate()` disagreements across the four transactions. The dangerous direction is
**validate accepts, codec/server later reject** — a false green light on the documented
sanitization step:

- `LoanPay.Amount` passes `""`, `"abc"`, `"-1"`, `"1.5"`, `"1e20"`, a 50-digit number.
- Rate fields accept floats (`2.5`).
- `SubscriptionDate`, `RedemptionDate`, `PaymentInterval`, `PaymentTotal` accept out-of-range
  UInt32 (`-1`, `4294967296`, `99999999999`).

## 2. `ManagementFeeRate`: three different bounds (sdk / protocol)

| source | max |
|---|---|
| ripple-binary-codec (UInt16) | 65535 |
| xrpl.js `validate()` | 10000 |
| **rippled (server truth, both networks)** | **10000** |

The codec is too permissive: 10001–65535 encode and sign fine, then the server rejects them with
a bare `temINVALID` that names no field. The other rate fields cap at 100000, so `ManagementFeeRate`
also uses a *different scale* from the cover/interest rates. Identical on rc1 and rc5.

## 3. First-loss cover is NOT capped below 100%, but is protected once lent (protocol)

- `CoverRateMinimum` × `CoverRateLiquidation` at `100000 × 100000` (100% × 100%) is accepted;
  `CoverRateMinimum = 0` and any rate `> 100000` are rejected with `temINVALID`. So the low
  effective coverage documented in `FEEDBACK.md` is a *configuration*, not a protocol limit.
- **Good:** `LoanBrokerCoverWithdraw` of cover backing an outstanding loan is refused
  (`tecINSUFFICIENT_FUNDS`); `CoverAvailable` is unchanged. The first-loss cover cannot be
  pulled out from under the lenders.

## 4. Fixed-point loan math is identical across rc1 and rc5 (negative result)

The hackathon network (rc1) is missing `fixUniversalNumber`, `fixSTAmountCanonicalize` and
`fixInnerObjTemplate`, which public devnet (rc5) has (see appendix). We originated six identical
loans, chosen to force repeating decimals, on both networks and diffed `PeriodicPayment`,
`TotalValueOutstanding` and `PrincipalOutstanding` byte for byte: **zero differences.** Example:
`PeriodicPayment = 6666667.935074192684` on both. The lending protocol's own arithmetic is
consistent between the two binaries.

## 5. ⚠️ Self-dealing is permitted — report to a mentor before pitching (protocol / risk)

On the hackathon network (rc1, open-ended vault — Track 1's actual environment), a `LoanSet`
whose `Counterparty` equals the broker owner, who is also the vault owner, returns **`tesSUCCESS`**.
The fund manager can borrow the lenders' deposited capital for themselves. Combined with the
established rule that **only the broker owner may call `LoanManage`** (impair / default), and that
XLS-75 forbids delegating those transactions, one party can borrow the pool's money *and* be the
only party able to declare the resulting default. This is the exact moral-hazard structure behind
the real RWA-credit failures (Maple/Orthogonal, Goldfinch).

This may be intentional — brokers legitimately can be borrowers — but the protocol enforces no
separation, and a naive vault UI would not surface it. Per the event rules, potential protocol
security issues go to a mentor privately before any presentation.

## Appendix — amendment diff (the two event networks are NOT equivalent)

`feature` reports the same *lending* amendments on both, but the networks are otherwise very
different binaries:

| | Hackathon (rc1) | Public devnet (rc5) |
|---|---|---|
| amendments enabled | 48 | 89 |
| `LendingProtocol` / `V1_1` / `fixCleanup3_4_0` | enabled | enabled |
| `fixUniversalNumber`, `fixSTAmountCanonicalize`, `fixInnerObjTemplate` | **absent/off** | enabled |
| `Flow`, `DepositAuth`, `Clawback`, `Checks`, `TicketBatch`, `NegativeUNL` … | off | enabled |
| `LoanBrokerSet` on an **open-ended** vault | `tesSUCCESS` | `tecNO_PERMISSION` |

The hackathon network is a hand-picked, minimal amendment set pinned to an rc1 binary; the
open-ended-vault behaviour difference (see `FEEDBACK.md` issue 2) rides that binary, not any
amendment the `feature` RPC reports.


## 6. XLS-65/66 transactions cannot be batched (protocol)

With `BatchV1_1` and the lending amendments enabled on both networks, a `Batch` of two plain
`Payment`s succeeds, but any `Batch` containing a `VaultCreate` / `VaultDeposit` /
`LoanBrokerCoverDeposit` inner is rejected with **`temINVALID_INNER_BATCH`** on rc1 *and* rc5.
Lending types are not on the Batch inner-transaction allowlist, so there is no native atomic
composition (no atomic "deposit + originate", no keeper batch of repayments) — and nothing
documents the exclusion. A single-inner Batch returns `temARRAY_EMPTY` (min two inners, also
undocumented). Repro: `batch-lending.mjs`, `batch-control.mjs`, `batch-rc5.mjs`.


## 7. Vault share math is sound against the ERC-4626 attack family (protocol, negative result)

Probed at a non-unit share price (a defaulted vault, 0.81 assets/share):

- **Deposit and withdraw are exact inverses.** Both use identical rounding; after 12 micro
  deposit/withdraw operations `AssetsTotal` and total shares returned to the *exact* starting
  values. No free-money round trip. (An individual `VaultWithdraw` looks like it under-burns
  shares in isolation, but deposit under-mints identically, so it nets to zero.)
- **No cross-holder leak.** With two holders, 15 one-drop round trips by one holder changed the
  other holder's asset claim by exactly 0 drops.
- **Donation inflation is structurally impossible.** A `Payment` to the vault's pseudo-account
  is rejected with `tecNO_PERMISSION`, so `AssetsTotal` (a tracked field) cannot be inflated
  without minting shares — the classic first-depositor inflation vector does not apply.

Repro: `share-rounding.mjs`, `share-crossholder.mjs`, `donation-inflation.mjs`.


## 8. Vault positions remain subject to the asset issuer's clawback (protocol)

Tested on public devnet (Clawback enabled), IOU-denominated vault, issuer I, owner mgr, lenders lp1/lp2:

- **The issuer can claw a lender's position out of the vault**, partially and in full (`tesSUCCESS`),
  even after deposit. `LoanBrokerCoverClawback` and `VaultClawback` are issuer powers.
- **The vault owner cannot** (`tecNO_PERMISSION`) — no manager seizure of LP capital.
- **XRP vaults cannot be clawed** (`tecNO_PERMISSION`, no issuer).
- **The clawback is isolated, not socialised.** Clawing lp1 in full burns lp1's shares
  (50M → 0) and removes only lp1's assets (`AssetsTotal` 100 → 50); lp2's shares and claim are
  unchanged. No dilution of other holders.

For a regulated RWA product (RLUSD, EURCV) this is the desired behaviour — a compliance clawback
survives the vault wrapper and hits only the target — but it is a risk lenders must be told about,
and none of it is on the `VaultCreate`/`VaultClawback` pages. Side note: an IOU vault needs the
issuer's `DefaultRipple` or `VaultCreate` fails with `terNO_RIPPLE`, unexplained.

Repro: `clawback.mjs`, `clawback-iou.mjs`, `clawback-contagion.mjs`.


## 9. The domain eligibility gate survives the secondary market (protocol)

A private, Permissioned-Domain-gated vault does not only gate deposits — it gates who can *hold*
the share MPT, on transfer too. Verified with a positive control:

- eligible holder → **eligible** holder: `Payment` of shares **tesSUCCESS**
- eligible holder → **ineligible** account (even after `MPTokenAuthorize`): **`tecNO_AUTH`**

The share MPT is flagged transferable (`tfMPTCanTransfer`), yet transfers to a non-member are
refused. So a lender cannot offload vault units onto a non-credentialed party — the KYC/ELTIF
guarantee holds on the secondary market, not just at subscription. Undocumented; worth stating as
a feature. Repro: `share-transfer.mjs`, `share-transfer-control.mjs`.


## 10. First-loss cover can be clawed back by the cover asset's issuer (protocol)

On a closed-ended USD vault with 20 USD of first-loss cover, the USD **issuer** called
`LoanBrokerCoverClawback` and removed it partially (20 → 10) then fully (→ 0), both `tesSUCCESS`.
The vault owner cannot (`tecNO_PERMISSION`). So first-loss cover denominated in a clawback-enabled
stablecoin (RLUSD, EURCV, most regulated stablecoins) is **not committed capital** — the issuer can
zero it out unilaterally. Combined with §2/§ FEEDBACK issue-on-first-loss (the two rates multiply,
so effective coverage is already ~5× below the displayed ratio), lender protection is doubly
fragile. Repro: `cover-clawback.mjs`.


## 11. The vault owner cannot freeze lender shares (protocol)

The share MPT issuance flags are `CanEscrow+CanTrade+CanTransfer` (+`RequireAuth` when the vault is
domain-gated), with **no `CanLock` and no `CanClawback`**. The vault owner calling
`MPTokenIssuanceSet` with `tfMPTLock` (whole issuance or a single holder) is refused
`tecNO_PERMISSION`, and the lender can still `VaultWithdraw`. So the only seizure power over a vault
position is the underlying asset issuer's `VaultClawback` (§8) — the fund operator can neither claw
nor freeze. Repro: `freeze-shares.mjs`.


## 12. LoanPay amount/flag semantics are confusing (protocol)

Mapped on one on-time loan (periodic ~12 XRP, `PaymentInterval` 600 s so nothing is late):

| payment | result | effect |
|---|---|---|
| underpay (< periodic) | `tecINSUFFICIENT_PAYMENT` | no change |
| **2× periodic, no flag** | **`tesSUCCESS`** | principal −24 XRP, `PaymentRemaining` 5 → 3 (two installments) |
| **2× periodic + `tfLoanOverpayment`** | **`tecNO_PERMISSION`** | none |
| exact periodic, no flag | `tesSUCCESS` | one installment |
| exact + `tfLoanFullPayment` | `tecINSUFFICIENT_PAYMENT` | none |
| full remaining + `tfLoanFullPayment` | `tesSUCCESS` | loan closed |
| pay a closed loan | `tecKILLED` | — |

The flag named `tfLoanOverpayment` is *rejected* while plain overpaying *works* (and silently
consumes multiple installments); `tfLoanFullPayment` with a short amount returns a generic
`tecINSUFFICIENT_PAYMENT`. Repro: `loanpay-matrix.mjs`.


## 13. Delete/cap paths are safe and legible (protocol) — and expose an inconsistency

All well-behaved, with clear codes:

| action | result |
|---|---|
| originate past `DebtMaximum` | `tecLIMIT_EXCEEDED` |
| `VaultDelete` with assets/broker | `tecHAS_OBLIGATIONS` |
| `LoanBrokerDelete` with cover/loan | `tecHAS_OBLIGATIONS` |
| `LoanDelete` on an active loan | `tecHAS_OBLIGATIONS` |
| lower `AssetsMaximum` below `AssetsTotal` | `tecLIMIT_EXCEEDED` |
| non-owner `VaultSet` | `tecNO_PERMISSION` |

No rug-by-delete, and `DebtMaximum` is a real cap. Note the contrast: these paths return precise,
legible codes, while vault-config errors collapse to `temMALFORMED` (§4) and phase gates to
`tecTOO_SOON`/`tecEXPIRED` (§ FEEDBACK 3). Since the protocol clearly can name the cause, the
opaque codes elsewhere are a fixable inconsistency. Repro: `lifecycle-edges.mjs`.


## 14. Re-gating is a manager lever but cannot trap a lender (protocol)

The owner can `VaultSet` the `DomainID` to a different domain after a lender subscribed under the
original one (`tesSUCCESS`) — go-forward eligibility is a unilateral manager power. But the
now-ineligible lender can still `VaultWithdraw` its full balance (`tesSUCCESS`): withdrawal
bypasses the current domain gate, so re-gating gates new deposits/transfers but **cannot trap a
lender's capital**. Sensible safety property + real governance lever, neither documented.
Repro: `domain-regate.mjs`.


## 15. Vault shares cannot be held confidentially (protocol)

`ConfidentialTransfer` is enabled on both networks, but a vault share MPT cannot use it: the
issuance `VaultCreate` produces has Flags 56 (`CanEscrow+CanTrade+CanTransfer`), missing
`tfMPTCanHoldConfidentialBalance` (128) — the flag required for confidential balances. `VaultCreate`
exposes only `tfVaultPrivate` and `tfVaultShareNonTransferable`, with no way to request it. So a
privacy-preserving lender position is not possible through vaults. (A `prepareConfidentialConvert`
attempt also failed on an `@xrplf/mpt-crypto` API-usage error, separate from this; the missing
issuance flag is the decisive blocker.) Repro: `confidential-shares.mjs`.
