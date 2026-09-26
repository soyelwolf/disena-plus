import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import { AuthProvider } from './shared/AuthContext'
import Login from './pages/Login'
import ListadoCursos from './pages/ListadoCursos'
import HubCurso from './pages/HubCurso'
import SeccionIndice from './pages/SeccionIndice'
import PanelAdmin from './pages/PanelAdmin'
import ElementoDetalle from './pages/detalle/ElementoDetalle'
import Proximamente from './pages/Proximamente'
import Soporte from './pages/Soporte'
import ConsignasPage from './pages/ConsignasPage'
import RubricasPage from './pages/RubricasPage'
import CriterioForm from './pages/CriterioForm'
import ListaCotejoPage from './pages/ListaCotejoPage'
import IndicadoresForm from './pages/IndicadoresForm'
import EscalaPage from './pages/EscalaPage'
import IndicadoresEscalaForm from './pages/IndicadoresEscalaForm'
import { ToastProvider } from './components/ui'
import CentroDatos from './pages/CentroDatos'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/home" element={<Navigate to="/cursos" replace />} />
          <Route path="/cursos" element={<ProtectedRoute><ListadoCursos /></ProtectedRoute>} />
          <Route path="/cursos/:cursoId" element={<ProtectedRoute><HubCurso /></ProtectedRoute>} />
          <Route path="/cursos/:cursoId/consignas" element={<ProtectedRoute><ConsignasPage /></ProtectedRoute>} />
          <Route path="/cursos/:cursoId/rubricas" element={<ProtectedRoute><RubricasPage /></ProtectedRoute>} />
          <Route path="/cursos/:cursoId/rubricas/:sesionId/criterio" element={<ProtectedRoute><CriterioForm /></ProtectedRoute>} />
          <Route path="/cursos/:cursoId/rubricas/:sesionId/editar" element={<ProtectedRoute><CriterioForm completa /></ProtectedRoute>} />
          <Route path="/cursos/:cursoId/rubricas/:sesionId/criterio/:criterioId" element={<ProtectedRoute><CriterioForm /></ProtectedRoute>} />
          <Route path="/cursos/:cursoId/lista" element={<ProtectedRoute><ListaCotejoPage /></ProtectedRoute>} />
          <Route path="/cursos/:cursoId/lista/:sesionId/editar" element={<ProtectedRoute><IndicadoresForm /></ProtectedRoute>} />
          <Route path="/cursos/:cursoId/escala" element={<ProtectedRoute><EscalaPage /></ProtectedRoute>} />
          <Route path="/cursos/:cursoId/escala/:sesionId/editar" element={<ProtectedRoute><IndicadoresEscalaForm /></ProtectedRoute>} />
          <Route path="/cursos/:cursoId/admin" element={<ProtectedRoute><PanelAdmin /></ProtectedRoute>} />
          <Route path="/cursos/:cursoId/:seccion" element={<ProtectedRoute><SeccionIndice /></ProtectedRoute>} />
          <Route path="/cursos/:cursoId/:seccion/:sesionId" element={<ProtectedRoute><ElementoDetalle /></ProtectedRoute>} />
          <Route
            path="/manuales"
            element={<ProtectedRoute><Proximamente titulo="Manuales" icon="manuales" descripcion="Aquí encontrarás los manuales de uso de Diseña+ y de cada instrumento de evaluación." /></ProtectedRoute>}
          />
          <Route
            path="/lineamientos"
            element={<ProtectedRoute><Proximamente titulo="Lineamientos" icon="lineamientos" descripcion="Los lineamientos institucionales para el diseño de contenido académico estarán disponibles aquí." /></ProtectedRoute>}
          />
          <Route
            path="/tutoriales"
            element={<ProtectedRoute><Proximamente titulo="Tutoriales" icon="tutoriales" descripcion="Videos y guías paso a paso para cada proceso: consignas, rúbricas, matriz, lista de cotejo y escala de valoración." /></ProtectedRoute>}
          />
          <Route
            path="/soporte"
            element={<ProtectedRoute><Soporte /></ProtectedRoute>}
          />
          <Route
            path="/datos"
            element={<AdminRoute><CentroDatos /></AdminRoute>}
          />
          <Route path="*" element={<Navigate to="/cursos" replace />} />
        </Routes>
      </Layout>
      </ToastProvider>
    </AuthProvider>
  )
}
