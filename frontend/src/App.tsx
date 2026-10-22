import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { rehydrateSession } from './api/http'
import PostProcessingPage from './pages/PostProcessing/PostProcessingPage'
import SystemAnalysisPage from './pages/SystemAnalysis/SystemAnalysisPage'

const DocsPage = lazy(() => import('./pages/Docs/DocsPage'))

export default function App() {
  // After a reload (or a server restart) bring the file list back
  useEffect(() => { void rehydrateSession() }, [])

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/post-processing" replace />} />
        <Route path="post-processing" element={<PostProcessingPage />} />
        <Route path="data-acquisition" element={null} />
        <Route path="system-analysis"  element={<SystemAnalysisPage />} />
        <Route path="docs" element={<Navigate to="/docs/sobre" replace />} />
        <Route path="docs/:page" element={<Suspense fallback={null}><DocsPage /></Suspense>} />
      </Route>
      {/* There is no sign-in any more: old /login bookmarks and unknown addresses go to the app */}
      <Route path="*" element={<Navigate to="/post-processing" replace />} />
    </Routes>
  )
}
