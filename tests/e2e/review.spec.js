/**
 * Review / admin tests — real integration tests.
 * Requires the backend running at localhost:8000.
 */
import { test, expect } from '@playwright/test'

const TEST_CLASS = '__PW_TEST__'
const ADMIN_PW = process.env.ADMIN_PASSWORD || 'changeme'
const BACKEND = 'http://localhost:8000'

// Helper: submit a digit directly via API (faster than drawing in UI each time)
async function apiSubmitDigit(request, label = 0) {
  // Create a minimal 1x1 black PNG
  const PNG_1x1 = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b550000000a4944415408d76360000000020001e221bc330000000049454e44ae426082',
    'hex'
  )
  const form = new FormData()
  form.append('label', String(label))
  form.append('student_name', 'API Test Student')
  form.append('class_name', TEST_CLASS)
  form.append('image', new Blob([PNG_1x1], { type: 'image/png' }), 'digit.png')
  return request.post('/api/digits', { multipart: form })
}

async function apiDeleteDigit(request, id) {
  return request.delete(`/api/digits/${id}?x_admin_password=${encodeURIComponent(ADMIN_PW)}`)
}

test.describe('Review page — public', () => {
  test('histogram and stats load from real API', async ({ page }) => {
    await page.goto('/review')
    await expect(page.locator('.histogram')).toBeVisible()
    // Stats card should show numeric counts
    await expect(page.getByText(/\d+ total/)).toBeVisible()
    await expect(page.getByText(/\d+ training/)).toBeVisible()
    await expect(page.getByText(/\d+ validation/)).toBeVisible()
  })

  test('class filter dropdown is present', async ({ page }) => {
    await page.goto('/review')
    await expect(page.getByTestId('class-filter')).toBeVisible()
  })

  test('label filter dropdown is present', async ({ page }) => {
    await page.goto('/review')
    await expect(page.getByTestId('label-filter')).toBeVisible()
  })

  test('set filter dropdown is present', async ({ page }) => {
    await page.goto('/review')
    await expect(page.getByTestId('set-filter')).toBeVisible()
  })

  test('no delete buttons visible for public users', async ({ page }) => {
    await page.goto('/review')
    await expect(page.locator('.delete-btn')).toHaveCount(0)
  })

  test('images are not clickable for public users (no pointer cursor)', async ({ page, request }) => {
    const res = await apiSubmitDigit(request, 0)
    const { id } = await res.json()

    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/digits') && !r.url().includes('stats') && !r.url().includes('download'), { timeout: 4000 }),
      page.goto('/review'),
    ])
    const img = page.getByTestId(`digit-item-${id}`).locator('img')
    const cursor = await img.evaluate(el => getComputedStyle(el).cursor)
    expect(cursor).not.toBe('pointer')

    await apiDeleteDigit(request, id)
  })

  test('download button links to correct endpoint', async ({ page }) => {
    await page.goto('/review')
    await expect(page.getByTestId('download-btn')).toBeVisible()
    await expect(page.getByTestId('download-btn')).toHaveAttribute('href', '/api/digits/download')
  })

  test('download link updates when class filter is applied', async ({ page }) => {
    await page.goto('/review')
    // Wait for stats to load so class_names is populated
    await page.waitForResponse('/api/digits/stats')
    const select = page.getByTestId('class-filter')
    const options = await select.locator('option').allTextContents()
    const realClass = options.find(o => o === TEST_CLASS)
    if (realClass) {
      await select.selectOption(TEST_CLASS)
      await expect(page.getByTestId('download-btn')).toHaveAttribute(
        'href',
        `/api/digits/download?class_name=${encodeURIComponent(TEST_CLASS)}`
      )
    }
  })

  test('submitted digit appears in grid', async ({ page, request }) => {
    const res = await apiSubmitDigit(request, 7)
    expect(res.ok()).toBeTruthy()
    const { id } = await res.json()

    // Race goto with the digits response so we don't miss it
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/digits') && !r.url().includes('stats') && !r.url().includes('download'), { timeout: 4000 }),
      page.goto('/review'),
    ])
    await expect(page.getByTestId(`digit-item-${id}`)).toBeVisible()

    // Cleanup
    await apiDeleteDigit(request, id)
  })

  test('validation image has VAL badge, training image does not', async ({ page, request }) => {
    // Submit 5 digits; the 5th will be auto-flagged as validation
    const ids = []
    for (let i = 0; i < 5; i++) {
      const r = await apiSubmitDigit(request, 9)
      ids.push((await r.json()).id)
    }

    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/digits') && !r.url().includes('stats') && !r.url().includes('download'), { timeout: 4000 }),
      page.goto('/review'),
    ])

    const valItem = page.getByTestId(`digit-item-${ids[4]}`)
    await expect(valItem.getByText('VAL')).toBeVisible()

    const trainItem = page.getByTestId(`digit-item-${ids[0]}`)
    await expect(trainItem.getByText('VAL')).not.toBeVisible()

    // Cleanup
    for (const id of ids) await apiDeleteDigit(request, id)
  })
})

