import { test, expect } from '@playwright/test'

test('API health endpoint', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(body.service).toBe('trackora-api')
})

test('API rejects unauthenticated coaching requests', async ({ request }) => {
  const res = await request.post('/api/ai', {
    data: {
      action: 'coaching_log',
      payload: { employeeName: 'Alex', coachingReason: 'Late', mode: 'coaching' },
    },
  })
  expect(res.status()).toBe(401)
})

test('API rejects invalid checkout body', async ({ request }) => {
  const res = await request.post('/create-checkout-session', {
    data: { userId: 'not-a-uuid' },
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.error).toBeTruthy()
})
