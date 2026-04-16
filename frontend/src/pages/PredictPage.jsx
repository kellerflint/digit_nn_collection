import { useState, useRef, useEffect, useCallback } from 'react'
import DrawingCanvas from '../components/DrawingCanvas.jsx'

const MAX_SELECTED = 4

function ModelSlot({ model, onRemove, canvasData }) {
  const [result, setResult] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!canvasData) { setResult(null); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(canvasData)
        const blob = await res.blob()
        const fd = new FormData()
        fd.append('image', blob, 'digit.png')
        const resp = await fetch(`/api/predict/${model.id}`, { method: 'POST', body: fd })
        if (resp.ok) setResult(await resp.json())
      } catch {}
    }, 120)
    return () => clearTimeout(debounceRef.current)
  }, [canvasData, model.id])

  const probs = result?.probabilities
  const pred = result?.prediction

  return (
    <div className={`model-slot ${result ? 'active' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="model-name" data-testid="model-slot-name">{model.submission_name}</div>
          <div className="model-acc">
            {model.accuracy != null ? `${(model.accuracy * 100).toFixed(1)}% accuracy` : 'accuracy pending'}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onRemove} title="Remove">✕</button>
      </div>

      {pred != null ? (
        <>
          <div className="prediction-big" data-testid="model-prediction">{pred}</div>
          {probs && (
            <div className="prob-bars">
              {probs.map((p, i) => (
                <div key={i} className={`prob-row ${i === pred ? 'top' : ''}`}>
                  <span className="label">{i}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(p * 100).toFixed(1)}%` }} />
                  </div>
                  <span className="pct">{(p * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Draw a digit to see prediction
        </div>
      )}
    </div>
  )
}

export default function PredictPage() {
  const [models, setModels] = useState([])
  const [selected, setSelected] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [canvasData, setCanvasData] = useState(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    fetch('/api/models')
      .then(r => r.json())
      .then(data => { setModels(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleCanvasChange = useCallback((dataUrl) => {
    setCanvasData(dataUrl)
  }, [])

  const toggleModel = (model) => {
    if (selected.includes(model.id)) {
      setSelected(s => s.filter(id => id !== model.id))
    } else if (selected.length < MAX_SELECTED) {
      setSelected(s => [...s, model.id])
    }
  }

  const removeSelected = (id) => {
    setSelected(s => s.filter(sid => sid !== id))
  }

  const filtered = models.filter(m =>
    m.submission_name.toLowerCase().includes(search.toLowerCase()) ||
    m.student_name.toLowerCase().includes(search.toLowerCase())
  )

  const selectedModels = selected.map(id => models.find(m => m.id === id)).filter(Boolean)

  return (
    <div className="page">
      <div className="page-title">Live Prediction</div>

      <div className="predict-layout" style={{ marginBottom: '2rem' }}>
        {/* Left: canvas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Draw a digit</div>
          <DrawingCanvas
            ref={canvasRef}
            onChange={handleCanvasChange}
          />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => canvasRef.current?.clear()}
            data-testid="clear-canvas-btn"
          >
            Clear
          </button>
        </div>

        {/* Right: model slots */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {selected.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Select up to {MAX_SELECTED} models from the table below to compare predictions.
            </div>
          ) : (
            <div className="model-slots-grid">
              {selectedModels.map(m => (
                <ModelSlot
                  key={m.id}
                  model={m}
                  onRemove={() => removeSelected(m.id)}
                  canvasData={canvasData}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard / selector table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600 }}>
            All Submissions
            <span style={{ marginLeft: '0.5rem', fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              — select up to {MAX_SELECTED} to compare
            </span>
          </div>
          <input
            className="search-input"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="model-search-input"
          />
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🤖</div>
            No models submitted yet.
          </div>
        ) : (
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th>Name</th>
                <th>Student</th>
                <th>Accuracy</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, idx) => {
                const isSelected = selected.includes(m.id)
                const rank = models.findIndex(x => x.id === m.id) + 1
                return (
                  <tr
                    key={m.id}
                    className={isSelected ? 'selected' : ''}
                    onClick={() => toggleModel(m)}
                    data-testid={`model-row-${m.id}`}
                  >
                    <td>
                      <span className={`rank-badge ${rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : ''}`}>
                        {rank}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{m.submission_name}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{m.student_name}</td>
                    <td>
                      <div className="accuracy-bar">
                        <div className="accuracy-bar-track">
                          <div className="accuracy-bar-fill" style={{ width: `${(m.accuracy ?? 0) * 100}%` }} />
                        </div>
                        <span style={{ fontSize: '0.85rem', minWidth: 40 }}>
                          {m.accuracy != null ? `${(m.accuracy * 100).toFixed(1)}%` : '—'}
                        </span>
                      </div>
                    </td>
                    <td>
                      {isSelected ? (
                        <span className="badge badge-blue">Selected</span>
                      ) : selected.length < MAX_SELECTED ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Click to add</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Max 4</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
