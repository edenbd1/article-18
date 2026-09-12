# Feedback structuré XLS-65 / XLS-66 — reproductible

Environnement : Devnet `wss://s.devnet.rippletest.net:51233`, rippled **3.4.0-rc2**,
`xrpl@5.1.0` (dernière version npm), `ripple-binary-codec@2.10.0`. Date : 2026-09-05.

---

## Issue 1 — `xrpl.js` ne peut pas créer un vault utilisable par le Lending Protocol

**Repo :** `XRPLF/xrpl.js` · **Sévérité :** bloquant

Sous `LendingProtocolV1_1` (actif sur Devnet), `LoanBrokerSet` exige un vault *closed-ended* :

```cpp
// src/libxrpl/tx/transactors/lending/LoanBrokerSet.cpp
if (ctx.view.rules().enabled(featureLendingProtocolV1_1) &&
    getVaultKind(sleVault) != VaultKind::ClosedEnded)
    return tecNO_PERMISSION;
```

Or `VaultKind`, `SubscriptionDate` et `RedemptionDate` sont **absents** de
`ripple-binary-codec@2.10.0` et du modèle `VaultCreate` de `xrpl@5.1.0`.

**Repro :**
```js
await client.autofill({ TransactionType:'VaultCreate', Account, Asset:{currency:'XRP'},
                        VaultKind:1, SubscriptionDate:s, RedemptionDate:r })
// Error: Field VaultKind is not defined in the definitions
```
Sans ces champs :
```js
await client.autofill({ TransactionType:'LoanBrokerSet', Account, VaultID })
// → tecNO_PERMISSION
```

**Impact :** avec le SDK officiel à jour, **aucun prêt ne peut être créé sur Devnet**.
`tecNO_PERMISSION` n'oriente vers rien : on cherche un problème de droits alors que
c'est un problème de type de vault.

**Demandes :**
1. Publier `VaultKind` / `SubscriptionDate` / `RedemptionDate` dans le codec et le modèle `VaultCreate`.
2. Documenter la contrainte closed-ended sur la page `LoanBrokerSet`.
3. Remplacer `tecNO_PERMISSION` par un code parlant (`tecWRONG_VAULT_KIND`) — ou au minimum
   le distinguer du cas « pas le propriétaire ».

**Contournement :** écraser `node_modules/ripple-binary-codec/**/definitions.json`
avec la réponse `server_definitions` du nœud Devnet.

---

## Issue 2 — `signLoanSetByCounterparty()` produit une signature invalide

**Repo :** `XRPLF/xrpl.js` · **Sévérité :** bloquant · **Fonction :** `Wallet/counterpartySigner.ts`

`LoanSet` est la transaction centrale de XLS-66 et exige deux signatures. Le helper officiel
prévu pour ça est cassé.

**Repro :**
```js
const prep = await client.autofill({ TransactionType:'LoanSet', Account: broker.address,
  LoanBrokerID, Counterparty: borrower.address, PrincipalRequested:'20000000', /* … */ })
const a = broker.sign(prep)
const b = signLoanSetByCounterparty(borrower, a.tx_blob)
await client.submitAndWait(b.tx_blob)
// → fails local checks: Counterparty: Invalid signature.
```

**Cause :** rippled vérifie la signature du contrepartiste avec un préfixe de hachage dédié.

```cpp
// include/xrpl/protocol/HashPrefix.h
CounterpartyTxSign      = makeHashPrefix('C','P','T'),   // 0x43505400
CounterpartyTxMultiSign = makeHashPrefix('C','P','M'),   // 0x43504D00

// src/libxrpl/protocol/STTx.cpp
auto const prefix = signingPrefix(role, multiSigning, rules);
```

`signLoanSetByCounterparty` appelle `computeSignature(tx, privateKey)`, qui passe par
`encodeForSigning` et donc `HashPrefix.transactionSig = 0x53545800`
(`ripple-binary-codec/dist/hash-prefixes.js:30`). Les préimages diffèrent.

**Correctif validé** (`LoanSet: tesSUCCESS` sur Devnet) : voir `xls66-counterparty-fix.mjs`.
En résumé, substituer le préfixe :
```js
const msg = '43505400' + encodeForSigning(txSansCounterpartySignature).slice(8)
```

**À vérifier aussi :** `signAsSponsor` / `combineSponsorSigners` — `SponsorTxSign` ('S','P','N')
suit le même schéma et présente probablement le même défaut.

---

