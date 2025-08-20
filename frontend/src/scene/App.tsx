import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

type AnalysisItem = {
  id: string
  display_name: string
  source_id: string
  aggregate_stats?: { total_rows?: number }
  num_files?: number
  updated_at?: number
}

type AnalysesResponse = {
  total: number
  limit: number
  offset: number
  analyses: AnalysisItem[]
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [items, setItems] = useState<AnalysisItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAnalyses = async () => {
      try {
        const res = await fetch('/analyses?limit=200&sort=rows')
        const raw = await res.text()
        if (!res.ok) {
          throw new Error(raw || `HTTP ${res.status} ${res.statusText}`)
        }
        let data: AnalysesResponse | null = null
        try {
          data = raw ? JSON.parse(raw) : null
        } catch (_) {
          throw new Error('Backend returned a non‑JSON response. Is the API running on http://localhost:8000?')
        }
        setItems(data?.analyses || [])
      } catch (e: any) {
        setError(e?.message || 'Failed to load analyses. Ensure the backend is running on http://localhost:8000')
      } finally {
        setLoading(false)
      }
    }
    fetchAnalyses()
  }, [])

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
    camera.position.set(0, 0, 75)

    const ambient = new THREE.AmbientLight(0xbec8ff, 0.45)
    scene.add(ambient)
    const hemi = new THREE.HemisphereLight(0xd7ddff, 0x0a0a14, 0.55)
    scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xdbe3ff, 0.9)
    dir.position.set(6, 12, 10)
    scene.add(dir)

    // Subtle environment reflections
    const pmrem = new THREE.PMREMGenerator(renderer)
    const env = new RoomEnvironment()
    const envMap = pmrem.fromScene(env).texture
    scene.environment = envMap
    pmrem.dispose()

    // Postprocessing glow
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.25, 0.8, 0.01)
    composer.addPass(bloom)

    // Stars background
    const starsGeometry = new THREE.BufferGeometry()
    const starCount = 1200
    const positions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 800
      positions[i * 3 + 1] = (Math.random() - 0.5) * 800
      positions[i * 3 + 2] = (Math.random() - 0.5) * 800
    }
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const starsMaterial = new THREE.PointsMaterial({ color: 0x8ea0ff, size: 0.6, sizeAttenuation: true, transparent: true, opacity: 0.75 })
    const stars = new THREE.Points(starsGeometry, starsMaterial)
    scene.add(stars)

    // Datasets as soft glow sprites (no spheres)
    const group = new THREE.Group()
    scene.add(group)

    const datasetSprites: THREE.Sprite[] = []
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x1d2b55, transparent: true, opacity: 0.12 })
    const seed = 42
    const rng = mulberry32(seed)

    const radius = 35
    // Pre-rendered radial gradient texture for soft glow
    const glowTexture = (() => {
      const size = 128
      const cnv = document.createElement('canvas')
      cnv.width = cnv.height = size
      const ctx = cnv.getContext('2d')!
      const g = ctx.createRadialGradient(size/2, size/2, size*0.1, size/2, size/2, size*0.5)
      g.addColorStop(0.0, 'rgba(255,255,255,1)')
      g.addColorStop(0.25, 'rgba(255,255,255,0.65)')
      g.addColorStop(0.6, 'rgba(255,255,255,0.15)')
      g.addColorStop(1.0, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0,0,size,size)
      const tex = new THREE.CanvasTexture(cnv)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.needsUpdate = true
      return tex
    })()
    const palette = [
      new THREE.Color('#b1c5ff'),
      new THREE.Color('#c8d3ff'),
      new THREE.Color('#b6e3ff'),
      new THREE.Color('#d7e1ff'),
      new THREE.Color('#c9e4e7'),
    ]
    items.forEach((item, idx) => {
      const theta = rng() * Math.PI * 2
      const phi = Math.acos(2 * rng() - 1)
      const r = radius + rng() * 25
      const pos = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      )

      const base = palette[idx % palette.length]
      const spriteMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: base,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const sprite = new THREE.Sprite(spriteMat)
      const size = 2.0 + Math.min(5.0, Math.log10((item.aggregate_stats?.total_rows || 10) + 10))
      sprite.position.copy(pos)
      sprite.scale.set(size, size, 1)
      sprite.userData = { item }
      group.add(sprite)
      datasetSprites.push(sprite)
    })

    // Optional faint connections
    for (let i = 0; i < Math.min(120, datasetSprites.length); i++) {
      const a = datasetSprites[Math.floor(rng() * datasetSprites.length)]
      const b = datasetSprites[Math.floor(rng() * datasetSprites.length)]
      if (!a || !b || a === b) continue
      const geo = new THREE.BufferGeometry().setFromPoints([a.position, b.position])
      const line = new THREE.Line(geo, lineMaterial)
      group.add(line)
    }

    // Fade-in and slow camera dolly
    let t = 0
    const animate = () => {
      t += 0.005
      camera.position.z = 75 - easeOutCubic(Math.min(1, t / 1.5)) * 25
      group.rotation.y += 0.00035
      group.rotation.x = 0.015
      stars.rotation.y += 0.0002
      composer.render()
      requestAnimationFrame(animate)
    }
    animate()

    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight)
      composer.setSize(window.innerWidth, window.innerHeight)
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      starsGeometry.dispose()
      starsMaterial.dispose()
    }
  }, [items])

  return (
    <>
      <div className="hero">
        <div className="hero-inner">
          <h1>Nexora: AI‑Powered Dataset Discovery</h1>
          <div className="subtitle">A world of data, ready when you are.</div>
        </div>
      </div>
      <canvas ref={canvasRef} />
      {loading && <div className="caption">Loading the galaxy…</div>}
      {error && <div className="caption">{error}</div>}
    </>
  )
}

function mulberry32(a: number) {
  return function() {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function easeOutCubic(x: number) {
  return 1 - Math.pow(1 - x, 3)
}


