# XRPL Lending Hackathon — bilan de recherche
16 sub-agents, ~2,4 M tokens, + tests directs sur Devnet. 2026-09-05.

## 1. Le chiffre qui cadre tout
TVL survivante du prêt **non collatéralisé** on-chain, tous protocoles confondus (05/09/2026) :
Clearpool 234 809 $ + TrueFi 21 738 $ + Atlendis 17 826 $ + Brila/Elara 9 867 $ + Credix 1 $
+ Goldfinch 1 517 428 $ (en liquidation) ≈ **1,80 M$**.
Contre **56,16 Md$** de prêt crypto-collatéralisé (Galaxy T2 2026) ⇒ **0,003 %**.

XRPL livre en 2026 le primitif Maple/Goldfinch de 2021, au niveau du ledger.
Goldfinch a fermé en juin 2026 (~18 M$ de pertes). TrueFi a recouvré 13,4 % (2,3 M$ sur 17,2 M$).

⚠️ **Cicada Partners — partenaire de lancement nommé par Ripple — a déjà tenu ce rôle exact chez
TrueFi.** Arrêté par vote de gouvernance (TFIP-20, 06/09/2024) avec 2,2 M$ de TVL dont >90 % venant
de 2 adresses, après ~500 k$ de rémunération en 4 mois. Conclusion textuelle :
*"for the DAO to continue to attempt to create a 'crypto-native' trading firm related lending
vertical is a losing game."* Le fonds XRPL est sa 3e tentative.

## 2. Vérifié par transaction réelle (pas de la doc)

| Réseau | rippled | XLS-65 | XLS-66 | ConfidentialTransfer |
|---|---|---|---|---|
| Mainnet | 3.3.0 | ❌ 13/28 votes | ❌ 11/28 | ❌ |
| Testnet | 3.3.0 | ❌ | ❌ | ❌ |
| **Devnet** | **3.4.0-rc2** | ✅ | ✅ + V1_1 | ✅ |

Aucun des deux amendements n'a démarré le compte à rebours de 2 semaines. **Devnet, point.**
Aussi sur Devnet et nulle part ailleurs : `BatchV1_1`, `Sponsor` (frais **et** réserves),
`PermissionDelegationV1_1`, `DynamicMPT`.

### Deux bugs bloquants trouvés et corrigés
1. **`LoanBrokerSet` → `tecNO_PERMISSION` systématique.** Sous `LendingProtocolV1_1` seuls les vaults
   *closed-ended* peuvent héberger un broker (`LoanBrokerSet.cpp:156`). Il faut `VaultKind:1` +
   `SubscriptionDate` + `RedemptionDate` — **3 champs absents de `xrpl.js@5.1.0`**.
2. **`signLoanSetByCounterparty()` produit une signature invalide.** rippled vérifie avec
   `HashPrefix::CounterpartyTxSign = 'CPT\0' = 0x43505400` ; xrpl.js signe avec `0x53545800`.
   ⇒ **aucun `LoanSet` ne peut aboutir avec le SDK officiel.**

Après correctifs, cycle complet validé : VaultCreate → VaultDeposit → LoanBrokerSet →
CoverDeposit → LoanSet (double signature) → LoanPay → Impair → **Default**. Tous `tesSUCCESS`.

### Trois croyances démenties
- **Le first-loss n'est pas plafonné.** `CoverRateMinimum` et `CoverRateLiquidation` acceptent 100 %
  chacun. Les 5 % mesurés sont une *config*, pas une limite. (Piège réel : les deux taux se
  multiplient — 10 % × 50 % = 5 % effectif là où une UI naïve affiche 25 %.)
  Mesuré : cover 5 XRP, défaut 20 XRP → **1 XRP consommé, 19 XRP de perte LP**.
- **Pas de tranching natif.** Un vault ne peut PAS détenir les parts d'un autre : `tecWRONG_ASSET`.
  `VaultCreate.cpp` : *"we do not want a vault to hold such assets (e.g. MPT shares to other vaults
  … impossible to clawback)"*. `kMaxAssetCheckDepth = 5` a un commentaire trompeur — 3 agents et
  moi-même s'y sont fait prendre.
- **L'objet `Loan` n'a pas de champ `Data`.** `LoanSet` l'accepte mais ne le persiste pas.
  (Confirmé par mon recensement : 61 Loans scannés, 0 avec Data.)
  ⇒ c'est une **preuve co-signée horodatée**, pas de l'état. Meilleur que du state.

## 3. L'écosystème : ce qui n'existe pas
Aucun indexeur (Dune a 13 tables XRPL, zéro pour vault/loan), **pas de RPC `loan_info` ni
`loan_broker_info`**, `vault_list` spécifié jamais implémenté, zéro package npm `xrpl lending`,
zéro dashboard de risque, webhooks morts depuis 2019, **aucun wallet ne sait signer une
`CounterpartySignature`**. Credentials (XLS-70) + Permissioned Domains (XLS-80) sont **live sur
mainnet** et une recherche GitHub globale sur `CredentialCreate` retourne **2 vrais résultats**.

