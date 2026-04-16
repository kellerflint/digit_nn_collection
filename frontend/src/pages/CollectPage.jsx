import { useState, useRef, useCallback, useEffect } from 'react'
import DrawingCanvas from '../components/DrawingCanvas.jsx'
import { errorDetail } from '../api.js'

const TARGET_COUNT = 5
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

// ── Profile form ──────────────────────────────────────────────────────────────

function ProfileForm({ onSave }) {
  const [name, setName] = useState('')
  const [className, setClassName] = useState('')
  const [classes, setClasses] = useState([])
  const [loadingClasses, setLoadingClasses] = useState(true)

  useEffect(() => {
    fetch('/api/classes')
      .then(r => r.json())
      .then(data => { setClasses(data); setLoadingClasses(false) })
      .catch(() => setLoadingClasses(false))
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim() || !className) return
    onSave({ studentName: name.trim(), className })
  }

  return (
    <div className="page">
      <div className="page-title">Collect Digit Data</div>
      <div className="card" style={{ maxWidth: 420 }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.2rem', fontSize: '0.9rem' }}>
          Enter your info. You'll draw each digit 0–9 a total of {TARGET_COUNT} times each.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label>Your name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Alex Smith"
              required
              data-testid="student-name-input"
            />
          </div>
          <div className="form-group">
            <label>Class / section</label>
            {loadingClasses ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading classes…</div>
            ) : classes.length === 0 ? (
              <div className="alert alert-error" style={{ marginBottom: 0 }}>
                No classes set up yet. Ask your instructor to add classes in the admin panel.
              </div>
            ) : (
              <select
                value={className}
                onChange={e => setClassName(e.target.value)}
                required
                data-testid="class-name-select"
              >
                <option value="">Select your class…</option>
                {classes.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={classes.length === 0}
            data-testid="start-btn"
          >
            Start Drawing
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Drawing view (one digit at a time) ────────────────────────────────────────

function DrawingView({ digit, count, studentName, className, onSaved, onDone }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  const canvasRef = useRef(null)

  // Clear canvas and reset state when digit changes
  useEffect(() => {
    canvasRef.current?.clear()
    setError('')
    setJustSaved(false)
  }, [digit])

  const handleSubmit = useCallback(async () => {
    if (!canvasRef.current) return
    if (canvasRef.current.isEmpty()) {
      setError('Canvas is empty — draw the digit first.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const blob = await canvasRef.current.getBlob()
      const fd = new FormData()
      fd.append('label', digit)
      fd.append('student_name', studentName)
      fd.append('class_name', className)
      fd.append('image', blob, 'digit.png')

      const res = await fetch('/api/digits', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await errorDetail(res, 'Upload failed'))

      canvasRef.current.clear()
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 1500)
      onSaved(digit)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }, [digit, studentName, className, onSaved])

  const newCount = count  // count is updated by parent after onSaved
  const remaining = TARGET_COUNT - newCount

  return (
    <div className="page">
      {/* Header bar — very clear about what's being drawn */}
      <div style={{
        background: 'var(--accent)',
        margin: '-2rem -1.5rem 2rem',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 10,
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem', fontWeight: 800, color: '#fff',
          }}>
            {digit}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#fff' }}>
              Drawing digit: {digit}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)' }}>
              {remaining > 0
                ? `${newCount}/${TARGET_COUNT} saved — ${remaining} more to go`
                : `All ${TARGET_COUNT} saved for this digit`}
            </div>
          </div>
        </div>
        <button
          className="btn"
          style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 600 }}
          onClick={onDone}
          data-testid="done-btn"
        >
          Done with {digit} →
        </button>
      </div>

      <div className="split-layout" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
          <DrawingCanvas ref={canvasRef} />
          <div style={{ display: 'flex', gap: '0.75rem', width: '100%', maxWidth: 280 }}>
            <button
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => { canvasRef.current?.clear(); setError(''); setJustSaved(false) }}
              data-testid="clear-btn"
            >
              Clear
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 2 }}
              onClick={handleSubmit}
              disabled={submitting || newCount >= TARGET_COUNT}
              data-testid="submit-digit-btn"
            >
              {submitting
                ? <span className="spinner" />
                : newCount >= TARGET_COUNT
                  ? 'All saved!'
                  : `Save this ${digit}`}
            </button>
          </div>

          {error && <div className="alert alert-error" style={{ width: '100%', maxWidth: 280 }} data-testid="error-msg">{error}</div>}
          {justSaved && <div className="alert alert-success" style={{ width: '100%', maxWidth: 280 }} data-testid="success-msg">Saved!</div>}
        </div>

        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Instructions</div>
          <ul style={{ color: 'var(--text-muted)', fontSize: '0.88rem', paddingLeft: '1.2rem', lineHeight: 1.8 }}>
            <li>Draw a clear <strong style={{ color: 'var(--text)' }}>{digit}</strong> on the black canvas</li>
            <li>Click <strong style={{ color: 'var(--text)' }}>Save this {digit}</strong> to submit it</li>
            <li>You can clear and redraw as many times as you like before saving</li>
            <li>Save it <strong style={{ color: 'var(--text)' }}>{TARGET_COUNT} times</strong> total, then click <strong style={{ color: 'var(--text)' }}>Done</strong></li>
          </ul>

          {newCount >= TARGET_COUNT && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--success)18', border: '1px solid var(--success)55', borderRadius: 8, fontSize: '0.85rem', color: 'var(--success)' }}>
              All {TARGET_COUNT} saved for digit {digit}. Click <strong>Done with {digit}</strong> above to return.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Digit selection grid ──────────────────────────────────────────────────────

function DigitGrid({ counts, studentName, onSelectDigit, onChangeName }) {
  const totalComplete = DIGITS.filter(d => counts[d] >= TARGET_COUNT).length
  const allDone = totalComplete === 10

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <div className="page-title" style={{ margin: 0 }}>Choose a digit to draw</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
            {studentName} · {totalComplete}/10 digits complete
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onChangeName}>Change name</button>
      </div>

      {allDone ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎉</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>All done!</div>
          <p style={{ color: 'var(--text-muted)' }}>
            You've drawn all {TARGET_COUNT * 10} digits. Thanks for contributing to the dataset!
          </p>
        </div>
      ) : (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
            Click any digit below to start drawing it. You'll stay on that digit until you click <strong style={{ color: 'var(--text)' }}>Done</strong>.
          </p>
          <div className="digit-progress" data-testid="digit-grid">
            {DIGITS.map(d => {
              const complete = counts[d] >= TARGET_COUNT
              return (
                <button
                  key={d}
                  className={`digit-cell ${complete ? 'complete' : ''}`}
                  onClick={() => !complete && onSelectDigit(d)}
                  style={{
                    background: 'var(--surface)',
                    cursor: complete ? 'default' : 'pointer',
                    opacity: complete ? 0.6 : 1,
                  }}
                  data-testid={`digit-cell-${d}`}
                  title={complete ? `Digit ${d} complete` : `Click to draw digit ${d}`}
                >
                  {d}
                  <span className="count">{counts[d]}/{TARGET_COUNT}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CollectPage() {
  const [profile, setProfile] = useState(null)  // { studentName, className }
  const [activeDigit, setActiveDigit] = useState(null)
  const [counts, setCounts] = useState(Object.fromEntries(DIGITS.map(d => [d, 0])))

  const handleSaved = useCallback((digit) => {
    setCounts(prev => ({ ...prev, [digit]: prev[digit] + 1 }))
  }, [])

  if (!profile) {
    return <ProfileForm onSave={setProfile} />
  }

  if (activeDigit !== null) {
    return (
      <DrawingView
        digit={activeDigit}
        count={counts[activeDigit]}
        studentName={profile.studentName}
        className={profile.className}
        onSaved={handleSaved}
        onDone={() => setActiveDigit(null)}
      />
    )
  }

  return (
    <DigitGrid
      counts={counts}
      studentName={profile.studentName}
      onSelectDigit={setActiveDigit}
      onChangeName={() => setProfile(null)}
    />
  )
}
