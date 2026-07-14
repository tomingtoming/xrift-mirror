/**
 * 開発環境用エントリーポイント
 *
 * DevEnvironment（WASD移動・クロスヘア・Interactableクリック・movement注入）の上で
 * アイテムを単体プレビューする。本番ビルドには含まれない。
 *
 * LQ（アバターだけ映る）の検証用に、ダミーアバター（SkinnedMesh・赤）と
 * 静的な青箱を鏡の前に置いてある。期待値: HQ=両方＋床が映る / LQ=赤だけ映る。
 * 左の小さい鏡は world-components 非依存の素の StandMirror（R3Fポインタ操作）。
 */

import { useMemo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { RigidBody } from '@react-three/rapier'
import {
  DevEnvironment,
  ItemProvider,
  PlacementStateProvider,
  XRiftProvider,
  useUsers,
} from '@xrift/world-components'
import {
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from 'three'
import { Item } from './Item'
import { StandMirror } from './mirror/StandMirror'

/** `?preview` を付けて開くと設置プレビュー（張りぼて）モードを確認できる */
const placementMode = new URLSearchParams(window.location.search).has('preview')
  ? ('preview' as const)
  : ('placed' as const)

/**
 * XRiftProvider は UsersProvider を内包していて、素で被せると
 * DevEnvironment が注入した movement 実装を空実装で影に隠してしまう。
 * ここで useUsers() の値を吸い上げて渡し直すことで両立させる。
 */
const XRiftDevBridge = ({ children }: { children: ReactNode }) => {
  const users = useUsers()
  return (
    <XRiftProvider baseUrl="/" usersImplementation={users}>
      {children}
    </XRiftProvider>
  )
}

/**
 * LQ検証用のダミーアバター（1ボーンのSkinnedMesh・赤）。
 * ミラーのLQモードは SkinnedMesh を「アバター」として検出するため、
 * 静的メッシュ（青箱・床）との映り分けをdevで確認できる。
 */
const TestAvatar = ({ position }: { position: [number, number, number] }) => {
  const mesh = useMemo(() => {
    const geometry = new BoxGeometry(0.5, 1.4, 0.35)
    const count = geometry.attributes.position.count
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(count * 4), 4))
    const weights = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) weights[i * 4] = 1
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4))
    const skinned = new SkinnedMesh(geometry, new MeshStandardMaterial({ color: '#d95d5d' }))
    const bone = new Bone()
    skinned.add(bone)
    skinned.bind(new Skeleton([bone]))
    return skinned
  }, [])
  return <primitive object={mesh} position={position} />
}

const App = () => (
  <DevEnvironment camera={{ position: [-0.8, 1.6, 7] }} spawnPosition={[-0.8, 1, 7]}>
    <XRiftDevBridge>
      <ItemProvider id="dev-mirror-item">
        <PlacementStateProvider mode={placementMode}>
          <Item position={[0, 0, 0]} />
        </PlacementStateProvider>
      </ItemProvider>
    </XRiftDevBridge>

    {/* 比較用: world-components非依存の素のStandMirror（HQ・ローカル状態・ポインタ操作） */}
    <StandMirror position={[-3.4, 0, 0]} defaultMode="hq" id="dev-hq" />

    {/* 映り分けの被写体: 赤=ダミーアバター（SkinnedMesh）・青=静的メッシュ。
        中央（LQ）用と左（HQ）用にそれぞれ1組（反射幾何的に両方の鏡に同時には映らないため） */}
    <TestAvatar position={[-1.7, 0.7, 2.6]} />
    <mesh position={[0.7, 0.5, 2.6]} castShadow>
      <boxGeometry args={[0.8, 1, 0.8]} />
      <meshStandardMaterial color="#5687d9" />
    </mesh>
    <TestAvatar position={[-3.0, 0.7, 2.4]} />
    <mesh position={[-3.9, 0.5, 2.4]} castShadow>
      <boxGeometry args={[0.6, 1, 0.6]} />
      <meshStandardMaterial color="#5687d9" />
    </mesh>

    {/* 地面 */}
    <RigidBody type="fixed" colliders="cuboid">
      <mesh receiveShadow position={[0, -0.05, 0]}>
        <boxGeometry args={[30, 0.1, 30]} />
        <meshStandardMaterial color="#4a4f5a" />
      </mesh>
    </RigidBody>
    <gridHelper args={[30, 30, '#777777', '#333333']} position={[0, 0.01, 0]} />

    <ambientLight intensity={0.5} />
    <directionalLight position={[5, 8, 3]} intensity={1.2} castShadow />
  </DevEnvironment>
)

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

createRoot(rootElement).render(<App />)
