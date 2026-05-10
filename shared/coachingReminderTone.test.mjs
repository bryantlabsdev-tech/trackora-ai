import assert from 'node:assert'
import { describe, test } from 'node:test'
import { isLightReminderCoaching, stripToneOnlyNotes } from './coachingReminderTone.mjs'

describe('isLightReminderCoaching', () => {
  test('detects phrases in notes', () => {
    assert.equal(isLightReminderCoaching('This is just a reminder', ''), true)
    assert.equal(isLightReminderCoaching('Friendly reminder about breaks', ''), true)
    assert.equal(isLightReminderCoaching('not a write-up', ''), true)
    assert.equal(isLightReminderCoaching('not a write up', ''), true)
    assert.equal(isLightReminderCoaching('light coaching only', ''), true)
    assert.equal(isLightReminderCoaching('verbal reminder', ''), true)
    assert.equal(isLightReminderCoaching('not serious', ''), true)
    assert.equal(isLightReminderCoaching('no break schedule here', ''), true)
  })

  test('detects phrases in coachingReason', () => {
    assert.equal(isLightReminderCoaching('', 'Late — friendly reminder'), true)
  })

  test('returns false when absent', () => {
    assert.equal(isLightReminderCoaching('Please document', 'Late to shift'), false)
  })
})

describe('stripToneOnlyNotes', () => {
  test('removes meta-only reminder lines', () => {
    assert.equal(stripToneOnlyNotes('this is just a reminder'), '')
    assert.equal(stripToneOnlyNotes('Not a write-up.'), '')
    assert.equal(stripToneOnlyNotes('not serious'), '')
  })

  test('keeps substantive notes', () => {
    assert.equal(stripToneOnlyNotes('First occurrence only'), 'First occurrence only')
  })
})
