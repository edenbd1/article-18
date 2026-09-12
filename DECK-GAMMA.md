# Agama Finance — Article 18
### Gamma deck source · paste into Gamma "Paste in text" → Generate (10 cards)
### Suggested theme: serif headings, off-white paper, deep green + oxblood accents. Keep it sober.

---

## Slide 1 — Title
**Agama Finance — Article 18**
A closed-ended lending fund whose lifecycle is enforced by the ledger, not attested by an administrator.
XRPL Lending Protocol Hackathon · Track 2 (closed-ended) · Loaded · Team eden
*Note: Agama builds private-credit RWA vaults. This is Agama's thesis, built fresh and native on XRPL's new XLS-65/66 lending primitive.*

---

## Slide 2 — The use case, and why it is not an analogy
- A closed-ended private-credit fund: capital locked, term loans originated, redeemed at maturity.
- The three phases of an XRPL closed-ended vault are the three phases Article 18(1) of the EU ELTIF regulation imposes: subscription period, no early redemption, fixed end of life.
- In the current regime a manager *declares* compliance and is audited afterward. Here the ledger *refuses* the out-of-phase transaction.
- Market: 268 ELTIFs, €34bn (+55% YoY); France is 41% of European investors. Nobody has tokenised a genuinely closed-ended fund.

---

## Slide 3 — Why XRPL, why now
- XLS-65 Single Asset Vault and XLS-66 Lending Protocol V1.1 are live on Devnet.
- No SmartEscrow / WASM: the whole fund lives at the ledger level, so the phase gates are un-bypassable and there is no contract to hack.
- Regulated euro already settles here: SG-FORGE's EURCV on XRPL since Feb 2026, adopted by Bpifrance.
- The official SDK, xrpl.js 5.2.0, shipped the night before the event and made the track buildable.

---

## Slide 4 — What we built: one flow, 16 real transactions
- On-ledger fund identity (DID + prospectus).
- Compliance gate: Credentials + Permissioned Domains.
- Closed-ended, private, domain-gated vault; shares are native MPTs.
- Sponsored-fee subscription (XLS-68): the lender pays no transaction fee.
- Double-signed loan origination, repayment, redemption.
- Every transaction settled on public Devnet and clickable on the explorer.

---

## Slide 5 — The lifecycle is enforced, not attested
- Subscription: deposits open, lending blocked.
- Investment: lending open, deposits and withdrawals blocked.
- Redemption: exit open, new loans blocked.
- We showed each guardrail firing: deposit in Investment returns tecEXPIRED, withdraw returns tecTOO_SOON, origination in Subscription returns tecTOO_SOON. The dates are immutable at creation.

---

## Slide 6 — Compliance that holds on the secondary market
- An assessor issues a suitability credential; the fund accepts only that credential in its domain.
- Alice (credentialed) subscribes: tesSUCCESS.
- Mallory (no credential) is refused by consensus: tecNO_AUTH — even after opting in to hold the share.
- The gate applies to transfers, not just deposits: a lender cannot offload units onto a non-KYC party. Exactly what a regulated fund needs.

---

## Slide 7 — Developer feedback (40% of the score): the three that matter
- A borrower seconds late cannot repay: LoanPay returns tecEXPIRED unless tfLoanLatePayment is set; on wall-clock devnet this killed a full run. Fix: name the flag or accept within grace.
- First-loss cover misleads: CoverRateMinimum and CoverRateLiquidation multiply (10% x 50% = 5%); a live 20 XRP default consumed 1 XRP. Fix: expose effectiveCoverage.
- Two event networks report identical amendments but behave differently: behaviour rides the build, not the amendment. Fix: surface build_version.

---

## Slide 8 — What the protocol gets right (the trust model)
- A fund manager can neither seize nor freeze a lender: VaultClawback and share-lock by the owner both return tecNO_PERMISSION.
- Only the underlying asset issuer can claw, and the effect is isolated: no dilution of other holders.
- Vault share maths resists the ERC-4626 rounding and inflation attacks; a donation to the vault is refused.
- 27 structured findings filed through the DevEx capture hook, plus a session analysis.

---

## Slide 9 — How much we could integrate
- Integrated (7): DID, Credentials, Permissioned Domains, XLS-65 vault, MPT shares, XLS-68 sponsored fees, XLS-66 loan.
- Blocked, and proven (4): XLS-65/66 can't be Batch inners (temINVALID_INNER_BATCH); shares can't be confidential; shares can't trade on the DEX (MPTokensV2 off); vault reserves can't be sponsored.
- Loaded rewards meaningful integration, not maximal: the blocks are themselves the feedback.

---

## Slide 10 — Close
- Article 18: a regulated fund structure, enforced by consensus instead of attestation.
- Reproducible: npm install && npm run deploy; every hash resolves on Devnet.
- Repo: github.com/edenbd1/article-18
- Agama Finance is building private-credit RWA infrastructure; XRPL's lending primitive is the closest any ledger has come to a native closed-ended fund.
