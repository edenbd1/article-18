/**
 * Article 18 — the "Loaded" half: investor eligibility as a ledger primitive.
 *
 * An ELTIF distributed to retail investors may only be sold to someone the distributor has
 * assessed as suitable (Art. 30, Reg. (EU) 2015/760). Today that assessment lives in the
 * distributor's CRM and the fund takes it on trust.
 *
 * Here: the assessor issues a Credential, the fund declares a Permissioned Domain that accepts
 * that credential type, and the vault is created private and bound to the domain. A subscription
 * from an unassessed investor is then refused by consensus, not by a compliance officer.
 */
import { connect, fund, submit, nowRipple, created, NET, txLog, flushLog } from './lib.mjs'

const hex = s => Buffer.from(s, 'utf8').toString('hex').toUpperCase()
const CRED_TYPE = hex('ELTIF_RETAIL_SUITABILITY')
const banner = t => console.log(`\n${'='.repeat(70)}\n  ${t}\n${'='.repeat(70)}`)

const c = await connect()

banner('0. Parties')
const fundMgr   = await fund(c, 'fundMgr')    // the fund: owns the domain and the vault
const assessor  = await fund(c, 'assessor')   // the distributor performing the suitability test
const eligible  = await fund(c, 'eligible')   // assessed investor
const ineligible= await fund(c, 'ineligible') // not assessed

banner('1. The assessor issues a suitability credential')
await submit(c, assessor, {
  TransactionType:'CredentialCreate', Account:assessor.address, Subject:eligible.address,
  CredentialType: CRED_TYPE, URI: hex('https://example.org/eltif-suitability-assessment'),
}, 'CredentialType = ELTIF_RETAIL_SUITABILITY')
await submit(c, eligible, {
  TransactionType:'CredentialAccept', Account:eligible.address,
  Issuer: assessor.address, CredentialType: CRED_TYPE,
}, 'the investor accepts it — a credential is bilateral')

banner('2. The fund declares the domain of acceptable investors')
const pd = await submit(c, fundMgr, {
  TransactionType:'PermissionedDomainSet', Account:fundMgr.address,
  AcceptedCredentials: [{ Credential: { Issuer: assessor.address, CredentialType: CRED_TYPE } }],
}, 'accepts that issuer + credential type')
const DOMAIN = pd.ok ? created(pd.meta, 'PermissionedDomain') : null
console.log(`      DomainID ${DOMAIN}`)

banner('3. A private closed-ended vault bound to that domain')
const SUB = nowRipple() + 120, RED = SUB + 300
const vc = await submit(c, fundMgr, {
  TransactionType:'VaultCreate', Account:fundMgr.address, Asset:{currency:'XRP'},
  WithdrawalPolicy:1, VaultKind:1, SubscriptionDate:SUB, RedemptionDate:RED,
  DomainID: DOMAIN, Flags:{ tfVaultPrivate:true },
}, 'closed-ended + tfVaultPrivate + DomainID')
const VAULT = vc.ok ? created(vc.meta, 'Vault') : null
console.log(`      VaultID ${VAULT}`)

banner('4. Subscription — the gate')
if (VAULT) {
  await submit(c, eligible,   { TransactionType:'VaultDeposit', Account:eligible.address,   VaultID:VAULT, Amount:'20000000' }, 'assessed investor subscribes 20 XRP')
  await submit(c, ineligible, { TransactionType:'VaultDeposit', Account:ineligible.address, VaultID:VAULT, Amount:'20000000' }, 'GATE: unassessed investor subscribes (expected reject)')
}

banner('Summary')
console.log(`domain ${DOMAIN}`)
console.log(`vault  ${VAULT}`)
for (const t of txLog.slice(-8)) console.log(`  ${(t.type+'                    ').slice(0,26)} ${(t.code+'                       ').slice(0,24)} ${t.note}`)
await c.disconnect()
