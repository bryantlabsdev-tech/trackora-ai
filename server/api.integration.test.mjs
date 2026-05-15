import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app } from './index.mjs'

describe('HTTP API (integration)', () => {
  it('GET /api/health', async () => {
    const res = await request(app).get('/api/health').expect(200)
    assert.equal(res.body.ok, true)
    assert.equal(res.body.service, 'trackora-api')
  })

  it('POST /api/ai without auth returns 401', async () => {
    await request(app)
      .post('/api/ai')
      .send({
        action: 'coaching_log',
        payload: { employeeName: 'A', coachingReason: 'B', mode: 'coaching' },
      })
      .expect(401)
  })

  it('POST /create-checkout-session rejects invalid userId', async () => {
    const res = await request(app)
      .post('/create-checkout-session')
      .send({ userId: 'bad', email: 'a@example.com' })
      .expect(400)
    assert.ok(res.body.error)
  })
})
