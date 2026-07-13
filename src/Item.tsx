import { useItem, usePlacementState } from '@xrift/world-components'
import { StandMirror, mirrorLayout } from './mirror/StandMirror'

/**
 * ミラー（アイテム版）— どのワールドにも持ち込める鏡。
 * 本体実装は mirror/StandMirror.tsx（ワールド設置版と共通）。
 * アイテム版はサイズ固定の大型（3.6×2.85m）。既定はLQ
 * （出した人は使う気で出しているため。ワールド備え付けと違い遠慮不要）。
 */

/** 鏡面サイズ [幅, 高さ]（v1の1.2×1.9から幅3倍・高さ1.5倍） */
const MIRROR_W = 3.6
const MIRROR_H = 2.85

export interface ItemProps {
  position?: [number, number, number]
  scale?: number
}

export const Item = (props: ItemProps) => {
  // 「ここに置く」の位置決め中は、物理コライダー・Interactable・鏡本体を持たない
  // 張りぼてを出す（プレビュー中のコライダーはプレイヤーを押し得るし、鏡は描画コストが高い）
  const { mode } = usePlacementState()
  if (mode === 'preview') {
    return <MirrorPreview position={props.position} scale={props.scale} />
  }
  return <MirrorLive {...props} />
}

const MirrorLive = ({ position = [0, 0, 0], scale = 1 }: ItemProps) => {
  const { id } = useItem()
  return (
    <group position={position} scale={scale}>
      <StandMirror width={MIRROR_W} height={MIRROR_H} defaultMode="lq" syncId={`xmirror:${id}`} />
    </group>
  )
}

/** 設置プレビュー用の見た目だけの姿見（コライダー・インタラクション・同期なし） */
const MirrorPreview = ({ position = [0, 0, 0], scale = 1 }: ItemProps) => {
  const { frameW, frameH, centerY, btnX, btnYs, colCenterY } = mirrorLayout(MIRROR_W, MIRROR_H)
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, centerY, -0.04]}>
        <boxGeometry args={[frameW, frameH, 0.06]} />
        <meshStandardMaterial color="#3a3f4a" metalness={0.6} roughness={0.35} transparent opacity={0.7} />
      </mesh>
      <mesh position={[0, centerY, 0]}>
        <planeGeometry args={[MIRROR_W, MIRROR_H]} />
        <meshStandardMaterial color="#8fa3bf" metalness={0.9} roughness={0.15} transparent opacity={0.45} />
      </mesh>
      <mesh position={[0, 0.11, -0.02]}>
        <boxGeometry args={[frameW * 0.6, 0.22, 0.28]} />
        <meshStandardMaterial color="#2c313c" transparent opacity={0.7} />
      </mesh>
      {/* スイッチ列の気配（右端・縦並び） */}
      <mesh position={[btnX - 0.01, colCenterY, -0.045]}>
        <boxGeometry args={[0.2, 0.46, 0.05]} />
        <meshStandardMaterial color="#2c313c" transparent opacity={0.7} />
      </mesh>
      {btnYs.map((y) => (
        <mesh key={y} position={[btnX, y, 0]}>
          <boxGeometry args={[0.14, 0.07, 0.03]} />
          <meshStandardMaterial color="#555a66" transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  )
}
