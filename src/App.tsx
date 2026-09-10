import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './shared/AuthContext'
import Login from './pages/Login'
import Home from './pages/Home'
import ListadoCursos from './pages/ListadoCursos'
import HubCurso from './pages/HubCurso'
import SeccionIndice from './pages/SeccionIndice'
import PanelAdmin from './pages/PanelAdmin'

export default function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/cursos" element={<ProtectedRoute><ListadoCursos /></ProtectedRoute>} />
          <Route path="/cursos/:cursoId" element={<ProtectedRoute><HubCurso /></ProtectedRoute>} />
          <Route path="/cursos/:cursoId/admin" element={<ProtectedRoute><PanelAdmin /></ProtectedRoute>} />
          <Route path="/cursos/:cursoId/:seccion" element={<ProtectedRoute><SeccionIndice /></ProtectedRoute>} />
        </Routes>
      </Layout>
    </AuthProvider>
  )
}
