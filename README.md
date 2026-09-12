# Article 18

**A closed-ended XRPL vault that behaves like an ELTIF.**

XLS-65 Single Asset Vault + XLS-66 Lending Protocol V1.1, with the fund lifecycle enforced by
the ledger instead of by a fund administrator.

> XRPL Lending Protocol Hackathon — IIM Nanterre, 12–13 September 2026
> **Track 2 (closed-ended) · Loaded** · Team `eden`

---

## Why this use case

The three phases of an XLS-66 closed-ended vault — Subscription, Investment, Redemption — are
the same three phases that **Article 18(1) of Regulation (EU) 2015/760 (ELTIF)** imposes on a
European Long-Term Investment Fund. The match is not an analogy:

| XLS-66 closed-ended vault | ELTIF regime |
|---|---|
| `SubscriptionDate`, immutable after creation | Art. 18(1): a defined subscription period |
| Investment phase, deposits and withdrawals blocked | Art. 18(1): no redemption before end of life |
| `RedemptionDate`, immutable after creation | Art. 18(1): a stated end of life |
| `kMaxInvestmentPeriod` = 30 years | Scope counts 128 closed ELTIFs of 4 to 30 years |
| `kLoanRedemptionBuffer` = 60 s, enforced at origination | Art. 21(1): pre-liquidation window |

In the existing regime a fund manager *declares* compliance with Article 18 and is audited after
the fact. Here the ledger **refuses the transaction**. That is the whole pitch: the same
constraint, moved from ex-post attestation to ex-ante consensus.

The European ELTIF market is 268 funds and €34.0bn, growing 54.7% year on year, with private
debt the largest asset class at €11.4bn — and French investors are 41.4% of the European total.
Nobody has tokenised a genuinely closed-ended fund.

## What this repository contains

| path | what |
|---|---|
| `src/lifecycle.mjs` | the full on-chain lifecycle, instrumented; every transaction is recorded with its result code |
| `src/lib.mjs` | connection, funding, and the transaction recorder that writes `out/tx-log.json` |
| `repro/` | minimal reproductions for the issues in `FEEDBACK.md` |
| `FEEDBACK.md` | the manual developer-feedback report |
| `out/tx-log.json` | every transaction of the last run, with result code and explorer link |

## Environment

| | |
|---|---|
| Track | 2 — closed-ended |
| Flavour | Loaded |
| Network | Public XRPL Devnet, `wss://s.devnet.rippletest.net:51233` |
| `build_version` | **3.4.0-rc5** (record it: see `FEEDBACK.md` issue 1) |
| `network_id` | 2 |
| Library | `xrpl@5.2.0` (stable, published 2026-09-11), `ripple-binary-codec@2.11.0` |
| Explorer | https://devnet.xrpl.org |

The event brief asks for `xrpl.js@5.2.0-beta.0`. The stable `5.2.0` shipped the evening before
the event and is what this project uses.

## Setup

```bash
npm install
node src/lifecycle.mjs          # ~10 minutes of wall-clock: Devnet cannot be fast-forwarded
```

Timeline is compressed with environment variables:

```bash
SUB_SECS=150 INV_SECS=330 node src/lifecycle.mjs
```

`INV_SECS` must be at least **180** (`kMinInvestmentPeriod`); 179 returns `temMALFORMED`.

## XLS-65 / XLS-66 transactions used

| transaction | standard | where |
|---|---|---|
| `VaultCreate` (`VaultKind: 1`, `SubscriptionDate`, `RedemptionDate`) | XLS-65 | step 1 |
| `VaultDeposit` | XLS-65 | step 2, and step 3 as a rejected phase gate |
| `VaultWithdraw` | XLS-65 | step 4, and step 3 as a rejected phase gate |
| `LoanBrokerSet` | XLS-66 | step 2 |
| `LoanBrokerCoverDeposit` | XLS-66 | step 2, first-loss cover |
| `LoanSet` (double-signed, broker + counterparty) | XLS-66 | step 3, and steps 2 and 4 as rejected phase gates |
| `LoanPay` (incl. `tfLoanFullPayment`) | XLS-66 | step 3 |

## Verified on-chain transactions

See `out/tx-log.json` for the machine-readable list. Highlights are in the table below.

### Closed-ended lifecycle (`src/lifecycle.mjs`)

