import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  checkMigrationRequestAuth,
  migrationRoutesEnabled,
  resolveMigrationAuthKey,
} from './migration-auth'

describe('migration-auth', () => {
  const original = process.env.MIGRATION_RUN_KEY

  beforeEach(() => {
    process.env.MIGRATION_RUN_KEY = 'test-migration-secret'
  })

  afterEach(() => {
    process.env.MIGRATION_RUN_KEY = original
  })

  it('requires dedicated MIGRATION_RUN_KEY', () => {
    expect(resolveMigrationAuthKey()).toBe('test-migration-secret')
    expect(migrationRoutesEnabled()).toBe(true)
  })

  it('rejects requests without matching key', () => {
    const request = new Request('http://localhost/api/internal/apply-settlement-schema-migrations')
    expect(checkMigrationRequestAuth(request)).toBe(false)
  })

  it('accepts x-migration-key header', () => {
    const request = new Request('http://localhost/api/internal/apply-settlement-schema-migrations', {
      headers: { 'x-migration-key': 'test-migration-secret' },
    })
    expect(checkMigrationRequestAuth(request)).toBe(true)
  })

  it('disables routes when MIGRATION_RUN_KEY is unset', () => {
    delete process.env.MIGRATION_RUN_KEY
    expect(migrationRoutesEnabled()).toBe(false)
    expect(resolveMigrationAuthKey()).toBeNull()
  })
})
