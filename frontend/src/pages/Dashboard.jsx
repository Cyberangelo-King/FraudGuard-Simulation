import { useTransactions } from '../hooks/useTransactions'
import './Dashboard.css'

function StatusBadge({ status }) {
  return <span className={`badge badge--${status}`}>{status}</span>
}

function ScoreBar({ score }) {
  const pct = Math.min(100, Math.max(0, (score ?? 0) * 100))
  const color = pct > 75 ? '#ff4d6d' : pct > 45 ? '#ffb347' : '#34d399'
  return (
    <div className="score-bar-track">
      <div className="score-bar-fill" style={{ width: `${pct}%`, background: color }} />
      <span className="score-label mono">{score?.toFixed(3) ?? '—'}</span>
    </div>
  )
}

// Simple error boundary for the dashboard
class DashboardErrorBoundary extends window.React?.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: '#ff4d6d' }}>
          <h2>Dashboard Error</h2>
          <p>{this.state.error?.message ?? 'An unexpected error occurred.'}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function DashboardContent() {
  const { transactions, loading, error } = useTransactions(100)

  const flagged  = transactions.filter((t) => t.status === 'flagged').length
  const approved = transactions.filter((t) => t.status === 'approved').length
  const pending  = transactions.filter((t) => t.status === 'pending').length
  const totalAmt = transactions.reduce((s, t) => s + Number(t.amount ?? 0), 0)

  return (
    <div className="dashboard">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">⬡</span>
          <span className="logo-text">FraudGuard</span>
        </div>
        <nav className="sidebar-nav">
          <a href="/dashboard" className="nav-item active">Dashboard</a>
          <a href="/device/owner" className="nav-item" target="_blank" rel="noreferrer">Owner Device</a>
          <a href="/device/fraudster" className="nav-item" target="_blank" rel="noreferrer">Fraudster Device</a>
          <a href="/device/secondary" className="nav-item" target="_blank" rel="noreferrer">Secondary Device</a>
        </nav>
        <div className="sidebar-footer">
          <span className="live-dot" />
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>Realtime active</span>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main-content">
        <header className="page-header">
          <div>
            <h1>Decision Support System</h1>
            <p className="text-muted">Real-time fraud detection &amp; risk scoring</p>
          </div>
        </header>

        {/* KPI Cards */}
        <section className="kpi-grid">
          <div className="card kpi-card">
            <p className="kpi-label">Total Volume</p>
            <p className="kpi-value">${totalAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="card kpi-card kpi-card--danger">
            <p className="kpi-label">Flagged</p>
            <p className="kpi-value text-danger">{flagged}</p>
          </div>
          <div className="card kpi-card kpi-card--success">
            <p className="kpi-label">Approved</p>
            <p className="kpi-value text-success">{approved}</p>
          </div>
          <div className="card kpi-card kpi-card--warning">
            <p className="kpi-label">Pending</p>
            <p className="kpi-value text-warning">{pending}</p>
          </div>
        </section>

        {/* Transactions Feed */}
        <section className="card feed-card">
          <div className="feed-header">
            <h2>Live Transaction Feed</h2>
            <span className="badge badge--approved">{transactions.length} records</span>
          </div>

          {loading && <p className="text-muted" style={{ padding: '2rem 0' }}>Loading transactions…</p>}
          {error   && <p className="text-danger"  style={{ padding: '2rem 0' }}>Error: {error}</p>}

          {!loading && !error && (
            <div className="table-wrapper">
              <table className="tx-table">
                <thead>
                  <tr>
                    <th>Transaction ID</th>
                    <th>Device ID</th>
                    <th>Amount</th>
                    <th>Ensemble Score</th>
                    <th>Status</th>
                    <th>Gemini Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="tx-row">
                      <td className="mono tx-id">{tx.id?.slice(0, 8)}…</td>
                      <td className="mono">{tx.device_id ?? '—'}</td>
                      <td className="mono">${Number(tx.amount).toFixed(2)}</td>
                      <td><ScoreBar score={tx.ensemble_score} /></td>
                      <td><StatusBadge status={tx.status} /></td>
                      <td className="explanation">{tx.gemini_explanation ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default function Dashboard() {
  return (
    <DashboardErrorBoundary>
      <DashboardContent />
    </DashboardErrorBoundary>
  )
}
