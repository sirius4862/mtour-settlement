export type GuideConfirmRpcPayload = {
  ok?: boolean
  confirmation_id?: string | null
  confirmation_status?: string | null
}

export type GuideConfirmRpcBridgeResult =
  | { mode: 'atomic' }
  | { mode: 'legacy' }
  | { mode: 'error'; error: string }

/** Classify guide_confirm_settlement RPC response for bridge app rollout. */
export function resolveGuideConfirmRpcBridge(
  rpc: GuideConfirmRpcPayload | null | undefined,
  activeConfirmationId: string,
): GuideConfirmRpcBridgeResult {
  if (!rpc || rpc.ok !== true) {
    return { mode: 'error', error: '최종확인 처리에 실패했습니다.' }
  }

  const hasConfirmationId =
    typeof rpc.confirmation_id === 'string' && rpc.confirmation_id.length > 0
  const hasConfirmationStatus =
    typeof rpc.confirmation_status === 'string' && rpc.confirmation_status.length > 0

  if (hasConfirmationId && rpc.confirmation_id !== activeConfirmationId) {
    return {
      mode: 'error',
      error: '최종확인 처리에 실패했습니다. 확인 패킷 ID가 일치하지 않습니다.',
    }
  }

  if (hasConfirmationStatus && rpc.confirmation_status !== 'confirmed') {
    return {
      mode: 'error',
      error: '최종확인 처리에 실패했습니다. 확인 패킷 상태가 올바르지 않습니다.',
    }
  }

  if (
    hasConfirmationId &&
    hasConfirmationStatus &&
    rpc.confirmation_id === activeConfirmationId &&
    rpc.confirmation_status === 'confirmed'
  ) {
    return { mode: 'atomic' }
  }

  return { mode: 'legacy' }
}
