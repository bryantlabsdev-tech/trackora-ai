import { test, expect } from '@playwright/test'

// Interactive demo (requires Chromium). Static HTML checks live in landing-static.spec.ts.
test.describe('Landing demo', () => {
  test('generates a coaching preview from quick example', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Create professional coaching and recognition forms in seconds',
    )

    await page.getByRole('button', { name: 'Late to shift' }).click()
    await page.getByRole('button', { name: 'Generate Coaching Form' }).click()

    await expect(page.getByText('Situation Summary:')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Impact Statement:')).toBeVisible()
    await expect(page.getByText('Expectation Moving Forward:')).toBeVisible()
  })

  test('signup CTA is reachable from header', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Try TrackoraAI Free' })).toHaveAttribute('href', '/signup')
  })
})
