# Demo script — Agama Finance / Article 18 (4 min + 2 min Q&A)

Track 2 · Loaded · Team eden. Open `index.html` full-screen; have the Devnet explorer ready.
The brief asks for: the use case, the on-chain flow, the three most important friction points and
your proposed improvements. Time budget in brackets.

## [0:00–0:40] The use case — one sentence, then why it is not an analogy
Point at the masthead and the lifecycle band.
> "Article 18 is a closed-ended lending fund whose lifecycle is enforced by the ledger, not
> attested by an administrator. The three phases of an XRPL closed-ended vault — Subscription,
> Investment, Redemption — are the exact three phases Article 18 of the EU ELTIF regulation
> imposes on a European long-term fund. Where the law makes a manager *declare* compliance and
> audits it after the fact, here the ledger simply refuses the out-of-phase transaction."
Anchor number: 268 ELTIFs, €34bn, France is 41% of European investors, and nobody has tokenised a
genuinely closed-ended fund.

## [0:40–2:00] The on-chain flow — everything is real
Scroll to "The transaction ledger". 16 real Devnet transactions, grouped by phase.
- **Identity + Eligibility:** the fund publishes an on-ledger DID (its prospectus), an assessor
  issues a suitability Credential to Alice, the fund declares a Permissioned Domain that accepts it.
- **Subscription:** Alice subscribes 40 XRP and the fund SPONSORS her fee (XLS-68) — click that
  hash to show it on the explorer. Then the gate: Mallory, with no credential, is refused
  `tecNO_AUTH` (green line vs oxblood line). The broker and 4 XRP first-loss cover are set.
- **Investment:** show the three guardrails firing in oxblood — deposit `tecEXPIRED`, withdraw
  `tecTOO_SOON`, and origination succeeding only now: a double-signed 20 XRP loan, repaid twice.
- **Redemption:** Alice redeems principal plus yield.
> "Seven ledger primitives, one flow, every transaction settled and clickable."

## [2:00–3:20] The three friction points + our proposed fixes
Scroll to the findings. Lead with the one that cost us a full run.
1. **A borrower seconds late cannot repay.** `LoanPay` just past due returns `tecEXPIRED` unless
   `tfLoanLatePayment` is set; on wall-clock devnet this killed all three repayments of our first
   run. Fix: accept a late payment inside the grace period, or return a code that names the flag.
2. **First-loss protection is ~5× smaller than it looks and can be clawed to zero.** The two cover
   rates multiply (10% × 50% = 5%); a live 20 XRP default consumed 1 XRP of a 5 XRP cover. And if
   the cover is a clawback-enabled stablecoin, its issuer can zero it. Fix: expose an
   `effectiveCoverage` figure and document the multiplication.
3. **The same amendment set behaves differently across the two event networks.** `feature` reports
   identical amendments on the hackathon (rc1) and public (rc5) devnets, yet `LoanBrokerSet` on an
   open-ended vault succeeds on one and returns `tecNO_PERMISSION` on the other — behaviour rides
   the build, not the amendment. Fix: surface `build_version`, or gate the change on an amendment.

## [3:20–4:00] What we integrated, and what the ledger blocks
Scroll to the integration map.
> "Loaded rewards meaningful integration, not maximal. We integrated seven primitives. Four are
> blocked, and the block is itself the feedback: XLS-65/66 transactions can't be Batch inners,
> vault shares can't be confidential, shares can't trade on the DEX because MPTokensV2 is off, and
> vault reserves can't be sponsored. We proved each with a transaction."
Close on the sound half: a manager can neither seize nor freeze a lender, the eligibility gate
holds on the secondary market, and the share math resists the ERC-4626 attack family.

## Q&A prep (2 min)
- **Why XRPL and not a smart-contract chain?** No SmartEscrow/WASM here — the entire fund lives at
  the ledger level, which is why the phase gates are un-bypassable and there is no contract to hack.
  SG-FORGE's EURCV and Bpifrance already settle regulated euro on XRPL.
- **Is self-dealing a bug?** It's permitted (borrower can equal the broker owner) and only that
  owner can declare the default. We reported it privately to a mentor; it is a governance risk the
  product must fence off, not a ledger exploit.
- **Testnet vs devnet?** XLS-65/66 amendments are devnet-only; testnet cannot run this yet.
- **DevEx feedback?** 27 structured findings filed through the capture hook, plus a checkpoint
  session analysis — the automated half of the deliverable.
