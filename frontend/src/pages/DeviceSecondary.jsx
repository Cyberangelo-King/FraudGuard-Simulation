import { useState } from 'react'

/**
 * DeviceSecondary — Card owner's secondary device (phone/tablet).
 *
 * Simulates the legitimate owner trying to pay from an unrecognized device.
 * The feature vector is moderate — the amount is normal but the device is new
 * (captured in device_id) which the model may flag as moderate-risk.
 *
 * Per the product vision: this triggers a notification on the owner's primary
 * device asking them to confirm the purchase.
 */

const DEVICE_ID = 'owner-secondary-003'

export default function DeviceSecondary() {
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]         = useState(null)
  const [error, setError]           = useState(null)

  async function handlePay(e) {
    e.preventDefault()
    setSubmitting(true)
    setResult(null)
    setError(null)

    try {
      const features = generateSecondaryFeatures()
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/predict`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: DEVICE_ID,
            amount: 289.50,
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
  const isPending = result?.status === 'pending'

  return (
    <div style={styles.page}>
      <div style={{ ...styles.deviceFrame, borderTop: '4px solid #f59e0b' }}>
        <div style={styles.deviceHeader}>
          <span style={styles.deviceLabel}>📲 Owner's Secondary Device</span>
          <span style={styles.deviceId}>{DEVICE_ID}</span>
        </div>

        <div style={styles.store}>
          <h2 style={styles.storeTitle}>👟 SneakerHub Checkout</h2>
          <div style={styles.unrecognizedBadge}>⚠️ New / unrecognized device</div>

          <div style={styles.orderSummary}>
            <p>Air Max Limited Edition</p>
            <p style={styles.price}>$289.50</p>
          </div>
          <div style={styles.cardInfo}>
            <p style={styles.cardLabel}>Card: •••• •••• •••• 4242</p>
            <p style={styles.cardNote}>First purchase on this device</p>
          </div>

          {!result && (
            <button
              onClick={handlePay}
              disabled={submitting}
              style={{ ...styles.payBtn, background: submitting ? '#94a3b8' : '#f59e0b' }}
            >
              {submitting ? '⏳ Verifying…' : '💳 Pay Now'}
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
              background: isFlagged ? '#fffbeb' : isPending ? '#f0f9ff' : '#f0fdf4',
              border: `2px solid ${isFlagged ? '#f59e0b' : isPending ? '#0ea5e9' : '#22c55e'}`,
            }}>
              {isFlagged && (
                <>
                  <div style={{ ...styles.statusHeader, color: '#b45309' }}>
                    ⏸ PAYMENT PAUSED — Awaiting Owner Confirmation
                  </div>
                  <p style={{ fontSize: 13, color: '#78350f' }}>
                    Risk score: <strong>{result.ensemble_score?.toFixed(4)}</strong>
                  </p>
                  <p style={{ fontSize: 12, color: '#92400e', fontStyle: 'italic' }}>
                    {result.gemini_explanation}
                  </p>
                  <p style={{ fontSize: 11, color: '#b45309', marginTop: 8 }}>
                    A confirmation request has been sent to your primary device.
                    Please check your phone.
                  </p>
                </>
              )}
              {isPending && (
                <>
                  <div style={{ ...styles.statusHeader, color: '#0369a1' }}>
                    ⏳ Under Review
                  </div>
                  <p style={{ fontSize: 13, color: '#075985' }}>
                    Score: {result.ensemble_score?.toFixed(4)}
                  </p>
                </>
              )}
              {result.status === 'approved' && (
                <>
                  <div style={{ ...styles.statusHeader, color: '#16a34a' }}>✓ Payment Approved</div>
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
 * Generates a PCA feature vector for an unrecognized-device scenario.
 * Values are slightly off-center — not as extreme as fraud, but unusual enough
 * to possibly trigger a moderate-risk score depending on the model threshold.
 */
function generateSecondaryFeatures() {
  const features = {}
  for (let i = 1; i <= 28; i++) {
    features[`V${i}`] = (Math.random() - 0.5) * 1.2
  }
  // Moderate anomaly signals
  features.V3  = -1.8 + (Math.random() - 0.5) * 0.5
  features.V10 = -1.5 + (Math.random() - 0.5) * 0.5
  features.V14 = -2.1 + (Math.random() - 0.5) * 0.5

  features.log_amount = Math.log1p(289.50)
  features.hour = new Date().getHours()
  return features
}

const styles = {
  page: { minHeight: '100vh', background: '#1a1200', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '2rem' },
  deviceFrame: { width: 380, background: '#1e293b', borderRadius: 24, overflow: 'hidden', boxShadow: '0 20px 60px rgba(245,158,11,0.25)' },
  deviceHeader: { background: '#0f172a', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  deviceLabel: { color: '#fde68a', fontSize: 12, fontWeight: 600 },
  deviceId: { color: '#64748b', fontSize: 10 },
  store: { background: '#fff', margin: 16, borderRadius: 16, padding: 24 },
  storeTitle: { margin: '0 0 8px', fontSize: 20, color: '#1e293b' },
  unrecognizedBadge: { background: '#fffbeb', color: '#b45309', fontSize: 12, padding: '4px 10px', borderRadius: 6, marginBottom: 16, display: 'inline-block' },
  orderSummary: { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #e2e8f0', marginBottom: 16 },
  price: { fontWeight: 700, color: '#1e293b', fontSize: 18 },
  cardInfo: { background: '#fffbeb', borderRadius: 8, padding: 12, marginBottom: 16 },
  cardLabel: { margin: '2px 0', color: '#78350f', fontSize: 13 },
  cardNote: { margin: '4px 0 0', color: '#b45309', fontSize: 12, fontStyle: 'italic' },
  payBtn: { width: '100%', padding: '14px', borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', color: '#fff' },
  resultBox: { marginTop: 16, padding: 16, borderRadius: 12 },
  statusHeader: { fontSize: 16, fontWeight: 800, marginBottom: 8 },
}
