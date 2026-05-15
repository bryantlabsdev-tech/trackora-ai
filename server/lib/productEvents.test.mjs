import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { trackCoachingGenerated } from './productEvents.mjs'

describe('trackCoachingGenerated', () => {
  it('no-ops for tutorial runs', () => {
    assert.doesNotThrow(() => trackCoachingGenerated('user-1', { source: 'openai' }, true))
  })

  it('no-ops without user id', () => {
    assert.doesNotThrow(() => trackCoachingGenerated(null, { source: 'openai' }, false))
  })
})
