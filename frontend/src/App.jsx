import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import CollectPage from './pages/CollectPage.jsx'
import PredictPage from './pages/PredictPage.jsx'
import ReviewPage from './pages/ReviewPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import InstructionsPage from './pages/InstructionsPage.jsx'
import SubmitModelPage from './pages/SubmitModelPage.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <nav>
        <span className="logo">Digit NN</span>
        <NavLink to="/collect">Collect Data</NavLink>
        <NavLink to="/submit">Submit Model</NavLink>
        <NavLink to="/predict">Live Predict</NavLink>
        <NavLink to="/review">Data Review</NavLink>
        <NavLink to="/instructions">Instructions</NavLink>
        <NavLink to="/admin">Admin</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<Navigate to="/collect" replace />} />
        <Route path="/collect" element={<CollectPage />} />
        <Route path="/submit" element={<SubmitModelPage />} />
        <Route path="/predict" element={<PredictPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/instructions" element={<InstructionsPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  )
}
