import { Interactable, useInstanceState } from '@xrift/world-components'
import { StandMirror, type MirrorMode, type StandMirrorProps } from './mirror/StandMirror'

/**
 * XRiftアダプタ — @xrift/world-components への依存はこのファイルだけに隔離する。
 * ミラー本体（mirror/ 配下）は three + React Three Fiber のみで完結しており、
 * ここで XRift 固有の Interactable（VRコントローラ/デスクトップ両対応の操作）を注入する。
 *
 * モードは既定で**操作者ローカル**（toming裁定 2026-07-14）＝スイッチを押した人の
 * 見え方だけが変わる。鏡は見る人のための道具なので、他人が消したら自分も消える
 * 同期はお節介になりがち。`sync` を付けたときだけ useInstanceState で全員同期する
 * （VRChatのミラースイッチ流儀）。
 *
 * XRiftワールドからは `xrift-mirror/xrift` を import する:
 *   import { XRiftStandMirror } from 'xrift-mirror/xrift'
 *   <XRiftStandMirror position={[0, 0, -3]} width={2} height={2.5} />
 */

export type XRiftStandMirrorProps = Omit<
  StandMirrorProps,
  'mode' | 'onModeChange' | 'renderInteract' | 'id'
> & {
  /** ボタンid（と sync 時の同期キー）の名前空間。複数設置時は一意にする */
  syncId?: string
  /** true でモードを全員に同期する。既定 false＝操作者ローカル */
  sync?: boolean
}

export const XRiftStandMirror = ({ sync = false, ...props }: XRiftStandMirrorProps) =>
  sync ? <SyncedStandMirror {...props} /> : <LocalStandMirror {...props} />

/** 操作者ローカル版（既定）: モードは StandMirror の内部state */
const LocalStandMirror = ({
  syncId = 'xrift-mirror',
  ...rest
}: Omit<XRiftStandMirrorProps, 'sync'>) => (
  <StandMirror
    {...rest}
    id={syncId}
    renderInteract={(node, { id, text, onInteract }) => (
      <Interactable id={id} onInteract={onInteract} interactionText={text}>
        {node}
      </Interactable>
    )}
  />
)

/** 全員同期版（sync 指定時）: useInstanceState でモードをインスタンス同期 */
const SyncedStandMirror = ({
  syncId = 'xrift-mirror',
  defaultMode = 'off',
  ...rest
}: Omit<XRiftStandMirrorProps, 'sync'>) => {
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
