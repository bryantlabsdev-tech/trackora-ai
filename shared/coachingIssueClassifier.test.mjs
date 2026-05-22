import assert from 'node:assert'
import { describe, test } from 'node:test'
import {
  buildCoachingClassRules,
  buildDeterministicCoachingForm,
  classifyIssue,
  classifyIssueWithConfidence,
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

  test('High HPA text routes to performance_sales', () => {
    assert.equal(
      classifyIssue('HPA 7.8 with low postpaid output for hours worked', 'coaching').primary,
      'performance_sales',
    )
  })

  test('Productivity text avoids attendance leakage', () => {
    assert.equal(classifyIssue('Productivity expectations each shift', 'coaching').primary, 'unspecified')
  })
})

describe('classifyIssueWithConfidence', () => {
  test('returns low-confidence unspecified for ambiguous workplace behavior text', () => {
    const out = classifyIssueWithConfidence('Workplace communication and teamwork updates were unclear', 'coaching')
    assert.equal(out.primary, 'unspecified')
    assert.ok(out.confidence >= 0)
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

  test('high HPA deterministic coaching stays opportunity/conversion focused by default', () => {
    const text = buildDeterministicCoachingForm({
      employeeName: 'Alex',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
      coachingReason: 'HPA 8.2 low postpaid production',
      notes: 'Not enough postpaid opportunities created each shift',
      mode: 'coaching',
    })
    assert.match(text, /postpaid/i)
    assert.match(text, /activations for hours worked|carrier options|discovery|conversion|opportunit/i)
    assertTextExcludesAll(text, [
      'slow setup',
      'paperwork delays',
      'long customer wait times',
      'taking too long during the activation process',
      'lead qualification',
      'workflow optimization',
      'streamline operations',
      'process efficiency',
      'improving conversion habits',
      'streamline your process',
      'between postpaid activations',
      'activation flow',
      'closing sales',
    ])
    const nextStepsMatch = text.match(/Next Steps:\n([\s\S]*?)\n\nManager Follow-Up:/)
    assert.ok(nextStepsMatch, 'Expected Next Steps section')
    const bulletCount = (nextStepsMatch?.[1].match(/^• /gm) || []).length
    assert.ok(bulletCount >= 4 && bulletCount <= 5, `Expected 4-5 bullets, got ${bulletCount}`)
  })

  test('single APS metric uses opportunity-creation category flavor', () => {
    const text = buildDeterministicCoachingForm({
      employeeName: 'Alex',
      coachingWorkspace: 'mobile_sales',
      coachingType: 'mobile_expert',
      role: 'ME',
      coachingReason: 'APS 2.4 below target',
      notes: 'Low customer engagement in electronics traffic',
      mode: 'coaching',
    })
    assert.match(text, /Customer Engagement & Opportunity Creation/i)
    assert.doesNotMatch(text, /goal is 3\.5|vs >= 3\.5|increase attempts|\bport\b|\bports\b|port opportunities/i)
  })
})

describe('prompt constraint strings', () => {
  test('performance topic guide mentions sales execution', () => {
    assert.match(buildCoachingClassRules('performance_sales', 'coaching'), /sales execution/i)
  })
})
