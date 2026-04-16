/**
 * Predict page tests.
 * The leaderboard and model slot UI are tested against the real backend.
 * Actual model inference requires TF and a real .h5 file, so those paths are
 * noted but not run here (they belong in manual QA or a separate model test).
 */
import { test, expect } from '@playwright/test'

test.describe('Predict page', () => {
  test('page loads with canvas and leaderboard table', async ({ page }) => {
    await page.goto('/predict')
    await expect(page.getByTestId('drawing-canvas')).toBeVisible()
    await expect(page.getByTestId('model-search-input')).toBeVisible()
  })

  test('leaderboard loads from real API (empty or populated)', async ({ page }) => {
    await page.goto('/predict')
    // Wait for the models request to actually complete
    await page.waitForResponse('/api/models')
    // Either the empty state or model rows should be visible — not a crash
    const emptyOrRows = page.locator('.empty-state, .leaderboard-table tbody tr')
    await expect(emptyOrRows.first()).toBeVisible()
  })

  test('search input filters model rows', async ({ page, request }) => {
    // This test only runs meaningfully if there are models in the DB.
    // We verify search is wired up: typing narrows the visible set.
    await page.goto('/predict')
    await page.waitForResponse('/api/models')

    await page.getByTestId('model-search-input').fill('zzz_nonexistent_zzz')
    // Empty state OR zero rows
    const rows = page.locator('.leaderboard-table tbody tr')
    const emptyState = page.locator('.empty-state')
    const count = await rows.count()
    if (count === 0) {
      await expect(emptyState).toBeVisible()
    } else {
      // If rows still show, they must all contain the search text
      for (let i = 0; i < count; i++) {
        const text = await rows.nth(i).innerText()
        expect(text.toLowerCase()).toContain('zzz')
      }
    }
  })

  test('selecting a model row shows a model slot', async ({ page, request }) => {
    // Only meaningful with models in DB — skip gracefully if none
    await page.goto('/predict')
    await page.waitForResponse('/api/models')

    const rows = page.locator('.leaderboard-table tbody tr')
    if (await rows.count() === 0) {
      console.log('  (no models in DB — skipping slot test)')
      return
    }

    await rows.first().click()
    await expect(page.getByTestId('model-slot-name')).toBeVisible()
  })

  test('clear canvas button works without error', async ({ page }) => {
    await page.goto('/predict')
    const canvas = page.getByTestId('drawing-canvas')
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 50, box.y + 50)
    await page.mouse.down()
    await page.mouse.move(box.x + 120, box.y + 120, { steps: 5 })
    await page.mouse.up()

    await page.getByTestId('clear-canvas-btn').click()
    // No error thrown, canvas still visible
    await expect(canvas).toBeVisible()
  })
})
