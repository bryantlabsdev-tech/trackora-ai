import { test, expect } from '@playwright/test'

const email = process.env.E2E_USER_EMAIL?.trim()
const password = process.env.E2E_USER_PASSWORD?.trim()
const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim() ?? ''
const hasAuth =
  Boolean(email && password) &&
  Boolean(supabaseUrl) &&
  !supabaseUrl.includes('placeholder')

test.describe('Authenticated coaching flow', () => {
  test.skip(!hasAuth, 'Set E2E_USER_EMAIL, E2E_USER_PASSWORD, and real VITE_SUPABASE_* (see docs/STAGING.md)')

  test('sign in and generate a coaching form', async ({ page }) => {
    test.setTimeout(120_000)

    await page.goto('/login')
    await page.locator('#auth-email').fill(email!)
    await page.locator('#auth-password').fill(password!)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    await page.waitForURL(/\/app\/?$/, { timeout: 30_000 })

    // Dismiss tutorial if it appears (staging user should have has_seen_tutorial=true).
    const skipTutorial = page.getByRole('button', { name: /Skip tutorial/i })
    if (await skipTutorial.isVisible().catch(() => false)) {
      await skipTutorial.click()
    }

    const workspaceGate = page.getByRole('dialog', { name: /Choose your coaching workspace/i })
    if (await workspaceGate.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Mobile Sales Coaching' }).click()
    }

    await page.locator('[data-testid="coaching-employee-name"]').fill('E2E Test User')
    await page.locator('[data-testid="coaching-reason"]').fill('Late to shift during E2E test')
    await page.locator('[data-testid="coaching-generate"]').click()

    await expect(page.getByText('Coaching form ready')).toBeVisible({ timeout: 90_000 })
  })
})
