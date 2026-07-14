/**
 * xrift-mirror — HQ/LQ/OFF切替つき姿見ミラー（React Three Fiber部品）
 *
 * このエントリは three + React Three Fiber だけに依存する（XRift API非依存）。
 * XRiftワールドでモード同期・VR操作つきで使うには `xrift-mirror/xrift` の
 * XRiftStandMirror を使う。
 *
 *   import { StandMirror } from 'xrift-mirror'            // 素のR3F向け
 *   import { XRiftStandMirror } from 'xrift-mirror/xrift' // XRiftワールド向け
 */
export { StandMirror, mirrorLayout } from './mirror/StandMirror'
export type { StandMirrorProps, MirrorMode, InteractOpts } from './mirror/StandMirror'
export { MirrorSurface } from './mirror/MirrorSurface'
export type { MirrorSurfaceProps, MirrorQuality } from './mirror/MirrorSurface'
export { LayeredReflector } from './mirror/LayeredReflector'
export type { LayeredReflectorOptions } from './mirror/LayeredReflector'
export {
  MIRROR_AVATAR_LAYER,
  AVATAR_ONLY_MASK,
  FULL_SCENE_MASK,
  tagAvatarsForMirror,
  collectMirrorTargets,
} from './mirror/avatarLayer'
export type { MirrorScanResult } from './mirror/avatarLayer'