test.describe('Admin page', () => {
  test('shows login form', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByTestId('admin-password-input')).toBeVisible()
    await expect(page.getByTestId('admin-login-btn')).toBeVisible()
  })

  test('wrong password shows error, not JSON crash', async ({ page }) => {
    await page.goto('/admin')
    await page.getByTestId('admin-password-input').fill('wrongpassword')
    await page.getByTestId('admin-login-btn').click()
    const err = page.getByText('Wrong password.')
    await expect(err).toBeVisible()
  })

  test('correct password logs in and shows admin interface', async ({ page }) => {
    await page.goto('/admin')
    await page.getByTestId('admin-password-input').fill(ADMIN_PW)
    await page.getByTestId('admin-login-btn').click()
    await expect(page.getByText('Admin mode active')).toBeVisible()
  })

  test('delete button removes digit from grid and from API', async ({ page, request }) => {
    const res = await apiSubmitDigit(request, 3)
    const { id } = await res.json()

    await page.goto('/admin')
    await page.getByTestId('admin-password-input').fill(ADMIN_PW)
    // Login triggers ReviewPage mount which fires the digits request — race them
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/digits') && !r.url().includes('stats') && !r.url().includes('download'), { timeout: 4000 }),
      page.getByTestId('admin-login-btn').click(),
    ])
    await page.waitForSelector('[data-testid="review-grid"], .empty-state', { timeout: 4000 })

    await page.getByTestId(`digit-item-${id}`).hover()
    await page.getByTestId(`delete-btn-${id}`).click()

    // Gone from the UI
    await expect(page.getByTestId(`digit-item-${id}`)).not.toBeVisible()

    // Also gone from the real API
    const check = await request.get(`/api/digits`)
    const digits = await check.json()
    expect(digits.find(d => d.id === id)).toBeUndefined()
  })

  test('val toggle changes validation status in API', async ({ page, request }) => {
    const res = await apiSubmitDigit(request, 6)
    const { id, is_validation: startVal } = await res.json()
    // This should be training (is_validation=false) since it's a fresh submit
    expect(startVal).toBe(false)

    await page.goto('/admin')
    await page.getByTestId('admin-password-input').fill(ADMIN_PW)
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/digits') && !r.url().includes('stats') && !r.url().includes('download'), { timeout: 4000 }),
      page.getByTestId('admin-login-btn').click(),
    ])
    await page.waitForSelector('[data-testid="review-grid"], .empty-state', { timeout: 4000 })

    // Click the image itself to toggle validation
    await page.getByTestId(`digit-item-${id}`).click()

    // VAL badge should appear
    await expect(page.getByTestId(`digit-item-${id}`).getByText('VAL')).toBeVisible()

    // Verify the real API has it flagged
    const check = await request.get('/api/digits')
    const digits = await check.json()
    const updated = digits.find(d => d.id === id)
    expect(updated?.is_validation).toBe(true)

    // Cleanup
    await apiDeleteDigit(request, id)
  })

  test('logout returns to login form', async ({ page }) => {
    await page.goto('/admin')
    await page.getByTestId('admin-password-input').fill(ADMIN_PW)
    await page.getByTestId('admin-login-btn').click()
    await expect(page.getByText('Admin mode active')).toBeVisible()
    await page.getByText('Logout').click()
    await expect(page.getByTestId('admin-password-input')).toBeVisible()
  })

  test('manage classes: add and delete a class', async ({ page }) => {
    await page.goto('/admin')
    await page.getByTestId('admin-password-input').fill(ADMIN_PW)
    await page.getByTestId('admin-login-btn').click()
    await page.getByTestId('manage-classes-btn').click()

    const uniqueName = `TestClass_${Date.now()}`
    await page.getByTestId('new-class-input').fill(uniqueName)
    await page.getByTestId('add-class-btn').click()

    // New class visible in modal
    await expect(page.getByText(uniqueName)).toBeVisible()

    // Find its delete button and remove it
    const classItem = page.locator('[data-testid^="class-item-"]').filter({ hasText: uniqueName })
    const itemId = await classItem.getAttribute('data-testid').then(s => s.replace('class-item-', ''))
    await page.getByTestId(`delete-class-${itemId}`).click()
    await expect(page.getByText(uniqueName)).not.toBeVisible()
  })
})

test.describe('Submit model page', () => {
  test('shows all form fields', async ({ page }) => {
    await page.goto('/submit')
    await expect(page.getByTestId('student-name-input')).toBeVisible()
    await expect(page.getByTestId('submission-name-input')).toBeVisible()
    await expect(page.getByTestId('model-file-input')).toBeVisible()
    await expect(page.getByTestId('submit-model-btn')).toBeVisible()
  })

  test('rejects wrong file type with readable error, not JSON crash', async ({ page }) => {
    await page.goto('/submit')
    await page.getByTestId('student-name-input').fill('Alice')
    await page.getByTestId('submission-name-input').fill('TestModel')
    await page.getByTestId('model-file-input').setInputFiles({
      name: 'model.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not a model'),
    })
    await page.getByTestId('submit-model-btn').click()
    const err = page.getByText('Only .h5 or .keras files are accepted.')
    await expect(err).toBeVisible()
    // Must not be a raw JSON/syntax error
    await expect(page.getByText('JSON')).not.toBeVisible()
  })
})

test.describe('Navigation', () => {
  test('all nav links are present and reachable', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Collect Data' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Submit Model' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Live Predict' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Data Review' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Instructions' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible()
  })

  test('instructions page renders content', async ({ page }) => {
    await page.goto('/instructions')
    await expect(page.getByText('Part 1 — Collect Data')).toBeVisible()
    await expect(page.getByText('Part 3 — Export Your Model')).toBeVisible()
  })
})
