import { Text } from '@react-three/drei'
import { RigidBody } from '@react-three/rapier'
import {
  Interactable,
  Mirror,
  useInstanceState,
  useItem,
  usePlacementState,
} from '@xrift/world-components'
import type { ReactNode } from 'react'

/**
 * 姿見ミラー — どのワールドにも持ち込める鏡（VRChat文化の輸入）。
 *
 * 参考: BOOTH「HQ・LQ切り替えスイッチ付ミラー」(booth.pm/ja/items/3640350)
 * ＝HQ/LQ/OFFの3モードをボタンで切り替えて描画コストを制御する。
 * XRift公式の <Mirror>（world-components・10m超でenvMap擬似ミラーへ自動LOD）に
 * 切替パネルを被せて再現。モードは useInstanceState でインスタンス同期。
 *
 * モードの翻訳: HQ=解像度1024 / LQ=解像度256（参考品の「アバターだけ映る」は
 * Mirrorにレイヤー制御が無く再現不能→低解像度で軽量化）/ OFF=鏡を外す（枠だけ）。
 * アイテム版の既定はLQ（出した人は使う気で出しているため。ワールド備え付けと違い遠慮不要）。
 */

type MirrorMode = 'hq' | 'lq' | 'off'

/** 鏡面サイズ [幅, 高さ] */
const MIRROR_W = 1.2
const MIRROR_H = 1.9

const FRAME_W = MIRROR_W + 0.1
const FRAME_H = MIRROR_H + 0.1
const CENTER_Y = 0.22 + FRAME_H / 2

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

/** 設置プレビュー用の見た目だけの姿見 */
const MirrorPreview = ({ position = [0, 0, 0], scale = 1 }: ItemProps) => (
  <group position={position} scale={scale}>
    <mesh position={[0, CENTER_Y, -0.04]}>
      <boxGeometry args={[FRAME_W, FRAME_H, 0.06]} />
      <meshStandardMaterial color="#3a3f4a" metalness={0.6} roughness={0.35} transparent opacity={0.7} />
    </mesh>
    <mesh position={[0, CENTER_Y, 0]}>
      <planeGeometry args={[MIRROR_W, MIRROR_H]} />
      <meshStandardMaterial color="#8fa3bf" metalness={0.9} roughness={0.15} transparent opacity={0.45} />
    </mesh>
    <mesh position={[0, 0.11, -0.02]}>
      <boxGeometry args={[FRAME_W * 0.6, 0.22, 0.28]} />
      <meshStandardMaterial color="#2c313c" transparent opacity={0.7} />
    </mesh>
  </group>
)

const MirrorLive = ({ position = [0, 0, 0], scale = 1 }: ItemProps) => {
  const { id } = useItem()
  const [mode, setMode] = useInstanceState<MirrorMode>(`xmirror:${id}:mode`, 'lq')

  const buttonColor = (m: MirrorMode) => (mode === m ? '#2a6fd6' : '#37474f')

  return (
    <group position={position} scale={scale}>
      {/* 枠（背板つき姿見。鏡面は+Z向き） */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, CENTER_Y, -0.04]} castShadow receiveShadow>
          <boxGeometry args={[FRAME_W, FRAME_H, 0.06]} />
          <meshStandardMaterial color="#3a3f4a" metalness={0.6} roughness={0.35} />
        </mesh>
      </RigidBody>
      {/* 台座 */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, 0.11, -0.02]} castShadow receiveShadow>
          <boxGeometry args={[FRAME_W * 0.6, 0.22, 0.28]} />
          <meshStandardMaterial color="#2c313c" metalness={0.5} roughness={0.4} />
        </mesh>
      </RigidBody>

      {/* 鏡面（OFFのときは消灯ガラス）
          color=0x808080: 公式Mirror既定の0xccccccはReflectorのblendOverlayで
          中間調を約1.6倍に持ち上げ、鏡の中だけ全てパステルに脱色する。
          overlay(base, 0.5)は恒等変換＝無色の正しい鏡 */}
      {mode !== 'off' ? (
        <Mirror
          position={[0, CENTER_Y, 0]}
          size={[MIRROR_W, MIRROR_H]}
          color={0x808080}
          textureResolution={mode === 'hq' ? 1024 : 256}
        />
      ) : (
        <mesh position={[0, CENTER_Y, 0]}>
          <planeGeometry args={[MIRROR_W, MIRROR_H]} />
          <meshStandardMaterial color="#0a0c10" metalness={0.9} roughness={0.25} />
        </mesh>
      )}

      {/* モード切替パネル（台座上・現在モードが青く光る・全員に同期） */}
      <ModeButton
        id={`xmirror-${id}-hq`}
        x={-0.24}
        color={buttonColor('hq')}
        active={mode === 'hq'}
        label="HQ"
        text="高画質ミラー（全員に反映）"
        onInteract={() => setMode('hq')}
      />
      <ModeButton
        id={`xmirror-${id}-lq`}
        x={0}
        color={buttonColor('lq')}
        active={mode === 'lq'}
        label="LQ"
        text="軽量ミラー（全員に反映）"
        onInteract={() => setMode('lq')}
      />
      <ModeButton
        id={`xmirror-${id}-off`}
        x={0.24}
        color={buttonColor('off')}
        active={mode === 'off'}
        label="OFF"
        text="ミラーを消す（全員に反映）"
        onInteract={() => setMode('off')}
      />
    </group>
  )
}

/** ラベル常時表示のモードボタン（VRはホバー文言が見えないため） */
const ModeButton = ({
  id,
  x,
  color,
  active,
  label,
  text,
  onInteract,
  children,
}: {
  id: string
  x: number
  color: string
  active: boolean
  label: string
  text: string
  onInteract: () => void
  children?: ReactNode
}) => (
  <Interactable id={id} onInteract={onInteract} interactionText={text}>
    <group position={[x, 0.22, 0.13]}>
      <mesh castShadow>
        <boxGeometry args={[0.14, 0.07, 0.03]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.8 : 0.25} />
      </mesh>
      <Text
        position={[0, 0, 0.017]}
        fontSize={0.028}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.002}
        outlineColor="#00000088"
      >
        {label}
      </Text>
      {children}
    </group>
  </Interactable>
)
