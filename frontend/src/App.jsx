import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LangProvider } from './context/LangContext'
import Login from './pages/Login'
import CodeLogin from './pages/CodeLogin'
import Dashboard from './pages/Dashboard'

function PrivateRoute({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <LangProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/code" element={<CodeLogin />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </LangProvider>
  )
}
