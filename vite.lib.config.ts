import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

/**
 * ライブラリビルド（npmパッケージ `xrift-mirror` 用）。
 * XRiftアイテムのビルド（vite.config.ts / Module Federation）とは別系統。
 * 依存は全てexternal＝実行時はワールド側のバンドル/共有スコープに乗る。
 */
export default defineConfig({
  publicDir: false,
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
      include: ['src/lib.ts', 'src/xrift.tsx', 'src/mirror'],
      outDir: 'lib',
    }),
  ],
  build: {
    outDir: 'lib',
    lib: {
      // index = three+R3Fのみに依存する本体 / xrift = @xrift/world-componentsを注入するアダプタ
      entry: {
        index: path.resolve(__dirname, 'src/lib.ts'),
        xrift: path.resolve(__dirname, 'src/xrift.tsx'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^react($|\/)/, /^react-dom($|\/)/, /^three($|\/)/, /^@react-three\//, /^@xrift\//],
    },
  },
})
