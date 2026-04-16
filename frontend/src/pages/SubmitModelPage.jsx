import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errorDetail } from '../api.js'

export default function SubmitModelPage() {
  const [submissionName, setSubmissionName] = useState('')
  const [studentName, setStudentName] = useState('')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) { setError('Select a model file first.'); return }
    const name = file.name.toLowerCase()
    if (!name.endsWith('.h5') && !name.endsWith('.keras')) {
      setError('Only .h5 or .keras files are accepted.')
      return
    }

    setSubmitting(true)
    setError('')
    setResult(null)

    try {
      const fd = new FormData()
      fd.append('submission_name', submissionName.trim())
      fd.append('student_name', studentName.trim())
      fd.append('model', file)

      const res = await fetch('/api/models', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await errorDetail(res, 'Upload failed'))
      const data = await res.json()
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div className="page-title">Submit Your Model</div>

      <div className="split-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.2rem', fontSize: '0.9rem' }}>
              Upload your trained Keras model (.h5 or .keras). It will be evaluated against the
              class dataset and your accuracy will appear on the leaderboard.
              See the <Link to="/instructions">instructions page</Link> for how to export.
            </p>

            {error && <div className="alert alert-error">{error}</div>}
            {result && (
              <div className="alert alert-success">
                Submitted! Accuracy on current dataset:{' '}
                <strong>
                  {result.accuracy != null ? `${(result.accuracy * 100).toFixed(1)}%` : 'N/A (no data yet)'}
                </strong>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-row">
                <div className="form-group">
                  <label>Your name</label>
                  <input
                    value={studentName}
                    onChange={e => setStudentName(e.target.value)}
                    placeholder="e.g. Alex Smith"
                    required
                    data-testid="student-name-input"
                  />
                </div>
                <div className="form-group">
                  <label>Submission name</label>
                  <input
                    value={submissionName}
                    onChange={e => setSubmissionName(e.target.value)}
                    placeholder="e.g. MyBestModel"
                    required
                    data-testid="submission-name-input"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Model file (.h5 or .keras)</label>
                <input
                  type="file"
                  accept=".h5,.keras"
                  onChange={e => setFile(e.target.files[0] || null)}
                  required
                  data-testid="model-file-input"
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
                data-testid="submit-model-btn"
              >
                {submitting ? <><span className="spinner" style={{ marginRight: '0.5rem' }} />Evaluating…</> : 'Submit Model'}
              </button>
            </form>
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Requirements</div>
          <ul style={{ color: 'var(--text-muted)', fontSize: '0.88rem', paddingLeft: '1.2rem', lineHeight: 1.8 }}>
            <li>Format: <strong style={{ color: 'var(--text)' }}>.h5</strong> or <strong style={{ color: 'var(--text)' }}>.keras</strong></li>
            <li>Input: 28×28 grayscale images, pixel values 0.0–1.0</li>
            <li>Output: 10 class scores (digits 0–9)</li>
            <li>
              Supported input shapes:
              <code style={{ background: 'var(--surface2)', padding: '0 4px', borderRadius: 4, marginLeft: 4 }}>(None, 28, 28, 1)</code>,{' '}
              <code style={{ background: 'var(--surface2)', padding: '0 4px', borderRadius: 4 }}>(None, 784)</code>
            </li>
          </ul>
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <Link to="/instructions" className="btn btn-ghost btn-sm">View full instructions →</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
