import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Toaster } from './components/ui'
import { routeAccess } from './lib/permissions'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CasesList from './pages/CasesList'
import Board from './pages/Board'
import Flow from './pages/Flow'
import CaseWorkspace from './pages/CaseWorkspace'
import ForwardWizard from './pages/ForwardWizard'
import HandoffReview from './pages/HandoffReview'
import Notifications from './pages/Notifications'
import AdminConsole from './pages/AdminConsole'
import AuditLog from './pages/AuditLog'
import Unauthorized from './pages/Unauthorized'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/cases" element={<CasesList />} />
          <Route path="/board" element={<Board />} />
          <Route path="/flow" element={<Flow />} />
          <Route path="/cases/:id" element={<CaseWorkspace />} />
          <Route path="/cases/:id/forward" element={<ForwardWizard />} />
          <Route path="/handoffs/:id" element={<HandoffReview />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/console" element={<ProtectedRoute roles={routeAccess.console}><AdminConsole /></ProtectedRoute>} />
          <Route path="/audit" element={<ProtectedRoute roles={routeAccess.audit}><AuditLog /></ProtectedRoute>} />
          <Route path="/unauthorized" element={<Unauthorized />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}