| # | transaction | result | what it shows | tx |
|---|---|---|---|---|
| 1 | `VaultCreate` | `tesSUCCESS` | closed-ended vault, dates compressed to the event timeline | [`9C182848A2…`](https://devnet.xrpl.org/transactions/9C182848A2499067F79454903A0877B3C6F809AE8FD174EBF768F55FFB3C745B) |
| 2 | `VaultDeposit` | `tesSUCCESS` | lender A subscribes 40 XRP | [`A79FDB8EA3…`](https://devnet.xrpl.org/transactions/A79FDB8EA3433750FA3AE54F3F101CC217310255CF95C7A06E74484E9DAB538B) |
| 3 | `VaultDeposit` | `tesSUCCESS` | lender B subscribes 30 XRP | [`8BC2B141C3…`](https://devnet.xrpl.org/transactions/8BC2B141C3C200B49DE255E3161E18976BD8D6A32BACA02E6E952AE26340B46E) |
| 4 | `LoanBrokerSet` | `tesSUCCESS` | loan broker, 10% cover minimum x 50% liquidation | [`AEED1262B1…`](https://devnet.xrpl.org/transactions/AEED1262B1418C0D6F7F022FBA8AB6B9A358D66DC1502B3224F8723F5842E7F9) |
| 5 | `LoanBrokerCoverDeposit` | `tesSUCCESS` | first-loss cover 6 XRP | [`01AF221349…`](https://devnet.xrpl.org/transactions/01AF22134910D40F7D0CB0422D2F2750B8822098A3CBCAE3283FF86E33EFF1C7) |
| 6 | `LoanSet` | `tecTOO_SOON` | GATE: LoanSet during Subscription (expected reject) | [`FA68743E53…`](https://devnet.xrpl.org/transactions/FA68743E53B764B6C6CD72ED62739C17D1A2165CC09DDF33186DDC5160FA6E53) |
| 7 | `VaultDeposit` | `tecEXPIRED` | GATE: deposit during Investment (expected reject) | [`2169AC15B6…`](https://devnet.xrpl.org/transactions/2169AC15B6859CC056EE6E6FFB48EC5A54D46EE92BBFBD047AA411474308B1DF) |
| 8 | `VaultWithdraw` | `tecTOO_SOON` | GATE: withdraw during Investment (expected reject) | [`A4442BE6B0…`](https://devnet.xrpl.org/transactions/A4442BE6B000EEB764E118A5BA5FE0FD4810DBA4B03529B7CAC2C4A3FFBAE8BA) |
| 9 | `LoanSet` | `tesSUCCESS` | origination, double-signed (broker + borrower) | [`FF0C33A94A…`](https://devnet.xrpl.org/transactions/FF0C33A94A7CC3E4F8BE58F0758A872C5D371910D345C4D897F6AAA63BA22E6A) |
| 10 | `LoanPay` | `tesSUCCESS` | repayment 1/3 (late -> tfLoanLatePayment) | [`36C74A48F8…`](https://devnet.xrpl.org/transactions/36C74A48F87A9DB2734D6B5CEC562777C3FCCA686FAF330AA1092D54CBCBC33D) |
| 11 | `LoanPay` | `tesSUCCESS` | repayment 2/3 (late -> tfLoanLatePayment) | [`2A376AF34F…`](https://devnet.xrpl.org/transactions/2A376AF34F2C15DB0E6995D3626A5601106370088EDC56CD01CF14A1661D581B) |
| 12 | `LoanPay` | `tesSUCCESS` | repayment 3/3 (late -> tfLoanLatePayment) | [`EB68AB5F03…`](https://devnet.xrpl.org/transactions/EB68AB5F03BA0E1D550AC4F37101EED513A9755EA976633F5F1A572137907FA5) |
| 13 | `LoanSet` | `tecEXPIRED` | GATE: LoanSet during Redemption (expected reject) | [`44E4520992…`](https://devnet.xrpl.org/transactions/44E452099244E72A9B1325BCCB11A9781FFEFA27B538722B4C5D82DDE43A7A43) |
| 14 | `VaultWithdraw` | `tesSUCCESS` | lender A redeems principal + yield | [`13A1D526AF…`](https://devnet.xrpl.org/transactions/13A1D526AFAF87B5302E12E634E335DCC71BD93751565D40BC4696490E41B47F) |
| 15 | `VaultWithdraw` | `tesSUCCESS` | lender B redeems principal + yield | [`49A90CDFF3…`](https://devnet.xrpl.org/transactions/49A90CDFF3CF3C5496264A16FD5E86E8588D5ABD24741865C02B529CA57B151D) |

### Investor eligibility gate (`src/eligibility.mjs`)

| # | transaction | result | what it shows | tx |
|---|---|---|---|---|
| 1 | `CredentialCreate` | `tesSUCCESS` | CredentialType = ELTIF_RETAIL_SUITABILITY | [`1153AF90F2…`](https://devnet.xrpl.org/transactions/1153AF90F2D102043767EB104AF8417A79A29E6343D33CDF9D5E6CA9C82EFDCC) |
| 2 | `CredentialAccept` | `tesSUCCESS` | the investor accepts it — a credential is bilateral | [`2DD983635E…`](https://devnet.xrpl.org/transactions/2DD983635EA541501507E97C8FAD0E162E800B174334AEDAC3C5D263F733FAB6) |
| 3 | `PermissionedDomainSet` | `tesSUCCESS` | accepts that issuer + credential type | [`65DEAF5BA1…`](https://devnet.xrpl.org/transactions/65DEAF5BA13B5BCA6A707E96062812F45CADB896ACB57E2B975118EAE22C3D53) |
| 4 | `VaultCreate` | `tesSUCCESS` | closed-ended + tfVaultPrivate + DomainID | [`BF96A8FE27…`](https://devnet.xrpl.org/transactions/BF96A8FE27737357247CD008EA750E39BFB52ED2D7A4D7468B0AD94A7411730D) |
| 5 | `VaultDeposit` | `tesSUCCESS` | assessed investor subscribes 20 XRP | [`4A0B53E7A1…`](https://devnet.xrpl.org/transactions/4A0B53E7A16862FE8E6359EF9AEABDB4EE48884B560AF69C62FAC4B36E9B633A) |
| 6 | `VaultDeposit` | `tecNO_AUTH` | GATE: unassessed investor subscribes (expected reject) | [`77B338DD56…`](https://devnet.xrpl.org/transactions/77B338DD56B260971C9109ACFEBEB48BBD453589E6DDC3E92BB2DE092C29A269) |

## Developer feedback

`FEEDBACK.md` at the repository root. The automated channel runs through the mandatory
XRPL DevEx hook (`btf-paris-2026-09`, participant `sturdy-badger-33`, team `eden`).
