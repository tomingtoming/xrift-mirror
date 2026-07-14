import { Text } from '@react-three/drei'
import { RigidBody } from '@react-three/rapier'
import { useState, type ReactNode } from 'react'
import { MirrorSurface } from './MirrorSurface'

/**
 * StandMirror — HQ/LQ/OFF切替つきの姿見ミラー（VRChat文化の輸入）。
 *
 * 参考: BOOTH「HQ・LQ切り替えスイッチ付ミラー」(booth.pm/ja/items/3640350)
 * ＝3モードをボタンで切り替えて描画コストを制御する。
 *
 * モード: HQ=全景ミラー（解像度1024）/ LQ=アバターだけ映る軽量ミラー
 * （解像度512。反射パスのドローコールをアバター数体分まで削る＝本命の軽量化）
 * / OFF=鏡を外す（枠だけ・描画コストゼロ）。
 *
 * 実装は three + React Three Fiber（+drei/rapier）だけで完結し、
 * XRift API（@xrift/world-components）には依存しない:
 * - 鏡面は three.js Reflector のフォーク（LayeredReflector）＝色合成なしの恒等ミラー
 * - モード状態は非制御（内部state）が既定。全員同期したい場合は
 *   mode/onModeChange を外部状態（XRiftの useInstanceState 等）に接続する
 * - スイッチの操作は既定でR3Fのポインタイベント。VRコントローラ対応が要る
 *   環境では renderInteract で Interactable 等を差し込む（./xrift.tsx が実装例）
 */

export type MirrorMode = 'hq' | 'lq' | 'off'

/** renderInteract に渡される、1ボタン分のインタラクション情報 */
export interface InteractOpts {
  id: string
  /** ホバー時などに出す説明文 */
  text: string
  onInteract: () => void
}

export interface StandMirrorProps {
  position?: [number, number, number]
  /** Y回転。鏡面は+Zを向く */
  rotationY?: number
  /** 鏡面の幅（m）。枠はこれより一回り大きい */
  width?: number
  /** 鏡面の高さ（m） */
  height?: number
  /** 非制御時の初期モード。ワールド備え付けは 'off' 推奨（Quest配慮のVRChatミラー作法） */
  defaultMode?: MirrorMode
  /** 制御モード。外部状態（XRiftのインスタンス同期等）と組むときに onModeChange とセットで使う */
  mode?: MirrorMode
  onModeChange?: (mode: MirrorMode) => void
  /** スイッチのインタラクション実装の差し替え（XRiftのInteractable等）。既定はR3Fポインタイベント */
  renderInteract?: (node: ReactNode, opts: InteractOpts) => ReactNode
  /** ボタンidの名前空間。複数設置時は一意にする */
  id?: string
}

const PEDESTAL_H = 0.22

/** 実機診断バナー（初回マウント時に一度だけ）: 本番で旧バンドルが
 *  キャッシュされていないかの確認用。0.3.x安定後に撤去する */
let bannerShown = false

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
  { mode: 'hq', label: 'HQ', text: '高画質ミラー（全景）' },
  { mode: 'lq', label: 'LQ', text: '軽量ミラー（アバターだけ映る）' },
  { mode: 'off', label: 'OFF', text: 'ミラーを消す' },
]

/** 既定のインタラクション: R3Fのポインタイベントで反応する */
const defaultRenderInteract = (node: ReactNode, { onInteract }: InteractOpts) => (
  <group
    onClick={(e) => {
      e.stopPropagation()
      onInteract()
    }}
  >
    {node}
  </group>
)

export const StandMirror = ({
  position = [0, 0, 0],
  rotationY = 0,
  width = 1.6,
  height = 2.2,
  defaultMode = 'off',
  mode: controlledMode,
  onModeChange,
  renderInteract = defaultRenderInteract,
  id = 'xrift-mirror',
}: StandMirrorProps) => {
  if (!bannerShown) {
    bannerShown = true
    console.warn('[xrift-mirror] StandMirror v0.3.2 active')
  }
  const [localMode, setLocalMode] = useState<MirrorMode>(defaultMode)
  const mode = controlledMode ?? localMode
  const setMode = (m: MirrorMode) => {
    console.warn(`[xrift-mirror] mode -> ${m}`)
    onModeChange?.(m)
    if (controlledMode === undefined) setLocalMode(m)
  }
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

      {/* 鏡面（OFFのときは消灯ガラス） */}
      {mode !== 'off' ? (
        <MirrorSurface position={[0, centerY, 0]} width={width} height={height} quality={mode} />
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

      {/* モード切替スイッチ（右端に縦並び・現在モードが青く光る） */}
      {MODES.map(({ mode: m, label, text }, i) => (
        <group key={m} position={[btnX, btnYs[i], 0]}>
          {renderInteract(
            <ModeButton
              color={mode === m ? '#2a6fd6' : '#37474f'}
              active={mode === m}
              label={label}
            />,
            { id: `${id}-${m}`, text, onInteract: () => setMode(m) },
          )}
        </group>
      ))}
    </group>
  )
}

/** ラベル常時表示のモードボタン（VRはホバー文言が見えないため）。見た目のみ */
const ModeButton = ({ color, active, label }: { color: string; active: boolean; label: string }) => (
  <group>
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
      outlineColor="#000000"
      outlineOpacity={0.53}
    >
      {label}
    </Text>
  </group>
)
