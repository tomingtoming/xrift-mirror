import type { Object3D } from 'three'

/**
 * 「アバターだけ映す」ためのレイヤータグ付け。
 *
 * XRiftのアバターは three-vrm の VRMFirstPerson 層規約を使う:
 *    9 = 一人称専用（自分のカメラにだけ映る体）
 *   10 = 三人称専用（鏡や他人にだけ映る頭など）
 * ただし体の大半は "both" として layer 0 にワールドと同居しているため、
 * 既存レイヤーだけでは「アバターだけ」を分離できない。
 *
 * そこで SkinnedMesh（アバター≒スキンメッシュ・ワールドは静的メッシュ）を
 * 検出して鏡専用レイヤーのビットを立てる。Layers はビットマスクなので
 * enable() は既存ビットを壊さない＝ホスト（XRift本体）のレイヤー運用に非破壊。
 *
 * 実機診断（toming 2026-07-15）: カスタムVRMはこれで映るが、XRiftの既定
 * （スキン無し）アバターが映らない不具合を確認。既定アバターはSkinnedMesh
 * を持たないプレースホルダー形状のため。ホスト（@xrift/world-components）
 * 自身が三人称専用パーツに layer 10（THIRD_PERSON_ONLY）を明示付与している
 * ので、SkinnedMesh検出に加えてこのレイヤー会員資格も「アバターらしさ」の
 * 判定に使う＝スキン無しの既定アバターも拾える（layer番号だけの参照であり
 * 実装コードは含まない）。
 *
 * 注意: ホストがアバターの layers を毎フレーム設定し直す可能性があるため、
 * タグ付けは「反射レンダリングの直前」（LayeredReflector.onBeforeReflect）に
 * 毎フレーム当て直す。走査コスト対策に、全走査は約1秒ごと・間のフレームは
 * キャッシュ済みリストへの enable() だけ（ビット再セットは冪等で極小コスト）。
 *
 * 剛体アクセサリ等、SkinnedMeshでもTHIRD_PERSON_ONLYでもない非アバター
 * 装着物は v1 では鏡に映らない（既知の限界）。
 */
export const MIRROR_AVATAR_LAYER = 30

/** three-vrm VRMFirstPerson 既定の一人称専用レイヤー */
const FIRST_PERSON_ONLY_LAYER = 9

/** XRift既定の三人称専用レイヤー（鏡や他人にだけ映る頭・既定アバター等） */
const THIRD_PERSON_ONLY_LAYER = 10

/** LQ用: 鏡専用レイヤーだけ＝アバター（とタグ済みライト）だけを描く */
export const AVATAR_ONLY_MASK = 1 << MIRROR_AVATAR_LAYER

/** HQ用: 一人称専用(9)だけ除いた全景＝鏡には三人称の姿（頭あり）を映す */
export const FULL_SCENE_MASK = 0xffffffff ^ (1 << FIRST_PERSON_ONLY_LAYER)

export interface MirrorScanResult {
  /** タグ付け対象（アバターのSkinnedMesh＋THIRD_PERSON_ONLYパーツ＋ライト） */
  targets: Object3D[]
  skinned: number
  /** SkinnedMeshではないがTHIRD_PERSON_ONLY会員資格で拾えたパーツ数（既定アバター等） */
  thirdPersonOnly: number
  lights: number
  totalNodes: number
}

/** シーンを全走査してタグ付け対象を収集する（タグ付け自体はしない） */
export const collectMirrorTargets = (root: Object3D): MirrorScanResult => {
  const targets: Object3D[] = []
  let skinned = 0
  let thirdPersonOnly = 0
  let lights = 0
  let totalNodes = 0
  root.traverse((obj) => {
    totalNodes++
    const o = obj as Object3D & { isSkinnedMesh?: boolean; isLight?: boolean }
    // 一人称専用メッシュは除外＝三人称の頭と二重に映るのを防ぐ
    if ((obj.layers.mask & (1 << FIRST_PERSON_ONLY_LAYER)) !== 0) return
    if (o.isSkinnedMesh) {
      targets.push(obj)
      skinned++
    } else if ((obj.layers.mask & (1 << THIRD_PERSON_ONLY_LAYER)) !== 0) {
      // スキン無しの既定アバター救済: ホストがTHIRD_PERSON_ONLYと明示タグ付けした時点でアバターの一部とみなす
      targets.push(obj)
      thirdPersonOnly++
    } else if (o.isLight) {
      // ライトもカメラの layers で選別される。タグしないと鏡内のアバターが真っ黒になる
      targets.push(obj)
      lights++
    }
  })
  return { targets, skinned, thirdPersonOnly, lights, totalNodes }
}

