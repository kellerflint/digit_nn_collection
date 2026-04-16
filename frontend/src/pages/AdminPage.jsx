import { useState } from 'react'
import ReviewPage from './ReviewPage.jsx'
import { errorDetail } from '../api.js'

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/verify?x_admin_password=${encodeURIComponent(input)}`)
      if (!res.ok) throw new Error('Wrong password')
      setPassword(input)
    } catch {
      setError('Wrong password.')
    } finally {
      setLoading(false)
    }
  }

  if (!password) {
    return (
      <div className="page">
        <div className="page-title">Admin Login</div>
        <div className="card" style={{ maxWidth: 380 }}>
          {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label>Admin password</label>
              <input
                type="password"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Password"
                required
                autoFocus
                data-testid="admin-password-input"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} data-testid="admin-login-btn">
              {loading ? <span className="spinner" /> : 'Login'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0.5rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.85rem',
      }}>
        <span style={{ color: 'var(--success)' }}>Admin mode active</span>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <ClassAdmin adminPassword={password} />
          <ModelAdmin adminPassword={password} />
          <button className="btn btn-ghost btn-sm" onClick={() => setPassword('')}>Logout</button>
        </div>
      </div>
      <ReviewPage adminPassword={password} />
    </div>
  )
}

// ── Class section manager ─────────────────────────────────────────────────────

function ClassAdmin({ adminPassword }) {
  const [classes, setClasses] = useState(null)
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const res = await fetch('/api/classes')
    setClasses(await res.json())
    setOpen(true)
  }

  const addClass = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('name', newName.trim())
      const res = await fetch(`/api/classes?x_admin_password=${encodeURIComponent(adminPassword)}`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) throw new Error(await errorDetail(res, 'Failed'))
      const created = await res.json()
      setClasses(c => [...c, created].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
    } catch (err) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  const deleteClass = async (id) => {
    await fetch(`/api/classes/${id}?x_admin_password=${encodeURIComponent(adminPassword)}`, { method: 'DELETE' })
    setClasses(c => c.filter(x => x.id !== id))
  }

  if (!open) {
    return <button className="btn btn-ghost btn-sm" onClick={load} data-testid="manage-classes-btn">Manage Classes</button>
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000a', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={() => setOpen(false)}>
      <div
        className="card"
        style={{ width: '90%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <span style={{ fontWeight: 600 }}>Class Sections</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Close</button>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        <form onSubmit={addClass} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="e.g. CS101-A"
            required
            data-testid="new-class-input"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary" disabled={adding} data-testid="add-class-btn">
            {adding ? <span className="spinner" /> : 'Add'}
          </button>
        </form>

        {!classes || classes.length === 0 ? (
          <div className="empty-state" style={{ padding: '1.5rem' }}>No classes yet. Add one above.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {classes.map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.6rem 0.75rem',
                background: 'var(--surface2)',
                borderRadius: 7,
              }}>
                <span style={{ fontWeight: 500 }} data-testid={`class-item-${c.id}`}>{c.name}</span>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => deleteClass(c.id)}
                  data-testid={`delete-class-${c.id}`}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Model manager ─────────────────────────────────────────────────────────────

function ModelAdmin({ adminPassword }) {
  const [models, setModels] = useState(null)
  const [open, setOpen] = useState(false)

  const load = async () => {
    const res = await fetch('/api/models')
    setModels(await res.json())
    setOpen(true)
  }

  const deleteModel = async (id) => {
    await fetch(`/api/models/${id}?x_admin_password=${encodeURIComponent(adminPassword)}`, { method: 'DELETE' })
    setModels(m => m.filter(x => x.id !== id))
  }

  const recalculate = async (id) => {
    const res = await fetch(`/api/models/${id}/recalculate?x_admin_password=${encodeURIComponent(adminPassword)}`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setModels(m => m.map(x => x.id === id ? { ...x, accuracy: data.accuracy } : x))
    }
  }

  if (!open) {
    return <button className="btn btn-ghost btn-sm" onClick={load}>Manage Models</button>
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000a', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={() => setOpen(false)}>
      <div
        className="card"
        style={{ width: '90%', maxWidth: 640, maxHeight: '80vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <span style={{ fontWeight: 600 }}>Model Submissions</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Close</button>
        </div>
        {!models || models.length === 0 ? (
          <div className="empty-state">No models submitted.</div>
        ) : (
          <table className="leaderboard-table" style={{ width: '100%' }}>
            <thead><tr><th>#</th><th>Name</th><th>Student</th><th>Accuracy</th><th></th></tr></thead>
            <tbody>
              {models.map((m, i) => (
                <tr key={m.id}>
                  <td>{i + 1}</td>
                  <td>{m.submission_name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{m.student_name}</td>
                  <td>{m.accuracy != null ? `${(m.accuracy * 100).toFixed(1)}%` : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => recalculate(m.id)}
                        data-testid={`recalculate-${m.id}`}
                      >
                        Recalc
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteModel(m.id)}
                        data-testid={`delete-model-${m.id}`}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
