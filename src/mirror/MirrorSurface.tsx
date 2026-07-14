import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Group, Mesh, PlaneGeometry, Vector3, type PerspectiveCamera } from 'three'
import { AVATAR_ONLY_MASK, FULL_SCENE_MASK, tagAvatarsForMirror } from './avatarLayer'
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

/** アバタータグ付けの再走査間隔（フレーム数）。参加/退出・VRM遅延ロードに追随する */
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
  const frameRef = useRef(0)

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
    group.add(reflector)
    reflectorRef.current = reflector
    frameRef.current = 0 // 次のフレームで即タグ付けを走らせる
    return () => {
      group.remove(reflector)
      geometry.dispose()
      reflector.dispose()
      reflectorRef.current = null
    }
  }, [width, height, quality])

  useFrame(({ camera, gl, scene }) => {
    const reflector = reflectorRef.current
    if (!reflector) return

    // LQ: アバター(SkinnedMesh)とライトへの鏡用レイヤータグ付け（冪等・非破壊）
    if (quality === 'lq' && frameRef.current++ % RESCAN_FRAMES === 0) {
      tagAvatarsForMirror(scene)
    }

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
