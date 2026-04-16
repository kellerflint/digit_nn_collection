const BACKEND = 'http://localhost:8000'
const ADMIN_PW = process.env.ADMIN_PASSWORD || 'changeme'
const TEST_CLASS = '__PW_TEST__'

export default async function globalTeardown() {
  // Delete all digit images uploaded under the test class
  try {
    const res = await fetch(
      `${BACKEND}/api/digits?class_name=${encodeURIComponent(TEST_CLASS)}`
    )
    if (res.ok) {
      const digits = await res.json()
      for (const d of digits) {
        await fetch(
          `${BACKEND}/api/digits/${d.id}?x_admin_password=${encodeURIComponent(ADMIN_PW)}`,
          { method: 'DELETE' }
        )
      }
      if (digits.length) console.log(`[teardown] Deleted ${digits.length} test digit(s)`)
    }
  } catch (e) {
    console.warn('[teardown] Could not clean up test digits:', e.message)
  }

  // Delete the test class itself
  try {
    const classRes = await fetch(`${BACKEND}/api/classes`)
    if (classRes.ok) {
      const classes = await classRes.json()
      const tc = classes.find(c => c.name === TEST_CLASS)
      if (tc) {
        await fetch(
          `${BACKEND}/api/classes/${tc.id}?x_admin_password=${encodeURIComponent(ADMIN_PW)}`,
          { method: 'DELETE' }
        )
        console.log(`[teardown] Deleted test class: ${TEST_CLASS}`)
      }
    }
  } catch (e) {
    console.warn('[teardown] Could not clean up test class:', e.message)
  }
}
