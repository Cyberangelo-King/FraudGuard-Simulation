import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * DeviceOwner — Card owner's primary device.
 *
 * Shows a simulated checkout page for a normal purchase.
 * Also listens on the Supabase Realtime channel for flagged transactions
 * that belong to this device (owner-device-001) or any OTHER device using
 * the same card, then surfaces an in-app push notification modal:
 *   "Did you make this purchase? [YES] [NO]"
 *
 * If YES within CONFIRM_TIMEOUT_MS → patches transaction to 'approved'.
 * If NO or timeout → patches transaction to 'flagged' (escalates on dashboard).
 */

const DEVICE_ID = 'owner-device-001'
const CONFIRM_TIMEOUT_MS = 10_000   // 10 seconds to respond

export default function DeviceOwner() {
  const [submitting, setSubmitting] = useState(false)
  const [lastTx, setLastTx]         = useState(null)   // last own transaction
  const [notification, setNotification] = useState(null) // { tx, secondsLeft }
  const timerRef = useRef(null)

  // ── Realtime: watch for flagged transactions from OTHER devices ───────────
  useEffect(() => {
    const channel = supabase
      .channel('owner-device-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions' },
        (payload) => {
          const tx = payload.new
          // Notify owner if a FLAGGED transaction comes from a different device
          if (tx.status === 'flagged' && tx.device_id !== DEVICE_ID) {
            showNotification(tx)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  function showNotification(tx) {
    // Clear any existing timer
    if (timerRef.current) clearInterval(timerRef.current)

    let secondsLeft = Math.ceil(CONFIRM_TIMEOUT_MS / 1000)
    setNotification({ tx, secondsLeft })

    timerRef.current = setInterval(() => {
      secondsLeft -= 1
      setNotification((prev) => prev ? { ...prev, secondsLeft } : null)
      if (secondsLeft <= 0) {
        clearInterval(timerRef.current)
        handleTimeout(tx)
      }
    }, 1000)
  }

  async function handleTimeout(tx) {
    setNotification(null)
    // On timeout, leave the transaction as 'flagged' — dashboard will escalate
    console.warn('Owner did not respond — transaction remains flagged:', tx.id)
  }

  async function handleOwnerConfirm(tx, approved) {
    if (timerRef.current) clearInterval(timerRef.current)
    setNotification(null)

    const newStatus = approved ? 'approved' : 'flagged'
    await supabase
      .from('transactions')
      .update({ status: newStatus })
      .eq('id', tx.id)
  }

  // ── Normal purchase submission ────────────────────────────────────────────
  async function handlePay(e) {
    e.preventDefault()
    setSubmitting(true)

    try {
      // Generate a simple feature vector (normal transaction values)
      const features = generateNormalFeatures()
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/predict`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: DEVICE_ID,
            amount: 49.99,
            ...features,
          }),
        }
      )
      const data = await res.json()
      setLastTx(data)
    } catch (err) {
      console.error('Payment failed:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.deviceFrame}>
        <div style={styles.deviceHeader}>
          <span style={styles.deviceLabel}>📱 Card Owner — Primary Device</span>
          <span style={styles.deviceId}>{DEVICE_ID}</span>
        </div>

        {/* Checkout form */}
        <div style={styles.store}>
          <h2 style={styles.storeTitle}>🛍️ TechMart Checkout</h2>
          <div style={styles.orderSummary}>
            <p>Wireless Earbuds Pro</p>
            <p style={styles.price}>$49.99</p>
          </div>
          <div style={styles.cardInfo}>
            <p style={styles.cardLabel}>Card: •••• •••• •••• 4242</p>
          </div>
          <button
            onClick={handlePay}
            disabled={submitting}
            style={{ ...styles.payBtn, ...styles.payBtnNormal }}
          >
            {submitting ? 'Processing…' : 'Pay Now'}
          </button>

          {lastTx && (
            <div style={{
              ...styles.result,
              background: lastTx.status === 'approved' ? '#d1fae5' : '#fee2e2',
            }}>
              <p>Status: <strong>{lastTx.status}</strong></p>
              <p>Risk score: {lastTx.ensemble_score?.toFixed(4)}</p>
            </div>
          )}
        </div>

        {/* Push notification modal */}
        {notification && (
          <div style={styles.notificationOverlay}>
            <div style={styles.notificationCard}>
              <div style={styles.notifHeader}>🔔 Security Alert</div>
              <p style={styles.notifText}>
                A transaction of <strong>${Number(notification.tx.amount).toFixed(2)}</strong>{' '}
                was attempted from device <strong>{notification.tx.device_id}</strong>.
              </p>
              <p style={styles.notifSubtext}>
                Did you authorise this payment?
              </p>
              <p style={styles.timer}>Auto-escalating in {notification.secondsLeft}s…</p>
              <div style={styles.notifActions}>
                <button
                  onClick={() => handleOwnerConfirm(notification.tx, true)}
                  style={{ ...styles.notifBtn, background: '#22c55e' }}
                >
                  ✓ YES
                </button>
                <button
                  onClick={() => handleOwnerConfirm(notification.tx, false)}
                  style={{ ...styles.notifBtn, background: '#ef4444' }}
                >
                  ✗ NO — Block it
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a PCA feature vector representative of a legitimate transaction.
 * Values are near zero (typical for scaled PCA components) with a low amount.
 */
function generateNormalFeatures() {
  const features = {}
  for (let i = 1; i <= 28; i++) {
    // Small random noise around zero — typical for non-anomalous PCA components
    features[`V${i}`] = (Math.random() - 0.5) * 0.5
  }
  features.log_amount = Math.log1p(49.99)
  features.hour = new Date().getHours()
  return features
}

// ── Inline styles ─────────────────────────────────────────────────────────────
const styles = {
  page: { minHeight: '100vh', background: '#f0f4f8', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '2rem' },
  deviceFrame: { width: 380, background: '#1e293b', borderRadius: 24, padding: 0, boxShadow: '0 20px 60px rgba(0,0,0,0.4)', overflow: 'hidden', position: 'relative' },
  deviceHeader: { background: '#0f172a', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  deviceLabel: { color: '#94a3b8', fontSize: 12, fontWeight: 600 },
  deviceId: { color: '#64748b', fontSize: 10 },
  store: { background: '#fff', margin: 16, borderRadius: 16, padding: 24 },
  storeTitle: { margin: '0 0 16px', fontSize: 20, color: '#1e293b' },
  orderSummary: { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #e2e8f0', marginBottom: 16 },
  price: { fontWeight: 700, color: '#1e293b' },
  cardInfo: { background: '#f8fafc', borderRadius: 8, padding: 12, marginBottom: 16 },
  cardLabel: { margin: 0, color: '#64748b', fontSize: 14 },
  payBtn: { width: '100%', padding: '14px', borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.2s' },
  payBtnNormal: { background: '#6366f1', color: '#fff' },
  result: { marginTop: 16, padding: 12, borderRadius: 8, fontSize: 14 },
  notificationOverlay: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  notificationCard: { background: '#fff', borderRadius: 16, padding: 24, width: 300, textAlign: 'center' },
  notifHeader: { fontSize: 18, fontWeight: 700, marginBottom: 12, color: '#1e293b' },
  notifText: { fontSize: 14, color: '#475569', marginBottom: 8 },
  notifSubtext: { fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 4 },
  timer: { fontSize: 12, color: '#ef4444', marginBottom: 16 },
  notifActions: { display: 'flex', gap: 12 },
  notifBtn: { flex: 1, padding: '12px', borderRadius: 10, border: 'none', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
}
