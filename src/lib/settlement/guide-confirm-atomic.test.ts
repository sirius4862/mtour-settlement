import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveGuideConfirmRpcBridge } from '@/lib/settlement/guide-confirm-rpc-bridge'

const ROOT = process.cwd()
const MIGRATION = readFileSync(
  join(ROOT, 'supabase/settlement_workflow_v1_guide_confirm_atomic_rpc.sql'),
  'utf8',
)
const VERIFY = readFileSync(
  join(ROOT, 'supabase/verify_guide_confirm_settlement_atomic.sql'),
  'utf8',
)
const ACTIONS = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')
const CONFIRM_PANEL = readFileSync(
  join(ROOT, 'src/app/guide/settlements/[id]/confirm/ConfirmPanel.tsx'),
  'utf8',
)

function guideConfirmBody(): string {
  const start = ACTIONS.indexOf('export async function guideConfirm')
  const end = ACTIONS.indexOf('export async function guideRequestClarification', start)
  return ACTIONS.slice(start, end)
}

describe('guide_confirm_settlement atomic RPC migration SQL', () => {
  it('defines SECURITY DEFINER guide_confirm_settlement with preserved signature', () => {
    expect(MIGRATION).toContain('CREATE OR REPLACE FUNCTION public.guide_confirm_settlement(')
    expect(MIGRATION).toContain('p_settlement_id uuid')
    expect(MIGRATION).toContain('p_confirmed_at timestamptz DEFAULT now()')
    expect(MIGRATION).toContain('SECURITY DEFINER')
    expect(MIGRATION).toContain('SET search_path = public')
  })

  it('requires guide role and rejects admin tier', () => {
    expect(MIGRATION).toContain('auth_user_is_guide()')
    expect(MIGRATION).toContain('auth_user_is_admin_tier()')
    expect(MIGRATION).toContain('guide role required')
  })

  it('locks settlement FOR UPDATE and validates guide ownership', () => {
    expect(MIGRATION).toContain('FOR UPDATE')
    expect(MIGRATION).toContain('settlement not owned by guide')
    expect(MIGRATION).toContain('guide_id IS DISTINCT FROM auth.uid()')
  })

  it('checks pending_guide_confirmation, paid_at, active_confirmation_id, and pending packet', () => {
    expect(MIGRATION).toContain('pending_guide_confirmation')
    expect(MIGRATION).toContain('paid_at IS NULL')
    expect(MIGRATION).toContain('active_confirmation_id required')
    expect(MIGRATION).toContain('confirmation packet is not pending')
    expect(MIGRATION).toContain('guide confirmation already recorded')
  })

  it('updates settlement flags and confirmation packet in one function', () => {
    expect(MIGRATION).toContain('guide_confirmed_at = p_confirmed_at')
    expect(MIGRATION).toContain('guide_confirmed_by = auth.uid()')
    expect(MIGRATION).toContain('UPDATE public.settlement_confirmations')
    expect(MIGRATION).toContain("status = 'confirmed'")
    expect(MIGRATION).toContain('confirmed_by = auth.uid()')
    expect(MIGRATION).toContain('confirmed_at = p_confirmed_at')
  })

  it('asserts exactly one row updated for settlement and confirmation', () => {
    expect(MIGRATION).toContain('settlement confirm update affected % rows (expected 1)')
    expect(MIGRATION).toContain('confirmation packet update affected % rows (expected 1)')
    expect(MIGRATION).toMatch(/GET DIAGNOSTICS v_rows = ROW_COUNT/g)
  })

  it('returns confirmation_id and confirmation_status in JSON payload', () => {
    expect(MIGRATION).toContain("'confirmation_id', v_active_confirmation_id")
    expect(MIGRATION).toContain("'confirmation_status', 'confirmed'")
    expect(MIGRATION).toContain("'settlement_id', p_settlement_id")
  })

  it('grants execute to authenticated only', () => {
    expect(MIGRATION).toContain(
      'REVOKE ALL ON FUNCTION public.guide_confirm_settlement(uuid, timestamptz) FROM PUBLIC',
    )
    expect(MIGRATION).toContain(
      'GRANT EXECUTE ON FUNCTION public.guide_confirm_settlement(uuid, timestamptz) TO authenticated',
    )
  })
})

