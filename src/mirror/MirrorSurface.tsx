import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Group, Mesh, Object3D, PlaneGeometry, Vector3, type PerspectiveCamera } from 'three'
import {
  AVATAR_ONLY_MASK,
  FULL_SCENE_MASK,
  MIRROR_AVATAR_LAYER,
  collectMirrorTargets,
  debugDumpNamedMeshes,
  debugSceneOutline,
} from './avatarLayer'
import { LayeredReflector } from './LayeredReflector'

/**
 * MirrorSurface — 鏡面そのもの（枠・スイッチなし）。
 * three + React Three Fiber だけで完結し、XRift APIには依存しない。
 *
 * quality:
 * - 'hq' = 全景を映す（解像度1024）。一人称専用レイヤー(9)だけ除外
 * - 'lq' = アバターだけ映す（解像度512）。VRChat流の軽量ミラー＝
 *   反射パスのドローコールをアバター数体分まで削る（解像度と違い
 *   シーン再描画そのものを削るのが本命の軽量化）
 *
 * 遠距離では反射レンダリングを止めて消灯ガラスに落とす（距離LOD）。
 */

export type MirrorQuality = 'hq' | 'lq'

export interface MirrorSurfaceProps {
  position?: [number, number, number]
  /** 鏡面の幅（m） */
  width?: number
  /** 鏡面の高さ（m） */
  height?: number
  quality?: MirrorQuality
  /** これより遠いと反射レンダリングを止める（m）。ヒステリシス0.8倍で復帰 */
  lodDistance?: number
}

const _camPos = new Vector3()
const _mirrorPos = new Vector3()

/** アバター全走査の間隔（フレーム数）。参加/退出・VRM遅延ロードに追随する */
const RESCAN_FRAMES = 60

export const MirrorSurface = ({
  position = [0, 0, 0],
  width = 1.6,
  height = 2.2,
  quality = 'hq',
  lodDistance = 10,
}: MirrorSurfaceProps) => {
  const groupRef = useRef<Group>(null)
  const fallbackRef = useRef<Mesh>(null)
  const reflectorRef = useRef<LayeredReflector | null>(null)
  const reflectingRef = useRef(true)

  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    const resolution = quality === 'hq' ? 1024 : 512
    const maxSide = Math.max(width, height)
    const geometry = new PlaneGeometry(width, height)
    const reflector = new LayeredReflector(geometry, {
      clipBias: 0.003,
      // 縦横比に合わせてテクスチャを割り付ける（長辺=resolution）
      textureWidth: Math.round((width / maxSide) * resolution),
      textureHeight: Math.round((height / maxSide) * resolution),
      multisample: 0, // Meta Quest (Android Chrome) の描画不具合回避
    })
    reflector.reflectLayersMask = quality === 'hq' ? FULL_SCENE_MASK : AVATAR_ONLY_MASK
    reflector.visible = reflectingRef.current
    console.warn(`[xrift-mirror] MirrorSurface mount quality=${quality}`)

    if (quality === 'lq') {
      // アバター(SkinnedMesh)とライトへの鏡用レイヤータグ付け。
      // ホストが毎フレームアバターのlayersを設定し直しても消されないよう、
      // 反射レンダリング直前に毎回当て直す（enableは冪等・キャッシュで極小コスト）。
      // 全走査は約1秒ごと＝参加/退出・VRM遅延ロードに追随。
      let frame = 0
      let targets: Object3D[] = []
      let lastSummary = ''
      let dumpedMeshes = false // 実機診断（切り分け後に撤去）: 初回スキャンだけ全メッシュ型を洗い出す
      reflector.onBeforeReflect = (scene) => {
        if (frame++ % RESCAN_FRAMES === 0) {
          const scan = collectMirrorTargets(scene)
          targets = scan.targets
          // 実機診断ログ（状態が変わったときだけ）: LQに何も映らない等の切り分け用
          const summary = `skinned=${scan.skinned} thirdPersonOnly=${scan.thirdPersonOnly} lights=${scan.lights} nodes=${scan.totalNodes}`
          if (summary !== lastSummary) {
            lastSummary = summary
            const targetInfo = scan.targets
              .filter((o) => !(o as Object3D & { isLight?: boolean }).isLight)
              .slice(0, 8)
              .map((o) => {
                const skinned = (o as Object3D & { isSkinnedMesh?: boolean }).isSkinnedMesh
                return `${o.name || '(no name)'}#layers=${o.layers.mask}${skinned ? '' : '(non-skinned)'}`
              })
            console.warn(`[xrift-mirror] LQ scan: ${summary}`, targetInfo)
          }
          if (!dumpedMeshes) {
            dumpedMeshes = true
            const dump = debugDumpNamedMeshes(scene)
            console.warn(`[xrift-mirror] LQ mesh dump (${dump.length} named mesh-likes):`, dump)
            const outline = debugSceneOutline(scene).filter((e) => e.totalDescendants > 1)
            console.warn(`[xrift-mirror] LQ scene outline (${outline.length} named containers):`, outline)
          }
        }
        for (const o of targets) o.layers.enable(MIRROR_AVATAR_LAYER)
      }
    }

    group.add(reflector)
    reflectorRef.current = reflector
    return () => {
      group.remove(reflector)
      geometry.dispose()
      reflector.dispose()
      reflectorRef.current = null
    }
  }, [width, height, quality])

  useFrame(({ camera, gl }) => {
    const reflector = reflectorRef.current
    if (!reflector) return

    // 距離LOD: 遠い鏡は反射レンダリングを止める（ヒステリシスでチラつき防止）
    const activeCamera = (gl.xr.isPresenting ? gl.xr.getCamera() : camera) as PerspectiveCamera
    _camPos.setFromMatrixPosition(activeCamera.matrixWorld)
    reflector.getWorldPosition(_mirrorPos)
    const distance = _camPos.distanceTo(_mirrorPos)
    const reflecting = reflectingRef.current
      ? distance <= lodDistance
      : distance <= lodDistance * 0.8
    if (reflecting !== reflectingRef.current) {
      reflectingRef.current = reflecting
      reflector.visible = reflecting
      if (fallbackRef.current) fallbackRef.current.visible = !reflecting
      console.warn(`[xrift-mirror] LOD reflecting=${reflecting} d=${distance.toFixed(1)}m`)
    }
  })

  return (
    <group ref={groupRef} position={position}>
      {/* 距離LODのフォールバック: 反射を止めている間の消灯ガラス */}
      <mesh ref={fallbackRef} visible={false}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#20242c" metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  )
}
