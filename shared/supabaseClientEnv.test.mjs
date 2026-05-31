import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectMisconfiguredSupabaseEnvKeys,
  resolveSupabaseClientEnv,
  validateSupabaseProjectUrl,
} from './supabaseClientEnv.mjs'

describe('supabaseClientEnv', () => {
  it('accepts a valid supabase project URL', () => {
    const r = validateSupabaseProjectUrl('https://abcxyz.supabase.co')
    assert.equal(r.valid, true)
    assert.equal(r.hostname, 'abcxyz.supabase.co')
  })

  it('rejects placeholder hostnames', () => {
    const r = validateSupabaseProjectUrl('https://placeholder.supabase.co')
    assert.equal(r.valid, false)
  })

  it('rejects template YOUR_PROJECT URLs', () => {
    const r = validateSupabaseProjectUrl('https://YOUR_STAGING_PROJECT.supabase.co')
    assert.equal(r.valid, false)
  })

  it('warns when only server SUPABASE_URL is set', () => {
    const hints = detectMisconfiguredSupabaseEnvKeys({
      SUPABASE_URL: 'https://real.supabase.co',
    })
    assert.ok(hints.some((h) => h.includes('VITE_SUPABASE_URL')))
  })

  it('resolves ok with publishable key name', () => {
    const r = resolveSupabaseClientEnv({
      VITE_SUPABASE_URL: 'https://abcxyz.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
    })
    assert.equal(r.ok, true)
    assert.equal(r.hostname, 'abcxyz.supabase.co')
  })

  it('accepts VITE_SUPABASE_ANON_KEY as alias', () => {
    const r = resolveSupabaseClientEnv({
      VITE_SUPABASE_URL: 'https://abcxyz.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
    })
    assert.equal(r.ok, true)
  })
})
