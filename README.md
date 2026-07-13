# xrift-mirror 🪞

**[XRift](https://xrift.net/) 用の切替スイッチ付き姿見ミラー** — VRChat ワールドの定番ギミック「HQ/LQ 切り替えミラー」を、XRift のワールドとアイテムの両方に持ち込んだものです。

*A switchable HQ/LQ/OFF stand mirror for XRift worlds & items.*

![xrift-mirror](public/thumbnail.png)

## できること

- 右端の縦スイッチで **HQ / LQ / OFF** の3モードを切替。モードは **全員に同期**（VRChat のミラースイッチと同じ流儀）
- **HQ** = 解像度1024 の高画質ミラー／**LQ** = 解像度256 の軽量ミラー／**OFF** = 鏡を外して枠だけ（描画コストゼロ）
- 現在のモードのスイッチが青く光る。ラベル常時表示（VR でも読める）
- 10m 以上離れると自動で軽量な擬似ミラー（envMap）へ切り替わる（XRift 公式 `<Mirror>` の LOD 内蔵機能）
- ワールド設置版は **幅・高さを自由に指定できる**

## ワールドに置く

```bash
npm install xrift-mirror
```

```tsx
import { StandMirror } from 'xrift-mirror'

export const World = () => (
  <>
    {/* 任意の位置・向き・サイズで置ける。複数置くなら syncId を変える */}
    <StandMirror position={[0, 0, -3]} width={2.4} height={2.2} />
  </>
)
```

| prop | 既定 | 説明 |
| --- | --- | --- |
| `position` | `[0, 0, 0]` | 設置位置（台座の足元） |
| `rotationY` | `0` | Y回転。鏡面は +Z を向く |
| `width` | `1.6` | 鏡面の幅（m）。枠はこれより一回り大きい |
| `height` | `2.2` | 鏡面の高さ（m） |
| `defaultMode` | `'off'` | 初期モード。ワールド備え付けは `'off'` 推奨（Quest 配慮の VRChat ミラー作法） |
| `syncId` | `'xrift-mirror'` | 同期キーの名前空間。複数設置時は一意にする |

依存（`react` / `three` / `@react-three/fiber` / `@react-three/drei` / `@react-three/rapier` / `@xrift/world-components`）はすべて peerDependencies です。XRift ワールドプロジェクトなら追加インストールは不要です。

## アイテム版

このリポジトリは XRift アイテム「ミラー」としてもビルドされます（`npm run build` → `xrift upload item`）。アイテム版はインベントリからどのワールドにも持ち込める **サイズ固定の大型ミラー（3.6m × 2.85m）** で、既定モードは LQ です。

ワールドにミラーが備え付けてあるのが常識の VRChat に対して、「鏡を自分で持ち歩く」は XRift のアイテム機構だからできる形です。

## モードの翻訳について

参考品（VRChat の切替ミラー）の LQ は「アバターだけ映る」ですが、XRift 公式 `<Mirror>` にはレイヤー制御が無いため、**低解像度化** に翻訳して軽量化を実現しています。

## クレジット

- 参考: BOOTH [HQ・LQ切り替えスイッチ付ミラー](https://booth.pm/ja/items/3640350) ほか VRChat のワールドギミック文化。コードは React Three Fiber でゼロから書いています
- 鏡の実体は XRift 公式 [`@xrift/world-components`](https://github.com/WebXR-JP/xrift-world-components) の `<Mirror>` です

## 開発

```bash
npm install
npm run dev        # DevEnvironment 上で単体プレビュー（?preview で設置プレビュー確認）
npm run build      # XRift アイテムビルド（Module Federation → dist/）
npm run build:lib  # npm ライブラリビルド（→ lib/）
npm run typecheck
```

## ライセンス

MIT
