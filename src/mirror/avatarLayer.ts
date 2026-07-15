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
 * 実機診断（toming 2026-07-15、工房・複数アカウントでの実地検証）で判明した
 * 3種類のアバター構造:
 * 1. カスタムVRM: 1枚の SkinnedMesh（例: "CombinedMToonMesh_opaque"）。
 *    layer 9/10 は three-vrm 自身が管理。既存のSkinnedMesh検出で映る。
 * 2. XRift既定アバター: SkinnedMeshでもTHIRD_PERSON_ONLYタグ付けでもない。
 *    Blenderの原始図形（Cone/Cube/Icosphere等）を体パーツとして、名前付きの
 *    ボーン風 Object3D（hips/spine/chest/neck/head/shoulderL/upper_armL/
 *    handL/handR/...）に直接ぶら下げた「セグメント方式」の簡易プレース
 *    ホルダー。userData に意図的なマーカーは無い（GLTF由来の元名前が
 *    残っているだけ）。SkinnedMesh検出でもTHIRD_PERSON_ONLY検出でも
 *    拾えないため、v0.3.7まで鏡に映らなかった。
 * → isHumanoidJointChain() で親のボーン風関節名を見て救済する。
 *
 * 剛体アクセサリ等、上記いずれの信号も持たない非アバター装着物は
 * v1 では鏡に映らない（既知の限界）。
 */
export const MIRROR_AVATAR_LAYER = 30

/** three-vrm VRMFirstPerson 既定の一人称専用レイヤー */
const FIRST_PERSON_ONLY_LAYER = 9

/** XRift既定の三人称専用レイヤー（鏡や他人にだけ映る頭等） */
const THIRD_PERSON_ONLY_LAYER = 10

/** LQ用: 鏡専用レイヤーだけ＝アバター（とタグ済みライト）だけを描く */
export const AVATAR_ONLY_MASK = 1 << MIRROR_AVATAR_LAYER

/** HQ用: 一人称専用(9)だけ除いた全景＝鏡には三人称の姿（頭あり）を映す */
export const FULL_SCENE_MASK = 0xffffffff ^ (1 << FIRST_PERSON_ONLY_LAYER)

/**
 * ヒューマノイドの関節・体パーツによくある名前（正規化後の比較用トークン）。
 * "root" は GLTF/ワールドの最上位ノードにも頻出する汎用名のため意図的に除外
 * （後述の2階層連続一致要求と組み合わせても誤検知率が上がりすぎるため）。
 */
const HUMANOID_JOINT_TOKENS = new Set([
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'shoulder',
  'upperarm',
  'lowerarm',
  'forearm',
  'hand',
  'upperleg',
  'thigh',
  'lowerleg',
  'shin',
  'calf',
  'foot',
  'toe',
])

/** "handL" → "hand" のように末尾のL/R(左右サフィックス)と区切り文字を落として比較する */
const normalizeJointName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[_\s]/g, '')
    .replace(/[lr]$/, '')

const isJointName = (name: string): boolean => name.length > 0 && HUMANOID_JOINT_TOKENS.has(normalizeJointName(name))

/**
 * 「関節名の祖先が2階層以上連続しているか」を見て、単発の偶然一致
 * （例: ワールド家具の「宝箱(Chest)」）を除外する。実在の骨格は
 * chest→spine→hips のように関節名が連鎖するため、これで見分けられる。
 */
const hasJointAncestorChain = (obj: Object3D): boolean => {
  let p: Object3D | null = obj.parent
  let steps = 0
  while (p && steps < 3) {
    if (isJointName(p.name)) return true
    p = p.parent
    steps++
  }
  return false
}

export interface MirrorScanResult {
  /** タグ付け対象（アバターのSkinnedMesh＋THIRD_PERSON_ONLYパーツ＋セグメント方式パーツ＋ライト） */
  targets: Object3D[]
  skinned: number
  /** SkinnedMeshではないがTHIRD_PERSON_ONLY会員資格で拾えたパーツ数 */
  thirdPersonOnly: number
  /** ボーン風関節名の連鎖から拾えたセグメント方式アバターのパーツ数（既定アバター等） */
  segmented: number
  lights: number
  totalNodes: number
}

/** シーンを全走査してタグ付け対象を収集する（タグ付け自体はしない） */
export const collectMirrorTargets = (root: Object3D): MirrorScanResult => {
  const targets: Object3D[] = []
  let skinned = 0
  let thirdPersonOnly = 0
  let segmented = 0
  let lights = 0
  let totalNodes = 0
  root.traverse((obj) => {
    totalNodes++
    const o = obj as Object3D & { isSkinnedMesh?: boolean; isMesh?: boolean; isLight?: boolean }
    // 一人称専用メッシュは除外＝三人称の頭と二重に映るのを防ぐ
    if ((obj.layers.mask & (1 << FIRST_PERSON_ONLY_LAYER)) !== 0) return
    if (o.isSkinnedMesh) {
      targets.push(obj)
      skinned++
    } else if ((obj.layers.mask & (1 << THIRD_PERSON_ONLY_LAYER)) !== 0) {
      // スキン無しアバター救済その1: ホストがTHIRD_PERSON_ONLYと明示タグ付けした時点でアバターの一部とみなす
      targets.push(obj)
      thirdPersonOnly++
    } else if (o.isMesh && obj.parent && isJointName(obj.parent.name) && hasJointAncestorChain(obj.parent)) {
      // スキン無しアバター救済その2: セグメント方式（体パーツごとに無名Meshが
      // 名前付きボーン風関節にぶら下がる）既定アバターを、関節名の連鎖で検出
      targets.push(obj)
      segmented++
    } else if (o.isLight) {
      // ライトもカメラの layers で選別される。タグしないと鏡内のアバターが真っ黒になる
      targets.push(obj)
      lights++
    }
  })
  return { targets, skinned, thirdPersonOnly, segmented, lights, totalNodes }
}

/** 収集＋タグ付けを一度に行う簡易版（冪等） */
export const tagAvatarsForMirror = (root: Object3D): void => {
  for (const o of collectMirrorTargets(root).targets) o.layers.enable(MIRROR_AVATAR_LAYER)
}
