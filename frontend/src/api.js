/**
 * Parse the detail message from a failed response.
 * Handles cases where the body is HTML (proxy error, backend down) or empty.
 */
export async function errorDetail(res, fallback = 'Request failed') {
  try {
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      const body = await res.json()
      return body.detail || body.message || fallback
    }
  } catch {}
  return `${fallback} (HTTP ${res.status})`
}
