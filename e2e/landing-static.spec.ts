import { test, expect } from '@playwright/test'

/** Serves built SPA shell from Express — no browser required (CI-safe). */
test('index.html is served with Trackora SPA shell', async ({ request }) => {
  const res = await request.get('/')
  expect(res.ok()).toBeTruthy()
  const html = await res.text()
  expect(html).toContain('id="root"')
  expect(html).toMatch(/Trackora/i)
  expect(html).toMatch(/assets\/index-.*\.js/)
})

test('login and signup routes return SPA shell', async ({ request }) => {
  for (const path of ['/login', '/signup']) {
    const res = await request.get(path)
    expect(res.ok()).toBeTruthy()
    const html = await res.text()
    expect(html).toContain('id="root"')
  }
})
