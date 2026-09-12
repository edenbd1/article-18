# XRPL Lending — vérité terrain (testée en direct sur Devnet, 2026-09-05)

Tout ce qui suit vient de **transactions réellement soumises** et du **code source de rippled**,
pas de la doc.

## 1. Où ça tourne

| Réseau | rippled | SingleAssetVault | LendingProtocol | LendingProtocolV1_1 |
|---|---|---|---|---|
| Mainnet | 3.3.0 | ❌ | ❌ | ❌ |
| Testnet | 3.3.0 | ❌ | ❌ | ❌ |
| **Devnet** `wss://s.devnet.rippletest.net:51233` | **3.4.0-rc2** | ✅ | ✅ | ✅ |

Vérifié en lisant l'objet `Amendments` on-ledger et en recalculant `SHA512Half(nom)`.
Mainnet : XLS-65 ~13/28 votes, XLS-66 ~11/28, seuil 80 %. **Aucune activation avant le hackathon.**

### Aussi activé sur Devnet (et nulle part ailleurs)
✅ `BatchV1_1` (multi-tx atomique, max 8) · `Sponsor` XLS-68 (frais **et réserves** sponsorisés) ·
`PermissionDelegationV1_1` · `DynamicMPT` · **`ConfidentialTransfer`** (MPT chiffrés, ZK, clé auditeur)

❌ Nulle part : `MPTokensV2` (⇒ **les parts de vault ne peuvent pas être tradées sur le DEX/AMM**),
`SmartEscrow`/WASM (⇒ **zéro smart contract sur XRPL mainnet**).

---

## 2. 🔴 LE BLOCAGE QUE PERSONNE N'A DOCUMENTÉ

Sur Devnet, `LoanBrokerSet` renvoie **`tecNO_PERMISSION`** sur un vault créé normalement,
même quand on est le `Owner`. Toutes les combinaisons de paramètres échouent.

Cause, trouvée dans `src/libxrpl/tx/transactors/lending/LoanBrokerSet.cpp` :

```cpp
// LP V1.1: only closed-ended vaults may host a loan broker. […]
if (ctx.view.rules().enabled(featureLendingProtocolV1_1) &&
    getVaultKind(sleVault) != VaultKind::ClosedEnded)
{
    JLOG(ctx.j.warn()) << "LoanBroker requires a closed-ended Vault.";
    return tecNO_PERMISSION;
}
```

**Il faut créer le vault avec `VaultKind: 1` (ClosedEnded) + `SubscriptionDate` + `RedemptionDate`.**
(`Protocol.h` : `VaultKind{OpenEnded=0, ClosedEnded=1}`,
`VaultPhase{NoPhase=0, Subscription, Investment, Redemption}`,
`kMinInvestmentPeriod=180s`, `kMaxInvestmentPeriod=30 ans`, `kLoanRedemptionBuffer=60s`.)

### Et voilà le vrai problème
**`xrpl.js@5.1.0` — la dernière version publiée — ne connaît pas `VaultKind` :**
```
Error: Field VaultKind is not defined in the definitions
```
Idem `SubscriptionDate`, `RedemptionDate`.

⇒ **Avec le SDK officiel à jour, il est aujourd'hui impossible de monter un prêt sur Devnet.**
Tout le monde va se prendre `tecNO_PERMISSION` sans aucune piste pour comprendre.

### Le contournement (validé)
Récupérer `server_definitions` depuis le nœud Devnet et écraser
`node_modules/ripple-binary-codec/**/definitions.json`. Après ça :
```
VaultCreate(ClosedEnded): tesSUCCESS
LoanBrokerSet:            tesSUCCESS   (avec DebtMaximum, ManagementFeeRate,
                                        CoverRateMinimum, CoverRateLiquidation)
```

C'est **le** livrable "feedback" du hackathon, prêt à déposer en issue GitHub.

---

## 2bis. 🔴 DEUXIÈME BUG : `signLoanSetByCounterparty` est cassé dans xrpl.js 5.1.0

