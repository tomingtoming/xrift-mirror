import {
  BufferGeometry,
  HalfFloatType,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Plane,
  ShaderMaterial,
  UniformsUtils,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three'

/**
 * three.js の Reflector（examples/jsm/objects/Reflector.js・MIT License・
 * Copyright 2010-2026 three.js authors）のフォーク。
 * XRift公式 <Mirror>（@xrift/world-components・ライセンス表記なし）のコードは
 * 一切含まない＝依存ごと置き換える。
 *
 * upstream からの変更点:
 * - reflectLayersMask: 反射レンダリングに使う仮想カメラの layers を外部から
 *   指定できる。「鏡に何を映すか」の選択＝解像度と違いシーン再描画の
 *   ドローコールそのものを削れる（VRChat流「アバターだけミラー」の本命レバー）
 * - blendOverlay の色合成を撤去した恒等ミラー（upstream既定 0x7F7F7F でも
 *   overlay合成が残る。色を混ぜないのが「正しい鏡」）
 */

export interface LayeredReflectorOptions {
  /** 鏡面すれすれのオブジェクトの欠け対策バイアス */
  clipBias?: number
  textureWidth?: number
  textureHeight?: number
  /** MSAAサンプル数。Meta Quest (Android Chrome) の描画不具合回避には 0 */
  multisample?: number
}

const PureMirrorShader = {
  name: 'PureMirrorShader',

  uniforms: {
    tDiffuse: { value: null },
    textureMatrix: { value: null },
  },

  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;

    #include <common>
    #include <logdepthbuf_pars_vertex>

    void main() {

      vUv = textureMatrix * vec4( position, 1.0 );

      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

      #include <logdepthbuf_vertex>

    }`,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec4 vUv;

    #include <logdepthbuf_pars_fragment>

    void main() {

      #include <logdepthbuf_fragment>

      vec4 base = texture2DProj( tDiffuse, vUv );
      gl_FragColor = vec4( base.rgb, 1.0 );

      #include <tonemapping_fragment>
      #include <colorspace_fragment>

    }`,
}

export class LayeredReflector extends Mesh {
  readonly isReflector = true

  /** 反射に使う仮想カメラの layers マスク。毎フレーム反射前に適用される */
  reflectLayersMask = 0xffffffff

  /**
   * 反射レンダリングの直前に毎回呼ばれるフック。ホストが毎フレーム
   * layersを設定し直す環境でも確実に効くよう、レイヤータグ付けはここで行う
   */
  onBeforeReflect?: (scene: Scene) => void

  /** 鏡が背を向けていても反射を更新するか */
  forceUpdate = false

  /** 反射視点の仮想カメラ（このフォークでは完全に自前所有） */
  camera = new PerspectiveCamera()

  dispose: () => void

  constructor(geometry: BufferGeometry, options: LayeredReflectorOptions = {}) {
    super(geometry)

    const scope = this
    let loggedFirstPass = false // 実機診断（0.3.x安定後に撤去）

    const textureWidth = options.textureWidth || 512
    const textureHeight = options.textureHeight || 512
    const clipBias = options.clipBias || 0
    const multisample = options.multisample !== undefined ? options.multisample : 4

    const reflectorPlane = new Plane()
    const normal = new Vector3()
    const reflectorWorldPosition = new Vector3()
    const cameraWorldPosition = new Vector3()
    const rotationMatrix = new Matrix4()
    const lookAtPosition = new Vector3(0, 0, -1)
    const clipPlane = new Vector4()

    const view = new Vector3()
    const target = new Vector3()
    const q = new Vector4()

    const textureMatrix = new Matrix4()
    const virtualCamera = this.camera

    const renderTarget = new WebGLRenderTarget(textureWidth, textureHeight, {
      samples: multisample,
      type: HalfFloatType,
    })

    const material = new ShaderMaterial({
      name: PureMirrorShader.name,
      uniforms: UniformsUtils.clone(PureMirrorShader.uniforms),
      fragmentShader: PureMirrorShader.fragmentShader,
      vertexShader: PureMirrorShader.vertexShader,
    })

    material.uniforms['tDiffuse'].value = renderTarget.texture
    material.uniforms['textureMatrix'].value = textureMatrix

    this.material = material

    this.onBeforeRender = function (renderer: WebGLRenderer, scene: Scene, camera: Camera) {
      reflectorWorldPosition.setFromMatrixPosition(scope.matrixWorld)
      cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld)

      rotationMatrix.extractRotation(scope.matrixWorld)

      normal.set(0, 0, 1)
      normal.applyMatrix4(rotationMatrix)

      view.subVectors(reflectorWorldPosition, cameraWorldPosition)

      // 鏡が背を向けているときは反射を更新しない
      const isFacingAway = view.dot(normal) > 0

      if (!loggedFirstPass) {
        loggedFirstPass = true
        console.warn(`[xrift-mirror] reflect pass running (facingAway=${isFacingAway})`)
      }

      if (isFacingAway === true && scope.forceUpdate === false) return

      scope.onBeforeReflect?.(scene)

      view.reflect(normal).negate()
      view.add(reflectorWorldPosition)

      rotationMatrix.extractRotation(camera.matrixWorld)

      lookAtPosition.set(0, 0, -1)
      lookAtPosition.applyMatrix4(rotationMatrix)
      lookAtPosition.add(cameraWorldPosition)

      target.subVectors(reflectorWorldPosition, lookAtPosition)
      target.reflect(normal).negate()
      target.add(reflectorWorldPosition)

      virtualCamera.position.copy(view)
      virtualCamera.up.set(0, 1, 0)
      virtualCamera.up.applyMatrix4(rotationMatrix)
      virtualCamera.up.reflect(normal)
      virtualCamera.lookAt(target)

      virtualCamera.far = (camera as PerspectiveCamera).far // WebGLBackground が参照する

      virtualCamera.updateMatrixWorld()
      virtualCamera.projectionMatrix.copy((camera as PerspectiveCamera).projectionMatrix)

      // 「鏡に何を映すか」＝このフォークの追加点
      virtualCamera.layers.mask = scope.reflectLayersMask

      // テクスチャ行列の更新
      // prettier-ignore
      textureMatrix.set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0
      )
      textureMatrix.multiply(virtualCamera.projectionMatrix)
      textureMatrix.multiply(virtualCamera.matrixWorldInverse)
      textureMatrix.multiply(scope.matrixWorld)

      // 鏡面を近クリップ面にする斜め射影
      // http://www.terathon.com/code/oblique.html (Lengyel, Oblique View Frustum)
      reflectorPlane.setFromNormalAndCoplanarPoint(normal, reflectorWorldPosition)
      reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse)

      clipPlane.set(reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant)

      const projectionMatrix = virtualCamera.projectionMatrix

      q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0]
      q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5]
      q.z = -1.0
      q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14]

      clipPlane.multiplyScalar(2.0 / clipPlane.dot(q))

      projectionMatrix.elements[2] = clipPlane.x
      projectionMatrix.elements[6] = clipPlane.y
      projectionMatrix.elements[10] = clipPlane.z + 1.0 - clipBias
      projectionMatrix.elements[14] = clipPlane.w

      // 反射レンダリング
      scope.visible = false

      const currentRenderTarget = renderer.getRenderTarget()

      const currentXrEnabled = renderer.xr.enabled
      const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate

      renderer.xr.enabled = false // 仮想カメラがXRに書き換えられるのを防ぐ
      renderer.shadowMap.autoUpdate = false // 影の再計算を防ぐ

      renderer.setRenderTarget(renderTarget)

      renderer.state.buffers.depth.setMask(true) // デプスバッファを確実にクリア可能にする (three#18897)

      if (renderer.autoClear === false) renderer.clear()
      renderer.render(scene, virtualCamera)

      renderer.xr.enabled = currentXrEnabled
      renderer.shadowMap.autoUpdate = currentShadowAutoUpdate

      renderer.setRenderTarget(currentRenderTarget)

      // ビューポートの復元
      const viewport = (camera as PerspectiveCamera & { viewport?: Vector4 }).viewport

      if (viewport !== undefined) {
        renderer.state.viewport(viewport)
      }

      scope.visible = true
      scope.forceUpdate = false
    }

    this.dispose = function () {
      renderTarget.dispose()
      material.dispose()
    }
  }
}