Marché : AMM XRPL ≈ 40 M$ (plat en XRP depuis 2 ans), l'AMM est passé de ~82 % à 12-23 % du volume
DEX. Seuls actifs à l'échelle : **RLUSD 1,03 Md$**, **Ondo OUSG 193 M$**. Archax = 0 on-chain.
Doppler : 3 % de son TVL annoncé est réellement sur XRPL.

## 4. Use cases — le podium
1. **Préfinancement de règlement PSP (modèle Arf/Huma)** — 2 agents indépendants le classent n°1.
   Huma : 17 Md$ cumulés, 281 M$ de liquidité, **0 % de défaut**, créances de **1 à 7 jours**,
   ~60 rotations/an. Le remboursement vient d'argent *déjà* séquestré. Ripple dit lui-même **48 h**.
2. **Le vault fermé EST un ELTIF.** Les phases correspondent mot pour mot à l'**art. 18(1)** du
   règl. (UE) 2015/760. `kMaxInvestmentPeriod` = **exactement 30 ans** ; Scope recense 128 ELTIF
   fermés de 4 à 30 ans. `kLoanRedemptionBuffer` = **art. 21(1) + CMF R.214-40** (fenêtre de
   pré-liquidation de 12 mois) — imposée par déclaration a posteriori dans le droit, obtenue
   **par refus au consensus, a priori** sur XRPL.
   Marché : 268 ELTIF, 34,0 Md€ (+54,7 %), dette privée = 1ère classe (11,4 Md€),
   **la France = 41,4 % des investisseurs européens**. C. assur. **L.131-1-1** exempte un ELTIF
   retail des conditions de patrimoine en assurance-vie.
   **Personne n'a tokenisé un vrai fonds fermé** (ACRED est un feeder d'interval fund à souscription
   quotidienne ; seul Blockchain Capital, 209 M$). Securitize a dû devenir **prêteur d'appels de
   capital à 0 % sur son bilan** faute de primitive.
3. **Financement de primes d'assurance** — >50 Md$, acompte + 9-10 mensualités amorties, recours =
   **mandat de résiliation de la police**. Une liquidation qui s'exécute par courrier recommandé.
4. **Préfinancement du CIR** (7,25 Md€/an) — créance sur le Trésor, montant par formule, date par la
   loi. Aucun oracle n'existe *ni ne peut exister* ⇒ la DeFi collatéralisée est hors-jeu.
5. **Créances sur hôpitaux publics du Sud de l'Europe** (BFF, 9 pays) — le retard est rémunéré au
   **taux BCE + 8 pts** par la directive 2011/7/UE. `LateInterestRate` se remplit avec du droit UE.

Contexte français : affacturage **439,4 Md€** de production 2025, France **1ère en Europe**,
2e mondiale. Délais de paiement = **13 Md€** de trésorerie manquante pour les PME ;
DGCCRF **59,1 M€ d'amendes en 2025 (+65 %)** ; proposition de loi adoptée au Sénat le 19/02/2026
portant le plafond à **1 % du CA mondial**.

## 5. À refuser
Merchant cash advance (230+ faillites 2025, 100-200 % APR, split acquéreur impossible à représenter)
· repo/titres (collatéralisé par définition) · avance sur salaire marché émergent (**TAEG 1 336 %
sur les tickets 0-20 $**, DFPI sur 7,1 M transactions) · PAYG solaire (titrisation **−69 % en 2025**,
Bboxx en administration) · avances aux créateurs (Clearco −72 % d'effectifs, Wayflyer 77,3 M€ puis
48 M€ de pertes) · **crédit aux agents IA** (toute l'économie agent sur XRPL = **7 400 $** ;
x402 −93 % YTD ; >95 % de wash/signaling ; 8 des 61 projets de Hack the Block y étaient déjà) ·
prêt adossé au GPU (USD.AI fait déjà 544 M$) · récépissés d'entrepôt · litigation finance.

## 6. Règles de design qui tombent de tout ça
- **Ne jamais dépasser 30 jours de duration.** `PaymentInterval = 86 400 s` en production ;
  le minimum de 60 s ne sert qu'à la démo.
- **Le Loan Broker doit être dans le chemin du paiement.** Arf est régulé VQF *et* dans le flux —
  c'est son levier de recouvrement. Maple n'avait aucun levier sur Orthogonal (36 M$ de défaut).
- **`RedemptionDate` doit être postérieure à la maturité du dernier prêt**, avec marge.
  `WithdrawalPolicy` est FIFO-only et Huma a publiquement abandonné le FIFO comme dangereux.
- **Pas de keeper permissionless.** `LoanManage` est réservé au broker et XLS-75 interdit
  explicitement la délégation de toutes les tx Vault/Loan.

## Artefacts
`GROUND-TRUTH.md` · `FEEDBACK.md` (4 issues prêtes) · `xls66-counterparty-fix.mjs` · `devnet-census.txt`