`LoanSet` est la transaction phare de XLS-66 : elle exige **deux signatures** (le broker et
l'emprunteur). xrpl.js expose un helper dédié, `signLoanSetByCounterparty`. Il produit une
signature **invalide** :

```
❌ LoanSet THREW: fails local checks: Counterparty: Invalid signature.
```

Cause, dans `src/libxrpl/protocol/STTx.cpp` + `include/xrpl/protocol/HashPrefix.h` :

```cpp
CounterpartyTxSign      = makeHashPrefix('C','P','T'),   // 0x43505400
CounterpartyTxMultiSign = makeHashPrefix('C','P','M'),   // 0x43504D00
```
```cpp
// The account's own signature always covers the plain transaction prefix;
// see signingPrefix for the role signatures that do not.
auto const prefix = signingPrefix(role, multiSigning, rules);
```

rippled vérifie la signature du contrepartiste avec le préfixe **`0x43505400`**.
xrpl.js signe avec `HashPrefix.transactionSig` = **`0x53545800`** (`hash-prefixes.js:30`).
Les préimages ne correspondent pas ⇒ **aucun `LoanSet` ne peut aboutir avec le SDK officiel.**

### Correctif (validé, `LoanSet: tesSUCCESS`)
```js
import { encodeForSigning, encode, decode } from 'ripple-binary-codec'
import { sign as kpSign } from 'ripple-keypairs'

const COUNTERPARTY_TX_SIGN = '43505400'

export function signLoanSetByCounterpartyFixed(wallet, txBlob) {
  const tx = decode(txBlob)
  delete tx.CounterpartySignature
  const msg = COUNTERPARTY_TX_SIGN + encodeForSigning(tx).slice(8)  // on remplace le préfixe
  tx.CounterpartySignature = {
    SigningPubKey: wallet.publicKey,
    TxnSignature: kpSign(msg, wallet.privateKey),
  }
  return { tx, tx_blob: encode(tx) }
}
```

Note : `SponsorSignature` utilise `SponsorTxSign` ('S','P','N') — même piège probable.

---

## 3. Autres frictions mesurées

| # | Friction | Détail |
|---|---|---|
| 1 | `VaultDeposit` du solde entier → `tecINSUFFICIENT_FUNDS` | Le faucet donne ~100 XRP ; il faut garder réserve de base (1 XRP) + réserve du `MPToken` de parts (0,2 XRP). Message d'erreur muet sur la cause. |
| 2 | `tecNO_PERMISSION` utilisé pour un problème de *configuration*, pas de droits | Diagnostic quasi impossible sans lire le C++. |
| 3 | `CoverRateMinimum`/`CoverRateLiquidation` : « both zero or both non-zero » | Validé côté client, mais l'unité (1/10 bps, 100000 = 100 %) n'est nulle part. |
| 4 | Aucun explorateur ne rend les objets `Vault`/`Loan`/`LoanBroker` | `ripple/explorer` a du code Vault mais rien de déployé côté Devnet public. |
| 5 | `LoanSet` = signature double séquentielle | Le broker signe, PUIS le contrepartiste contresigne le blob. Aucun outil pour transporter le blob semi-signé. Fee ×2 minimum. |

---

## 4. Le piège économique du First-Loss Capital

```
DefaultCovered = min( DebtTotal × CoverRateMinimum × CoverRateLiquidation,
                      DefaultAmount, CoverAvailable )
```
Les deux taux se **multiplient**. Exemple de la spec elle-même : dette 1090, cover disponible 1000,
CoverRateMinimum 10 %, CoverRateLiquidation 10 % → **couverture réelle = 10,9**, soit **1 %**.
Le vault absorbe 99 % de la perte alors que le pool de couverture faisait presque la taille de la dette.

Une UI naïve affichera `CoverAvailable / DebtTotal ≈ 92 %`. C'est faux d'un facteur ~90.
(PR #494 en cours veut supprimer `CoverRateLiquidation` pour cette raison.)

---

## 5. L'aléa moral, mesurable depuis le ledger

- `LoanManage` (impair / default / unimpair) est **réservé au `LoanBroker.Owner`**.
- XLS-75 interdit **explicitement** de déléguer toutes les tx Vault/Loan.
  ⇒ **un keeper permissionless est structurellement impossible.**
- `tfLoanImpair` augmente `Vault.LossUnrealized`, ce qui **fait baisser la NAV des déposants**.

Donc : la seule partie qui *peut* déclarer une perte est celle que ça *pénalise*.
Personne ne surveille. Or `NextPaymentDueDate + GracePeriod` vs l'horloge du ledger est
**public** : le retard non déclaré est calculable par n'importe qui.

---

## 6. Composabilité native sous-estimée

`Protocol.h` : `kMaxAssetCheckDepth = 5` —
*"Maximum recursion depth for vault shares being put as an asset inside another vault."*

⇒ **un vault peut détenir les parts d'un autre vault, sur 5 niveaux.**
C'est du tranching / fund-of-funds natif, sans un seul smart contract. Personne n'en parle.

---

## 7. Cycle de vie complet, prouvé sur Devnet

Après les deux correctifs, tout passe :

```
✅ VaultCreate (closed-ended, VaultKind=1)         tesSUCCESS
✅ VaultDeposit 60 XRP                              tesSUCCESS
✅ LoanBrokerSet (Debt/Mgmt/Cover complets)         tesSUCCESS
✅ LoanBrokerCoverDeposit 5 XRP                     tesSUCCESS
✅ LoanSet double signature (préfixe CPT corrigé)   tesSUCCESS
✅ LoanPay                                          tesSUCCESS
```

État réel observé après `LoanSet` de 20 XRP :
```
Loan   PrincipalOutstanding 20000000  TotalValueOutstanding 20000039
       PeriodicPayment "6666679.350587772652"  PaymentRemaining 3
Vault  AssetsTotal 60000000  AssetsAvailable 40000000
Broker DebtTotal 20000000  CoverAvailable 5000000
```
Après `LoanPay` : `PrincipalOutstanding 13333340`, `Vault.AssetsTotal 60000020`,
`AssetsAvailable 46666680`, `PaymentRemaining 2`.

`LoanManage` impair/default renvoient `tecTOO_SOON` tant qu'on n'a pas dépassé
`NextPaymentDueDate` (+ `GracePeriod` pour le défaut) — comportement conforme.
