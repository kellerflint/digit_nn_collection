import { chromium } from '@playwright/test'

const BACKEND = 'http://localhost:8000'
const ADMIN_PW = process.env.ADMIN_PASSWORD || 'changeme'
export const TEST_CLASS = '__PW_TEST__'

async function waitForBackend(retries = 6, delayMs = 300) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BACKEND}/api/health`)
      if (res.ok) return
    } catch {}
    await new Promise(r => setTimeout(r, delayMs))
  }
  throw new Error(
    `Backend not reachable at ${BACKEND}.\n` +
    `Start it with:\n  cd backend && uvicorn main:app --reload\n` +
    `or:\n  docker compose up backend`
  )
}

export default async function globalSetup() {
  console.log('\n[setup] Checking backend is up…')
  await waitForBackend()
  console.log('[setup] Backend OK')

  // Create the test class (idempotent — ignore 409 conflict)
  const fd = new FormData()
  fd.append('name', TEST_CLASS)
  const res = await fetch(
    `${BACKEND}/api/classes?x_admin_password=${encodeURIComponent(ADMIN_PW)}`,
    { method: 'POST', body: fd }
  )
  if (res.ok) {
    console.log(`[setup] Created test class: ${TEST_CLASS}`)
  } else if (res.status === 409) {
    console.log(`[setup] Test class already exists: ${TEST_CLASS}`)
  } else {
    const body = await res.text()
    throw new Error(`Failed to create test class: ${res.status} ${body}`)
  }
}
