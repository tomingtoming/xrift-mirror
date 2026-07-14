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
 * 剛体アクセサリ等の非スキンメッシュは v1 では鏡に映らない（既知の限界）。
 */
export const MIRROR_AVATAR_LAYER = 30

/** three-vrm VRMFirstPerson 既定の一人称専用レイヤー */
const FIRST_PERSON_ONLY_LAYER = 9

/** LQ用: 鏡専用レイヤーだけ＝アバター（とタグ済みライト）だけを描く */
export const AVATAR_ONLY_MASK = 1 << MIRROR_AVATAR_LAYER

/** HQ用: 一人称専用(9)だけ除いた全景＝鏡には三人称の姿（頭あり）を映す */
export const FULL_SCENE_MASK = 0xffffffff ^ (1 << FIRST_PERSON_ONLY_LAYER)

/**
 * シーンを走査してアバターとライトに鏡専用レイヤーをタグ付けする（冪等）。
 * 参加/退出やVRMの遅延ロードに追随するため、定期的に呼び直す。
 */
export const tagAvatarsForMirror = (root: Object3D): void => {
  root.traverse((obj) => {
    const o = obj as Object3D & { isSkinnedMesh?: boolean; isLight?: boolean }
    if (o.isSkinnedMesh) {
      // 一人称専用メッシュは除外＝三人称の頭と二重に映るのを防ぐ
      if ((obj.layers.mask & (1 << FIRST_PERSON_ONLY_LAYER)) === 0) {
        obj.layers.enable(MIRROR_AVATAR_LAYER)
      }
    } else if (o.isLight) {
      // ライトもカメラの layers で選別される。タグしないと鏡内のアバターが真っ黒になる
      obj.layers.enable(MIRROR_AVATAR_LAYER)
    }
  })
}
