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
 * 注意: ホストがアバターの layers を毎フレーム設定し直す可能性があるため、
 * タグ付けは「反射レンダリングの直前」（LayeredReflector.onBeforeReflect）に
 * 毎フレーム当て直す。走査コスト対策に、全走査は約1秒ごと・間のフレームは
 * キャッシュ済みリストへの enable() だけ（ビット再セットは冪等で極小コスト）。
 *
 * 剛体アクセサリ等の非スキンメッシュは v1 では鏡に映らない（既知の限界）。
 */
export const MIRROR_AVATAR_LAYER = 30

/** three-vrm VRMFirstPerson 既定の一人称専用レイヤー */
const FIRST_PERSON_ONLY_LAYER = 9

/** LQ用: 鏡専用レイヤーだけ＝アバター（とタグ済みライト）だけを描く */
export const AVATAR_ONLY_MASK = 1 << MIRROR_AVATAR_LAYER

/** HQ用: 一人称専用(9)だけ除いた全景＝鏡には三人称の姿（頭あり）を映す */
export const FULL_SCENE_MASK = 0xffffffff ^ (1 << FIRST_PERSON_ONLY_LAYER)

export interface MirrorScanResult {
  /** タグ付け対象（アバターのSkinnedMesh＋ライト） */
  targets: Object3D[]
  skinned: number
  lights: number
  totalNodes: number
}

/** シーンを全走査してタグ付け対象を収集する（タグ付け自体はしない） */
export const collectMirrorTargets = (root: Object3D): MirrorScanResult => {
  const targets: Object3D[] = []
  let skinned = 0
  let lights = 0
  let totalNodes = 0
  root.traverse((obj) => {
    totalNodes++
    const o = obj as Object3D & { isSkinnedMesh?: boolean; isLight?: boolean }
    if (o.isSkinnedMesh) {
      // 一人称専用メッシュは除外＝三人称の頭と二重に映るのを防ぐ
      if ((obj.layers.mask & (1 << FIRST_PERSON_ONLY_LAYER)) === 0) {
        targets.push(obj)
        skinned++
      }
    } else if (o.isLight) {
      // ライトもカメラの layers で選別される。タグしないと鏡内のアバターが真っ黒になる
      targets.push(obj)
      lights++
    }
  })
  return { targets, skinned, lights, totalNodes }
}

/** 収集＋タグ付けを一度に行う簡易版（冪等） */
export const tagAvatarsForMirror = (root: Object3D): void => {
  for (const o of collectMirrorTargets(root).targets) o.layers.enable(MIRROR_AVATAR_LAYER)
}
