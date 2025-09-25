import { Navigate, Route, Routes, BrowserRouter } from 'react-router-dom'
import './App.css'
import BroadcastPage from './features/broadcast/BroadcastPage'

function NotFound() {
  return (
    <div className="page">
      <div className="panel">
        <h1 className="page-title">ページが見つかりません</h1>
        <p className="muted">指定されたアドレスのページは存在しません。</p>
        <a className="link" href="/broadcast">
          配信者ページへ戻る
        </a>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/broadcast" replace />} />
        <Route path="/broadcast" element={<BroadcastPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