## 7. Addendum France (dernier agent, rendu partiel)
- **Crowdlending FR 2025 : 1 763 M€** (+1,8 % après deux ans de recul ; 2023 = 2 089 M€).
- **Immobilier = 845 M€ (47,9 %) et il s'effondre** : 8-10 % de retards <6 mois, 25-30 % >6 mois,
  **20-25 % en procédure collective** — « un projet immobilier sur deux en difficulté » (baromètre
  FPF/Forvis Mazars lui-même). **Koregraf et WeShareBonds ont cessé leur activité en 2025.**
  **WiSEED** sauvée in extremis par Advenis après redressement judiciaire.
  **October** a arrêté l'origination début 2024, techno cédée à Sopra, racheté par Aether en 05/2026.
- **61 plateformes PSFP agréées** en France (05/2026) ; 3 plateformes captent 28,5 % de la collecte.
- Règl. UE 2020/1503 : art. 11 (fonds propres 25 k€), **art. 20 (publication des taux de défaut)**,
  art. 21§7 (seuil 1 000 € / 5 % du patrimoine), art. 22 (délai de réflexion 4 jours), art. 23 (FIC).
- **Spiko** (français) : 1er fonds monétaire tokenisé agréé AMF, **2,52 Md$ de TVL, top 5 mondial RWA**.
  ⇒ la France a une vraie crédibilité RWA, mais **personne ne tokenise de dette PME/crowdlending**.
- Untangled Finance : ~300 k$ de TVL malgré 13,5 M$ levés auprès de Fasanara.

## 8. France — les 4 faits qui changent le pitch

1. **EURCV (Société Générale-FORGE) est live sur XRP Ledger depuis le 18/02/2026** — 3e chaîne
   publique après Ethereum et Solana, avec la custody de Ripple, ~161 M€ d'encours. Et le
   **17/04/2026, Bpifrance en a fait son stablecoin de règlement de référence**.
   ⇒ Réponse toute faite à « pourquoi XRPL ? » : une banque systémique française y a déjà déployé
   de la monnaie régulée MiCA, et la banque publique d'investissement s'en sert.

2. **MiCA ne couvre PAS le prêt de crypto-actifs** — recital 94, texto : *« Le présent règlement ne
   devrait pas traiter le prêt et l'emprunt de crypto-actifs »*. La liste des 10 services (art.
   3(1)(16)) ne le mentionne pas. **Et la consultation « MiCA 2 » de la Commission sur la DeFi et le
   prêt est ouverte, deadline le 30/09/2026** — soit 18 jours après le hackathon.

3. **Article 20 du règlement ECSP (UE) 2020/1503** : les plateformes de financement participatif
   **doivent publier annuellement leurs taux de défaut** sur 36 mois glissants, dans les 4 mois de
   la clôture, en évidence sur leur site. Aujourd'hui c'est fait en PDF : **ClubFunding affiche
   19,27 % de défaut** ; **Homunity affiche un TRI net ajusté du risque de 5,80 % contre 10,14 %
   annoncé, avec ~44 % du capital en difficulté**.
   ⇒ Un protocole qui répond nativement, de façon vérifiable et immuable, à une obligation que
   l'AMF impose **déjà** — c'est l'argument qui sépare un projet sérieux d'un projet anti-régulation.

4. **Facturation électronique obligatoire en France au 1er septembre 2026** (réception pour tous les
   assujettis TVA ; émission pour GE/ETI), généralisation au 01/09/2027, ~120 plateformes agréées
   DGFiP. C'est **11 jours avant le hackathon** — la facture devient une donnée structurée
   nationale, ce qui est le préalable technique de tout affacturage programmable.

**Précédent réglementaire français** : l'ordonnance 2017-1674 + décret 2018-1226 (régime **DEEP**)
ont légalisé l'inscription blockchain des titres financiers **~6 ans avant** le régime pilote DLT
européen. La France était pionnière.

**Autres ancrages** : Caisse des Dépôts, 1ère *Digitally Native Note* française (100 M€, 11/2024),
réglée via **DL3S de la Banque de France** · groupe stratégique de place AMF / Banque de France /
DG Trésor sur la tokenisation lancé le 12/03/2026 · **189 CASP** actifs en France, dont SG-FORGE,
CACEIS et **Bpifrance Investissement** (18/06/2026).

**Passerelle directe avec le jury** : **Thomas Hussenet et Romain Thépaut**, tous deux issus de
DeVinci Blockchain, sont aujourd'hui Technical Partners chez **XRPL Commons**. Thépaut préside DVB.
Palmarès DVB : **RL Treasury** (vault XLS-65, 1re place Ripple × EasyA Singapour, scène principale
d'Apex 2025), **Sirius** (prix Boundless ZK, Paris Blockchain Week 2026), **Orizon** (1re place Sui
Paris). Ce qu'ils valorisent : prototypes fonctionnels, ZK/confidentialité, dialogue avec la
finance régulée.

**Précédent XRPL Grants le plus proche** : **Fortstock, 150 000 $** — tokenise des reçus d'entrepôt
en MPT pour du trade finance adossé à des actifs. ⚠️ Tension à noter : un autre agent classait les
récépissés d'entrepôt comme **à rejeter** (oracle de prix + fraude documentaire : Qingdao 2014,
Hin Leong 2020). Fortstock est donc soit une exception, soit un avertissement.
