/**
 * xrift-mirror — HQ/LQ/OFF切替つき姿見ミラー（XRiftワールド部品）
 *
 * ワールド作者向けエントリ。XRiftワールドの任意の場所に:
 *   import { StandMirror } from 'xrift-mirror'
 *   <StandMirror position={[0, 0, -3]} width={2} height={2.5} />
 */
export { StandMirror, mirrorLayout } from './mirror/StandMirror'
export type { StandMirrorProps, MirrorMode } from './mirror/StandMirror'
export { Item } from './Item'
export type { ItemProps } from './Item'
