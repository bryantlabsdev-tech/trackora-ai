import { test, expect } from '@playwright/test'

// Interactive demo (requires Chromium). Static HTML checks live in landing-static.spec.ts.
test.describe('Landing demo', () => {
  test('generates a coaching preview from quick example', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Professional Coaching Forms',
    )

    await page.getByRole('button', { name: 'Late to shift' }).click()
    await page.getByRole('button', { name: 'Generate Coaching Form' }).click()

    await expect(page.getByRole('heading', { name: 'Situation', level: 3 })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('heading', { name: 'Impact', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Next Steps', level: 3 })).toBeVisible()
    await expect(page.getByText(/Generated in \d/)).toBeVisible()
  })

  test('signup CTA is reachable from header', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Start Free' }).first()).toHaveAttribute('href', '/signup')
  })

  test('ad landing route is demo-first with UTM passthrough', async ({ page }) => {
    await page.goto('/landing?utm_source=test&utm_campaign=demo')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Professional Coaching Forms')
    await expect(page.getByRole('button', { name: 'Try Free Demo' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Start Free' }).first()).toHaveAttribute(
      'href',
      /\/signup\?utm_source=test/,
    )

    await page.getByRole('button', { name: 'Late to shift' }).click()
    await page.getByRole('button', { name: 'Generate Coaching Form' }).click()
    await expect(page.getByRole('heading', { name: 'Situation', level: 3 })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('link', { name: /Start Free — keep generating/i })).toBeVisible()
  })

  test('hero Try Free Demo CTA is above the fold', async ({ page }) => {
    await page.goto('/')
    const cta = page.getByRole('button', { name: 'Try Free Demo' })
    await expect(cta).toBeVisible()
    const box = await cta.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y + box!.height).toBeLessThan(800)
  })

  test('social proof is visible on landing', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByLabel('What leaders say')).toBeVisible()
  })

  test('workplace demo example generates coaching preview', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Missed deadline' }).click()
    await page.getByRole('button', { name: 'Generate Coaching Form' }).click()
    await expect(page.getByRole('heading', { name: 'Situation', level: 3 })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/project deadline/i)).toBeVisible()
  })

  test('coaching workspace modes are shown on landing', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByLabel('Coaching workspaces')).toBeVisible()
    await expect(page.getByText('General Workplace Coaching')).toBeVisible()
    await expect(page.getByText('Mobile Sales Coaching')).toBeVisible()
  })
})