/** 収集＋タグ付けを一度に行う簡易版（冪等） */
export const tagAvatarsForMirror = (root: Object3D): void => {
  for (const o of collectMirrorTargets(root).targets) o.layers.enable(MIRROR_AVATAR_LAYER)
}

/**
 * 実機診断用（toming 2026-07-15、切り分け後に撤去）: 既定アバターが
 * SkinnedMeshでもTHIRD_PERSON_ONLYでもないと判明。debugSceneOutlineで
 * 既定アバターは「体の各パーツごとに無名Meshが名前付きボーン風
 * Object3D（hips/spine/chest/neck/head/shoulderL/...）にぶら下がる
 * セグメント方式」と判明したため、無名メッシュも拾い、userData（アプリ
 * 側が意図的に仕込んだ目印がないか）と直近の名前付き祖先を洗い出す。
 */
const describeUserData = (userData: Record<string, unknown>): string => {
  const keys = Object.keys(userData)
  if (keys.length === 0) return ''
  return keys
    .map((k) => {
      const v = userData[k]
      const t = typeof v
      const shown = t === 'string' || t === 'number' || t === 'boolean' || v === null ? String(v) : `<${t}>`
      return `${k}=${shown}`
    })
    .join(',')
}

export interface MeshDumpEntry {
  name: string
  kind: 'skinned' | 'instanced' | 'sprite' | 'mesh'
  layers: number
  visible: boolean
  userData: string
  /** 無名メッシュの手がかり用: 直近の名前付き祖先 */
  nearestNamedAncestor: string
}

export const debugDumpAllMeshes = (root: Object3D, limit = 80): MeshDumpEntry[] => {
  const entries: MeshDumpEntry[] = []
  root.traverse((obj) => {
    if (entries.length >= limit) return
    const o = obj as Object3D & {
      isSkinnedMesh?: boolean
      isInstancedMesh?: boolean
      isSprite?: boolean
      isMesh?: boolean
    }
    const kind = o.isSkinnedMesh
      ? 'skinned'
      : o.isInstancedMesh
        ? 'instanced'
        : o.isSprite
          ? 'sprite'
          : o.isMesh
            ? 'mesh'
            : undefined
    if (!kind) return
    let nearestNamedAncestor = ''
    for (let p = obj.parent; p; p = p.parent) {
      if (p.name) {
        nearestNamedAncestor = p.name
        break
      }
    }
    entries.push({
      name: obj.name || '(no name)',
      kind,
      layers: obj.layers.mask,
      visible: obj.visible,
      userData: describeUserData(obj.userData),
      nearestNamedAncestor: nearestNamedAncestor || '(none)',
    })
  })
  return entries
}

/**
 * 実機診断用その2（toming 2026-07-15、切り分け後に撤去）: 名前付き
 * メッシュ6個の中に既定アバターが1個もいなかった＝実体は名前無しの
 * オブジェクトで構成されている可能性。そこで「名前付きコンテナ
 * （グループ等）ごとに配下のメッシュ内訳を集計」する形に変えて、
 * 名前無しリーフでも名前付き祖先経由で存在を検出する。
 */
export interface SceneOutlineEntry {
  name: string
  type: string
  /** ルートからの深さ */
  depth: number
  skinnedDescendants: number
  meshDescendants: number
  totalDescendants: number
  layers: number
  userData: string
}

export const debugSceneOutline = (root: Object3D, limit = 100): SceneOutlineEntry[] => {
  const entries: SceneOutlineEntry[] = []
  const depthOf = (obj: Object3D): number => {
    let d = 0
    for (let p = obj.parent; p; p = p.parent) d++
    return d
  }
  root.traverse((obj) => {
    if (!obj.name || entries.length >= limit) return
    let skinned = 0
    let mesh = 0
    let total = 0
    obj.traverse((d) => {
      total++
      const o = d as Object3D & { isSkinnedMesh?: boolean; isMesh?: boolean }
      if (o.isSkinnedMesh) skinned++
      else if (o.isMesh) mesh++
    })
    entries.push({
      name: obj.name,
      type: obj.type,
      depth: depthOf(obj),
      skinnedDescendants: skinned,
      meshDescendants: mesh,
      totalDescendants: total,
      layers: obj.layers.mask,
      userData: describeUserData(obj.userData),
    })
  })
  return entries
}
