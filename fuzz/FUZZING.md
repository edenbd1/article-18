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
