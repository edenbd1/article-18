// Correctif : xrpl.js@5.1.0 signLoanSetByCounterparty utilise HashPrefix.transactionSig (0x53545800)
// alors que rippled attend HashPrefix::CounterpartyTxSign = makeHashPrefix('C','P','T') = 0x43505400
import { encodeForSigning, encode } from 'ripple-binary-codec'
import { sign as kpSign } from 'ripple-keypairs'
import { decode } from 'ripple-binary-codec'

export const COUNTERPARTY_TX_SIGN = '43505400'

export function signLoanSetByCounterpartyFixed(wallet, txBlobOrTx) {
  const tx = typeof txBlobOrTx === 'string' ? decode(txBlobOrTx) : { ...txBlobOrTx }
  if (tx.TransactionType !== 'LoanSet') throw new Error('not a LoanSet')
  if (tx.TxnSignature == null) throw new Error('first party must sign first')
  delete tx.CounterpartySignature
  const std = encodeForSigning(tx)                       // 53545800 || signingFields
  const msg = COUNTERPARTY_TX_SIGN + std.slice(8)        // 43505400 || signingFields
  tx.CounterpartySignature = {
    SigningPubKey: wallet.publicKey,
    TxnSignature: kpSign(msg, wallet.privateKey),
  }
  return { tx, tx_blob: encode(tx) }
}