describe('verify_guide_confirm_settlement_atomic.sql', () => {
  it('includes read-only function definition spot-check', () => {
    expect(VERIFY).toContain('pg_get_functiondef')
    expect(VERIFY).toContain('guide_confirm_settlement')
    expect(VERIFY).toContain('SECURITY DEFINER')
    expect(VERIFY).toContain('UPDATE public.settlement_confirmations')
  })
})

describe('resolveGuideConfirmRpcBridge', () => {
  const activeId = 'conf-1111-2222-3333-4444-555555555555'

  it('legacy RPC: ok only — app should run settlement_confirmations UPDATE', () => {
    expect(resolveGuideConfirmRpcBridge({ ok: true }, activeId)).toEqual({ mode: 'legacy' })
  })

  it('atomic RPC: ok + matching confirmation_id + confirmed status', () => {
    expect(
      resolveGuideConfirmRpcBridge(
        {
          ok: true,
          confirmation_id: activeId,
          confirmation_status: 'confirmed',
        },
        activeId,
      ),
    ).toEqual({ mode: 'atomic' })
  })

  it('fails when confirmation_id mismatches active_confirmation_id', () => {
    const result = resolveGuideConfirmRpcBridge(
      {
        ok: true,
        confirmation_id: 'other-id',
        confirmation_status: 'confirmed',
      },
      activeId,
    )
    expect(result.mode).toBe('error')
    if (result.mode === 'error') {
      expect(result.error).toContain('패킷 ID')
    }
  })

  it('fails when confirmation_status is present but not confirmed', () => {
    const result = resolveGuideConfirmRpcBridge(
      {
        ok: true,
        confirmation_id: activeId,
        confirmation_status: 'pending',
      },
      activeId,
    )
    expect(result.mode).toBe('error')
    if (result.mode === 'error') {
      expect(result.error).toContain('패킷 상태')
    }
  })

  it('fails when RPC ok is false or payload missing', () => {
    expect(resolveGuideConfirmRpcBridge(null, activeId).mode).toBe('error')
    expect(resolveGuideConfirmRpcBridge({ ok: false }, activeId).mode).toBe('error')
  })

  it('partial atomic fields fall back to legacy path', () => {
    expect(
      resolveGuideConfirmRpcBridge({ ok: true, confirmation_id: activeId }, activeId),
    ).toEqual({ mode: 'legacy' })
    expect(
      resolveGuideConfirmRpcBridge({ ok: true, confirmation_status: 'confirmed' }, activeId),
    ).toEqual({ mode: 'legacy' })
  })
})

describe('guideConfirm app wiring — bridge rollout', () => {
  const body = guideConfirmBody()

  it('routes RPC response through resolveGuideConfirmRpcBridge', () => {
    expect(body).toContain('resolveGuideConfirmRpcBridge')
    expect(body).toContain("bridge.mode === 'legacy'")
  })

  it('legacy path performs settlement_confirmations UPDATE with row-count guard', () => {
    expect(body).toContain('assertSingleOptimisticUpdate(confRows)')
    expect(body).toContain(".eq('status', 'pending')")
  })

  it('atomic path skips legacy UPDATE block', () => {
    expect(body).toMatch(/if \(bridge\.mode === 'legacy'\)/)
  })

  it('still verifies guide_confirmed_at and guide_confirmed_by after RPC', () => {
    expect(body).toContain('guide_confirmed_at, guide_confirmed_by')
    expect(body).toContain('!confirmedRow?.guide_confirmed_by')
  })

  it('read-back fails when confirmation packet is not confirmed', () => {
    expect(body).toContain('confirmedPacket.status !== \'confirmed\'')
    expect(body).toContain('확인 패킷이 확정되지 않았습니다')
  })

  it('still inserts guide_confirm audit event app-side', () => {
    expect(body).toContain("action: 'guide_confirm'")
    expect(body).toContain('insertAuditEvent')
  })
})

describe('ConfirmPanel error handling unchanged', () => {
  it('surfaces server errors and refreshes on success', () => {
    expect(CONFIRM_PANEL).toContain('catch (err)')
    expect(CONFIRM_PANEL).toContain('setError(res.error')
    expect(CONFIRM_PANEL).toContain('router.refresh()')
  })
})
