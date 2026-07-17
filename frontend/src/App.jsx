import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import DeviceOwner from './pages/DeviceOwner'
import DeviceFraudster from './pages/DeviceFraudster'
import DeviceSecondary from './pages/DeviceSecondary'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Admin / fraud-ops view */}
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Simulation device routes */}
        <Route path="/device/owner"     element={<DeviceOwner />} />
        <Route path="/device/fraudster" element={<DeviceFraudster />} />
        <Route path="/device/secondary" element={<DeviceSecondary />} />

        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
