import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatSubmitFlowActionLog,
  logSaveDebugTimings,
  logSubmitFlowAction,
} from './submit-flow-diagnostics'
import type { SaveDebugTimings } from './save-timing-debug'

const SAMPLE_DEBUG: SaveDebugTimings = {
  stepSumMs: 1200,
  effectiveStepSumMs: 1200,
  overlappedStepMs: 0,
  totalMs: 1200,
  totalRequests: 12,
  steps: [{ step: 'load_post_save_full', ms: 400 }],
}

describe('submit-flow-diagnostics', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('formats settlement-form-action logs as single-line JSON', () => {
    const line = formatSubmitFlowActionLog({
      action: 'save_only',
      settlementId: '00000000-0000-4000-8000-000000000001',
      debugTimings: SAMPLE_DEBUG,
    })
    expect(line.startsWith('[settlement-form-action] ')).toBe(true)
    const parsed = JSON.parse(line.replace('[settlement-form-action] ', ''))
    expect(parsed.action).toBe('save_only')
    expect(parsed.debugTimings.totalMs).toBe(1200)
    expect(line).not.toContain('password')
    expect(line).not.toContain('token')
  })

  it('logs JSON-serializable diagnostics for automation capture', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logSaveDebugTimings('save_only', SAMPLE_DEBUG, {
      settlementId: '00000000-0000-4000-8000-000000000001',
    })
    expect(spy).toHaveBeenCalledTimes(1)
    const [message] = spy.mock.calls[0] as [string]
    expect(message).toContain('[settlement-form-action]')
    expect(message).toContain('"debugTimings"')
    expect(message).not.toContain('[object Object]')
  })

  it('does not log when debugTimings are absent', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logSaveDebugTimings('save_only', undefined)
    expect(spy).not.toHaveBeenCalled()
    logSubmitFlowAction({ action: 'save_only', error: 'save failed' })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
