import { useState, useEffect } from 'react'

function Histogram({ histogram, valHistogram }) {
  const combined = Object.fromEntries(
    Object.keys(histogram).map(k => [k, histogram[k] + (valHistogram?.[k] ?? 0)])
  )
  const max = Math.max(...Object.values(combined), 1)
  return (
    <div className="histogram">
      {Object.entries(combined).map(([digit, total]) => {
        const trainH = histogram[digit] ?? 0
        const valH = valHistogram?.[digit] ?? 0
        return (
          <div key={digit} className="histogram-bar" title={`Digit ${digit}: ${trainH} training, ${valH} validation`}>
            <span className="bar-count">{total}</span>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div
                className="bar"
                style={{ height: `${(trainH / max) * 52}px`, background: 'var(--accent)', borderRadius: '4px 4px 0 0', minHeight: trainH > 0 ? 3 : 0 }}
              />
              <div
                style={{ height: `${(valH / max) * 52}px`, background: '#a78bfa', borderRadius: valH > 0 && trainH === 0 ? '4px 4px 0 0' : 0, minHeight: valH > 0 ? 3 : 0 }}
              />
            </div>
            <span className="bar-label">{digit}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function ReviewPage({ adminPassword }) {
  const isAdmin = !!adminPassword
  const [digits, setDigits] = useState([])
  const [stats, setStats] = useState(null)
  const [classFilter, setClassFilter] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  const [setFilter, setSetFilter] = useState('all')   // 'all' | 'training' | 'validation'
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (classFilter) params.set('class_name', classFilter)
      if (labelFilter !== '') params.set('label', labelFilter)
      const [digitsRes, statsRes] = await Promise.all([
        fetch(`/api/digits?${params}`),
        fetch(`/api/digits/stats${classFilter ? `?class_name=${classFilter}` : ''}`),
      ])
      setDigits(await digitsRes.json())
      setStats(await statsRes.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [classFilter, labelFilter])

  const handleDelete = async (id) => {
    if (!adminPassword) return
    await fetch(`/api/digits/${id}?x_admin_password=${encodeURIComponent(adminPassword)}`, { method: 'DELETE' })
    const deleted = digits.find(x => x.id === id)
    setDigits(d => d.filter(x => x.id !== id))
    if (stats && deleted) {
      const key = String(deleted.label)
      if (deleted.is_validation) {
        setStats(s => ({ ...s, val_histogram: { ...s.val_histogram, [key]: s.val_histogram[key] - 1 }, validation_total: s.validation_total - 1, total: s.total - 1 }))
      } else {
        setStats(s => ({ ...s, histogram: { ...s.histogram, [key]: s.histogram[key] - 1 }, training_total: s.training_total - 1, total: s.total - 1 }))
      }
    }
  }

  const handleToggleValidation = async (id) => {
    if (!adminPassword) return
    const res = await fetch(`/api/digits/${id}/toggle-validation?x_admin_password=${encodeURIComponent(adminPassword)}`, { method: 'POST' })
    if (!res.ok) return
    const { is_validation } = await res.json()
    const item = digits.find(x => x.id === id)
    setDigits(d => d.map(x => x.id === id ? { ...x, is_validation } : x))
    // Update stats counters
    if (stats && item) {
      const key = String(item.label)
      const delta = is_validation ? 1 : -1
      setStats(s => ({
        ...s,
        histogram: { ...s.histogram, [key]: s.histogram[key] - delta },
        val_histogram: { ...s.val_histogram, [key]: s.val_histogram[key] + delta },
        training_total: s.training_total - delta,
        validation_total: s.validation_total + delta,
      }))
    }
  }

  const visibleDigits = digits.filter(d => {
    if (setFilter === 'training') return !d.is_validation
    if (setFilter === 'validation') return d.is_validation
    return true
  })

  return (
    <div className="page">
      <div className="page-title">
        {isAdmin ? 'Data Review (Admin)' : 'Data Review'}
      </div>

      {/* Histogram + download */}
      {stats && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600 }}>Dataset Overview</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {stats.total} total
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)', display: 'inline-block' }} />
                <span style={{ color: 'var(--text-muted)' }}>{stats.training_total ?? stats.total} training</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#a78bfa', display: 'inline-block' }} />
                <span style={{ color: 'var(--text-muted)' }}>{stats.validation_total ?? 0} validation</span>
              </span>
            </div>
            <a
              href={`/api/digits/download${classFilter ? `?class_name=${encodeURIComponent(classFilter)}` : ''}`}
              className="btn btn-ghost btn-sm"
              download
              data-testid="download-btn"
            >
              Download training zip
            </a>
          </div>
          <Histogram histogram={stats.histogram} valHistogram={stats.val_histogram} />
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={classFilter}
          onChange={e => setClassFilter(e.target.value)}
          style={{ width: 'auto', minWidth: 160 }}
          data-testid="class-filter"
        >
          <option value="">All classes</option>
          {stats?.class_names?.map(cn => (
            <option key={cn} value={cn}>{cn}</option>
          ))}
        </select>
        <select
          value={labelFilter}
          onChange={e => setLabelFilter(e.target.value)}
          style={{ width: 'auto', minWidth: 120 }}
          data-testid="label-filter"
        >
          <option value="">All digits</option>
          {[0,1,2,3,4,5,6,7,8,9].map(d => (
            <option key={d} value={d}>Digit {d}</option>
          ))}
        </select>
        <select
          value={setFilter}
          onChange={e => setSetFilter(e.target.value)}
          style={{ width: 'auto', minWidth: 140 }}
          data-testid="set-filter"
        >
          <option value="all">All images</option>
          <option value="training">Training only</option>
          <option value="validation">Validation only</option>
        </select>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: 'auto' }}>
          {visibleDigits.length} images shown
        </span>
      </div>

      {isAdmin && (
        <div className="alert" style={{ background: '#a78bfa18', border: '1px solid #a78bfa55', color: '#a78bfa', marginBottom: '1rem', fontSize: '0.85rem' }}>
          <strong>Admin:</strong> Click an image to toggle it in/out of the validation set. Hover and click <strong>✕</strong> to delete.
          Validation images have a purple border.
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}><span className="spinner" /></div>
      ) : visibleDigits.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🖼️</div>
          No images yet.
        </div>
      ) : (
        <div className="review-grid" data-testid="review-grid">
          {visibleDigits.map(d => (
            <div
              key={d.id}
              className="review-item"
              data-testid={`digit-item-${d.id}`}
              style={d.is_validation ? { borderColor: '#a78bfa', borderWidth: 2 } : {}}
              onClick={isAdmin ? () => handleToggleValidation(d.id) : undefined}
              title={isAdmin ? (d.is_validation ? 'Click to remove from validation set' : 'Click to add to validation set') : undefined}
            >
              <img
                src={`/images/${d.filename}`}
                alt={`digit ${d.label}`}
                style={isAdmin ? { cursor: 'pointer' } : {}}
              />
              {d.is_validation && (
                <div style={{
                  position: 'absolute', top: 4, left: 4,
                  background: '#a78bfa', color: '#fff',
                  fontSize: '0.6rem', fontWeight: 700,
                  padding: '1px 5px', borderRadius: 4,
                  letterSpacing: '0.05em',
                  pointerEvents: 'none',
                }}>
                  VAL
                </div>
              )}
              <div className="meta" title={`${d.student_name} · ${d.class_name}`}>
                <strong>{d.label}</strong> · {d.student_name}
              </div>
              {isAdmin && (
                <button
                  className="delete-btn"
                  onClick={e => { e.stopPropagation(); handleDelete(d.id) }}
                  title="Delete"
                  data-testid={`delete-btn-${d.id}`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
