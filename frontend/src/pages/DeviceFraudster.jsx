import { useState } from 'react'

/**
 * DeviceFraudster — Fraudster's device.
 *
 * Simulates a fraudster with stolen card details attempting a large purchase.
 * The feature vector is crafted to produce a high fraud score:
 *  - Large amount
 *  - Anomalous PCA components (extreme values for V1, V4, V10, V12, V14)
 *  - Unusual hour (3am)
 *
 * When submitted, the model should flag the transaction and the owner's
 * device will receive a push notification.
 */

const DEVICE_ID = 'fraudster-device-002'

export default function DeviceFraudster() {
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]         = useState(null)
  const [error, setError]           = useState(null)

  async function handlePay(e) {
    e.preventDefault()
    setSubmitting(true)
    setResult(null)
    setError(null)

    try {
      const features = generateFraudFeatures()
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/predict`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: DEVICE_ID,
            amount: 4999.00,
            ...features,
          }),
        }
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const isFlagged = result?.status === 'flagged'

  return (
    <div style={styles.page}>
      <div style={{ ...styles.deviceFrame, borderTop: '4px solid #ef4444' }}>
        <div style={styles.deviceHeader}>
          <span style={styles.deviceLabel}>💻 Fraudster Device</span>
          <span style={styles.deviceId}>{DEVICE_ID}</span>
        </div>

        <div style={styles.store}>
          <h2 style={styles.storeTitle}>🛒 LuxuryGoods Checkout</h2>
          <div style={styles.stolenBadge}>⚠️ Using stolen card details</div>

          <div style={styles.orderSummary}>
            <p>Rolex Submariner Watch</p>
            <p style={styles.price}>$4,999.00</p>
          </div>
          <div style={styles.cardInfo}>
            <p style={styles.cardLabel}>Card: •••• •••• •••• 4242 (stolen)</p>
            <p style={styles.cardLabel}>CVV: 999 | Exp: 12/26</p>
          </div>

          {!result && (
            <button
              onClick={handlePay}
              disabled={submitting}
              style={{ ...styles.payBtn, background: submitting ? '#94a3b8' : '#dc2626' }}
            >
              {submitting ? '⏳ Processing…' : '💳 Pay Now'}
            </button>
          )}

          {error && (
            <div style={{ ...styles.resultBox, background: '#fee2e2' }}>
              <p style={{ color: '#dc2626' }}>❌ Error: {error}</p>
            </div>
          )}

          {result && (
            <div style={{
              ...styles.resultBox,
              background: isFlagged ? '#fef2f2' : '#f0fdf4',
              border: `2px solid ${isFlagged ? '#ef4444' : '#22c55e'}`,
            }}>
              {isFlagged ? (
                <>
                  <div style={styles.flagHeader}>🚨 TRANSACTION PAUSED</div>
                  <p style={{ fontSize: 13, color: '#7f1d1d' }}>
                    Risk score: <strong>{result.ensemble_score?.toFixed(4)}</strong>
                  </p>
                  <p style={{ fontSize: 12, color: '#991b1b', fontStyle: 'italic' }}>
                    {result.gemini_explanation}
                  </p>
                  <p style={{ fontSize: 11, color: '#b91c1c', marginTop: 8 }}>
                    Notification sent to card owner's device for verification.
                  </p>
                </>
              ) : (
                <>
                  <div style={{ color: '#16a34a', fontWeight: 700 }}>✓ Transaction Approved</div>
                  <p style={{ fontSize: 13, color: '#166534' }}>
                    Score: {result.ensemble_score?.toFixed(4)}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Generates a PCA feature vector representative of a fraudulent transaction.
 * Uses extreme values for the features known to be most predictive of fraud
 * in the credit-card fraud dataset (V14, V10, V12 are historically high-weight).
 */
function generateFraudFeatures() {
  const features = {}
  for (let i = 1; i <= 28; i++) {
    // Default to near-zero
    features[`V${i}`] = (Math.random() - 0.5) * 0.3
  }
  // Anomalous values for high-signal fraud features
  features.V1  = -3.5 + (Math.random() - 0.5)
  features.V4  =  2.8 + (Math.random() - 0.5)
  features.V10 = -3.2 + (Math.random() - 0.5)
  features.V12 = -4.1 + (Math.random() - 0.5)
  features.V14 = -5.8 + (Math.random() - 0.5)
  features.V17 = -3.9 + (Math.random() - 0.5)

  features.log_amount = Math.log1p(4999.00)
  features.hour = 3   // 3am — suspicious hour
  return features
}

const styles = {
  page: { minHeight: '100vh', background: '#1a0a0a', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '2rem' },
  deviceFrame: { width: 380, background: '#1e293b', borderRadius: 24, overflow: 'hidden', boxShadow: '0 20px 60px rgba(239,68,68,0.3)' },
  deviceHeader: { background: '#0f172a', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  deviceLabel: { color: '#fca5a5', fontSize: 12, fontWeight: 600 },
  deviceId: { color: '#64748b', fontSize: 10 },
  store: { background: '#fff', margin: 16, borderRadius: 16, padding: 24 },
  storeTitle: { margin: '0 0 8px', fontSize: 20, color: '#1e293b' },
  stolenBadge: { background: '#fef2f2', color: '#dc2626', fontSize: 12, padding: '4px 10px', borderRadius: 6, marginBottom: 16, display: 'inline-block' },
  orderSummary: { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #e2e8f0', marginBottom: 16 },
  price: { fontWeight: 700, color: '#dc2626', fontSize: 18 },
  cardInfo: { background: '#fef2f2', borderRadius: 8, padding: 12, marginBottom: 16 },
  cardLabel: { margin: '2px 0', color: '#7f1d1d', fontSize: 13 },
  payBtn: { width: '100%', padding: '14px', borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', color: '#fff' },
  resultBox: { marginTop: 16, padding: 16, borderRadius: 12 },
  flagHeader: { fontSize: 18, fontWeight: 800, color: '#dc2626', marginBottom: 8 },
}