## Issue 3 — First-Loss Capital : la couverture réelle est ~20× plus faible qu'affichée

**Repo :** `XRPLF/XRPL-Standards` (renforce la PR #494 ouverte)

```
DefaultCovered = min( DebtTotal × CoverRateMinimum × CoverRateLiquidation,
                      DefaultAmount, CoverAvailable )
```
Les deux taux se **multiplient**.

**Mesuré en direct sur Devnet** (pas simulé) :

| | |
|---|---|
| Cover déposé par le broker | **5 XRP** |
| Dette du broker | 20 XRP |
| `CoverRateMinimum` / `CoverRateLiquidation` | 10 % / 50 % |
| Prêt en défaut | 20 XRP |
| **Cover réellement consommé** | **1 XRP** (5 → 4) |
| **Perte encaissée par les LP** | **19 XRP** (vault 60 → 41) |

Une UI naïve affiche `CoverAvailable / DebtTotal = 25 %`. La couverture effective est de **5 %**.

**Demande :** soit adopter la formule de la PR #494, soit exposer explicitement
`effectiveCoverage` dans `vault_info` / la doc, pour qu'aucune interface ne puisse afficher
le ratio trompeur.

---

## Issue 4 — Frictions de documentation

1. **Aucun tutoriel ne mentionne la contrainte closed-ended** alors qu'elle est bloquante sur Devnet.
2. **`VaultDeposit` du solde entier → `tecINSUFFICIENT_FUNDS`** sans indiquer que la réserve de
   base + celle du `MPToken` de parts doivent rester disponibles. Le faucet Devnet donne ~100 XRP,
   ce qui rend le piège quasi systématique pour un premier test.
3. **Unités des taux non documentées au point d'usage.** `ManagementFeeRate`, `CoverRate*`,
   `InterestRate` sont en 1/10 bps (100000 = 100 %) ; la validation client dit seulement
   « must be between 0 and 100000 ».
4. **`kMaxAssetCheckDepth = 5`** (un vault peut détenir les parts d'un autre vault sur 5 niveaux)
   n'est documenté nulle part côté développeur. C'est pourtant la seule composabilité native
   du protocole.

---

## Issue 5 — Aucun wallet navigateur ne peut signer une transaction XLS-65/66

**Repos :** `GemWallet/gem-wallet` · `crossmark-wallet` · **Sévérité :** bloquant pour toute UX non-custodiale

### GemWallet — corrigeable par un bump de dépendance
- `@gemwallet/api@3.8.0` (02/10/2024) expose un **vrai passthrough générique**
  (`submitTransaction` / `signTransaction` / `submitBulkTransactions`), sans validation,
  sans `xrpl` épinglé. Côté SDK, rien ne bloque.
- Le blocage est dans **l'extension 3.8.2** (build 06/12/2024), qui tourne sur `xrpl ^3.1.0` +
  `ripple-binary-codec 2.1.0` et appelle `validate()` avec `shouldCheck: true`.
- **La PR #445 (bump `xrpl` → `^4.6.0`), ouverte et non mergée depuis le 20/05/2026, suffirait
  à elle seule à débloquer les 15 types de transaction** — `xrpl` 4.4.0+ et
  `ripple-binary-codec` 2.7.0+ les contiennent déjà.
- Devnet est supporté, mais son entrée de config **n'a pas de `networkID`**.

### Crossmark — blocage plus profond
- Le SDK 0.4.0 (08/07/2024) est un vrai passthrough runtime (aucune allowlist ; seul
  `TransactionType:"SignIn"` est codé en dur), **mais** ses types TS forment une union fermée
  issue d'un `xrpl@2.14.1` épinglé en imbriqué ⇒ `VaultDeposit` / `LoanSet` ne compilent pas
  sans cast (`TS2345`).
- Blocage réel : **l'extension 0.2.19** (build 14/07/2024) embarque un enum binary-codec de
  **49 types de transaction** — aucun des 15 de XLS-65/66. `validate()` / `encode()` lèvent.
- Devnet supporté (`wss://s.devnet.rippletest.net:51233/`, network id 2).

### Conséquence pratique
**Seul Xaman gère nativement les 15 types.** Pour tout le reste, la double signature `LoanSet`
doit se faire avec des seeds en clair dans le code — ce qui est acceptable pour une démo devnet
et inacceptable pour un produit.

**Demande :** merger GemWallet PR #445 ; publier une version d'extension Crossmark sur un
binary-codec ≥ 2.7.0 ; ajouter `networkID` à la config Devnet de GemWallet.
