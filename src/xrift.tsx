import { Interactable, useInstanceState } from '@xrift/world-components'
import { StandMirror, type MirrorMode, type StandMirrorProps } from './mirror/StandMirror'

/**
 * XRiftアダプタ — @xrift/world-components への依存はこのファイルだけに隔離する。
 * ミラー本体（mirror/ 配下）は three + React Three Fiber のみで完結しており、
 * ここで XRift 固有の2つを注入する:
 * - useInstanceState: モードのインスタンス同期（全員に同じ見え方）
 * - Interactable: VRコントローラ/デスクトップ両対応のスイッチ操作
 *
 * XRiftワールドからは `xrift-mirror/xrift` を import する:
 *   import { XRiftStandMirror } from 'xrift-mirror/xrift'
 *   <XRiftStandMirror position={[0, 0, -3]} width={2} height={2.5} />
 */

export type XRiftStandMirrorProps = Omit<
  StandMirrorProps,
  'mode' | 'onModeChange' | 'renderInteract' | 'id'
> & {
  /** 同期キー兼ボタンidの名前空間。複数設置時は一意にする */
  syncId?: string
}

export const XRiftStandMirror = ({
  syncId = 'xrift-mirror',
  defaultMode = 'off',
  ...rest
}: XRiftStandMirrorProps) => {
  const [mode, setMode] = useInstanceState<MirrorMode>(`${syncId}:mode`, defaultMode)
  return (
    <StandMirror
      {...rest}
      id={syncId}
      mode={mode ?? defaultMode}
      onModeChange={setMode}
      renderInteract={(node, { id, text, onInteract }) => (
        <Interactable id={id} onInteract={onInteract} interactionText={`${text}（全員に反映）`}>
          {node}
        </Interactable>
      )}
    />
  )
}
