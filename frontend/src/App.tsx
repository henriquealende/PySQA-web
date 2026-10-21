import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import PostProcessingPage from './pages/PostProcessing/PostProcessingPage'
import RecordingPage from './pages/DataAcquisition/RecordingPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/post-processing" replace />} />
        <Route path="post-processing" element={<PostProcessingPage />} />
        <Route path="data-acquisition" element={<RecordingPage />} />
        <Route path="system-analysis"  element={<ComingSoon label="System Analysis" />} />
      </Route>
      {/* There is no sign-in any more: old /login bookmarks and unknown addresses go to the app */}
      <Route path="*" element={<Navigate to="/post-processing" replace />} />
    </Routes>
  )
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center text-muted">
      <p className="text-lg">{label} — coming soon</p>
    </div>
  )
}
