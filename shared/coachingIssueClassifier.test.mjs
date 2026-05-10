import assert from 'node:assert'
import { describe, test } from 'node:test'
import {
  buildCoachingClassRules,
  buildDeterministicCoachingForm,
  classifyIssue,
  leakTestForbiddenTerms,
} from './coachingIssueClassifier.mjs'

function assertTextExcludesAll(haystack, terms) {
  const lower = haystack.toLowerCase()
  for (const t of terms) {
    assert.ok(!lower.includes(t.toLowerCase()), `expected output not to include "${t}"`)
  }
}

describe('classifyIssue', () => {
  test('Left keys unattended → compliance_security', () => {
    assert.equal(classifyIssue('Left keys unattended', 'coaching').primary, 'compliance_security')
  })

  test('Missed accessory offers → performance_sales', () => {
    assert.equal(classifyIssue('Missed accessory offers', 'coaching').primary, 'performance_sales')
  })

  test('Late to shift → attendance', () => {
    assert.equal(classifyIssue('Late to shift', 'coaching').primary, 'attendance')
  })

  test('Late returning from lunch → attendance', () => {
    assert.equal(classifyIssue('Late returning from lunch', 'coaching').primary, 'attendance')
  })
})

describe('grounded deterministic form (no cross-category leakage)', () => {
  test('keys/security issue does not mention sales or goals', () => {
    const text = buildDeterministicCoachingForm({
      employeeName: 'Alex',
      coachingReason: 'Left keys unattended',
      notes: '',
      mode: 'coaching',
    })
    assertTextExcludesAll(text, leakTestForbiddenTerms('compliance_security', 'coaching'))
    assert.match(buildCoachingClassRules('compliance_security', 'coaching'), /Compliance/i)
  })

  test('accessory / offers issue does not mention security / keys', () => {
    const text = buildDeterministicCoachingForm({
      employeeName: 'Alex',
      coachingReason: 'Missed accessory offers',
      notes: '',
      mode: 'coaching',
    })
    assertTextExcludesAll(text, leakTestForbiddenTerms('performance_sales', 'coaching'))
  })

  test('Late to shift does not inject sales language', () => {
    const text = buildDeterministicCoachingForm({
      employeeName: 'Alex',
      coachingReason: 'Late to shift',
      notes: '',
      mode: 'coaching',
    })
    assertTextExcludesAll(text, [
      'below goal',
      'customer engagement',
      'accessory',
      'closing',
      'missed sales',
      'store behind',
    ])
  })

  test('reminder notes → soft break coaching without disciplinary phrasing', () => {
    const text = buildDeterministicCoachingForm({
      employeeName: 'Leeann',
      coachingReason: '2 fifteen-minute breaks on the clock + 30-minute lunch clocked out',
      notes: 'this is just a reminder',
      mode: 'coaching',
    })
    assert.match(text, /Leeann/i)
    assert.match(text, /Attendance.*Break Reminder/i)
    assertTextExcludesAll(text, [
      'compliance',
      'policy violation',
      'disrupt productivity',
      'expect to see',
      'I expect',
      'we expect',
      'moving forward',
      'maintain team coverage',
      'consistent rhythm on the floor',
      'monitor this lightly',
    ])
  })
})

describe('prompt constraint strings', () => {
  test('performance topic guide mentions sales execution', () => {
    assert.match(buildCoachingClassRules('performance_sales', 'coaching'), /sales execution/i)
  })
})
