import { Text } from '@react-three/drei'
import { RigidBody } from '@react-three/rapier'
import { Interactable, Mirror, useInstanceState } from '@xrift/world-components'

/**
 * StandMirror — HQ/LQ/OFF切替つきの姿見ミラー（VRChat文化の輸入）。
 *
 * 参考: BOOTH「HQ・LQ切り替えスイッチ付ミラー」(booth.pm/ja/items/3640350)
 * ＝3モードをボタンで切り替えて描画コストを制御する。
 * XRift公式の <Mirror>（world-components・10m超でenvMap擬似ミラーへ自動LOD）に
 * 切替スイッチを被せて再現。モードは useInstanceState でインスタンス同期＝全員に同じ見え方。
 *
 * モードの翻訳: HQ=解像度1024 / LQ=解像度256（参考品の「アバターだけ映る」は
 * Mirrorにレイヤー制御が無く再現不能→低解像度で軽量化）/ OFF=鏡を外す（枠だけ・描画コストゼロ）。
 */

export type MirrorMode = 'hq' | 'lq' | 'off'

export interface StandMirrorProps {
  position?: [number, number, number]
  /** Y回転。鏡面は+Zを向く */
  rotationY?: number
  /** 鏡面の幅（m）。枠はこれより一回り大きい */
  width?: number
  /** 鏡面の高さ（m） */
  height?: number
  /** 初期モード。ワールド備え付けは 'off' 推奨（Quest配慮のVRChatミラー作法） */
  defaultMode?: MirrorMode
  /** 同期キーの名前空間。複数設置時は一意にする */
  syncId?: string
}

const PEDESTAL_H = 0.22

/**
 * width/height から枠・台座・スイッチ列の配置を導く。
 * Item.tsx の設置プレビュー（張りぼて）と共有するため公開。
 * スイッチは右端に縦並び（上からHQ/LQ/OFF）。列の高さは手が届く1.2m目安、
 * 低い鏡では枠の上端に収める。
 */
export const mirrorLayout = (width: number, height: number) => {
  const frameW = width + 0.1
  const frameH = height + 0.1
  const centerY = PEDESTAL_H + frameH / 2
  const btnX = frameW / 2 + 0.1
  const btnGap = 0.12
  const colCenterY = Math.max(0.35, Math.min(1.2, PEDESTAL_H + frameH - 0.2))
  const btnYs = [colCenterY + btnGap, colCenterY, colCenterY - btnGap] as const
  return { frameW, frameH, centerY, btnX, btnYs, colCenterY }
}

const MODES: { mode: MirrorMode; label: string; text: string }[] = [
  { mode: 'hq', label: 'HQ', text: '高画質ミラー（全員に反映）' },
  { mode: 'lq', label: 'LQ', text: '軽量ミラー（全員に反映）' },
  { mode: 'off', label: 'OFF', text: 'ミラーを消す（全員に反映）' },
]

export const StandMirror = ({
  position = [0, 0, 0],
  rotationY = 0,
  width = 1.6,
  height = 2.2,
  defaultMode = 'off',
  syncId = 'xrift-mirror',
}: StandMirrorProps) => {
  const [mode, setMode] = useInstanceState<MirrorMode>(`${syncId}:mode`, defaultMode)
  const { frameW, frameH, centerY, btnX, btnYs, colCenterY } = mirrorLayout(width, height)

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 枠（背板つき姿見。鏡面は+Z向き） */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, centerY, -0.04]} castShadow receiveShadow>
          <boxGeometry args={[frameW, frameH, 0.06]} />
          <meshStandardMaterial color="#3a3f4a" metalness={0.6} roughness={0.35} />
        </mesh>
      </RigidBody>
      {/* 台座 */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, PEDESTAL_H / 2, -0.02]} castShadow receiveShadow>
          <boxGeometry args={[frameW * 0.6, PEDESTAL_H, 0.28]} />
          <meshStandardMaterial color="#2c313c" metalness={0.5} roughness={0.4} />
        </mesh>
      </RigidBody>

      {/* 鏡面（OFFのときは消灯ガラス）
          color=0x808080: 公式Mirror既定の0xccccccはReflectorのblendOverlayで
          中間調を約1.6倍に持ち上げ、鏡の中だけ全てパステルに脱色する。
          overlay(base, 0.5)は恒等変換＝無色の正しい鏡 */}
      {mode !== 'off' ? (
        <Mirror
          position={[0, centerY, 0]}
          size={[width, height]}
          color={0x808080}
          textureResolution={mode === 'hq' ? 1024 : 256}
        />
      ) : (
        <mesh position={[0, centerY, 0]}>
          <planeGeometry args={[width, height]} />
          <meshStandardMaterial color="#0a0c10" metalness={0.9} roughness={0.25} />
        </mesh>
      )}

      {/* スイッチ支柱（枠の右端から張り出す。コライダーは付けない＝プレイヤーを押さない） */}
      <mesh position={[btnX - 0.01, colCenterY, -0.045]} castShadow>
        <boxGeometry args={[0.2, 0.46, 0.05]} />
        <meshStandardMaterial color="#2c313c" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* モード切替スイッチ（右端に縦並び・現在モードが青く光る・全員に同期） */}
      {MODES.map(({ mode: m, label, text }, i) => (
        <ModeButton
          key={m}
          id={`${syncId}-${m}`}
          position={[btnX, btnYs[i], 0]}
          color={mode === m ? '#2a6fd6' : '#37474f'}
          active={mode === m}
          label={label}
          text={text}
          onInteract={() => setMode(m)}
        />
      ))}
    </group>
  )
}

/** ラベル常時表示のモードボタン（VRはホバー文言が見えないため） */
const ModeButton = ({
  id,
  position,
  color,
  active,
  label,
  text,
  onInteract,
}: {
  id: string
  position: [number, number, number]
  color: string
  active: boolean
  label: string
  text: string
  onInteract: () => void
}) => (
  <Interactable id={id} onInteract={onInteract} interactionText={text}>
    <group position={position}>
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
    </group>
  </Interactable>
)
