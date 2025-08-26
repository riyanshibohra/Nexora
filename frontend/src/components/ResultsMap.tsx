// @ts-nocheck
import React, { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Line, Html } from '@react-three/drei'

export type Dataset = {
  id: string
  source_url: string
  source_id?: string | null
  display_name?: string | null
  description?: string | null
  possibilities?: string | null
  num_files: number
}

type NodeSpec = {
  dataset: Dataset
  position: THREE.Vector3
}

function seededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6D2B79F5
    let t = Math.imul(h ^ h >>> 15, 1 | h)
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function prettyTitle(slugish: string): string {
  const s = slugish.replace(/[-_]+/g, ' ').trim()
  return s.replace(/\b\w/g, c => c.toUpperCase())
}
function titleFor(ds: Dataset): string {
  const base = ds.display_name || ds.source_id || new URL(ds.source_url).pathname.split('/').filter(Boolean).slice(-1)[0] || 'Dataset'
  return prettyTitle(base)
}

function colorForType(kind?: string | null): string {
  const k = (kind || '').toLowerCase()
  if (k === 'classification') return '#78d4ff'
  if (k === 'regression') return '#7ce3b8'
  if (k === 'time_series') return '#a0a8ff'
  if (k === 'clustering') return '#f6b2ff'
  if (k === 'text_generation') return '#ffd18c'
  if (k === 'image_generation') return '#ff9aa9'
  return '#93b6f0'
}

function generateNodesScatter(datasets: Dataset[], viewportWidth: number, viewportHeight: number): { nodes: NodeSpec[], cell: { w: number, h: number } } {
  const n = Math.max(datasets.length, 1)
  // Use ~golden coverage area within viewport to keep margins
  const usableW = viewportWidth * 0.86
  const usableH = viewportHeight * 0.72
  const aspect = usableW / usableH
  const cols = Math.ceil(Math.sqrt(n * aspect))
  const rows = Math.ceil(n / cols)
  const cellW = usableW / cols
  const cellH = usableH / rows
  const left = -usableW / 2
  const top = usableH / 2
  const nodes: NodeSpec[] = []
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols)
    const c = i % cols
    const ds = datasets[i]
    const rand = seededRandom(`${ds.id || ds.source_url || i}`)
    // Organic jitter within each cell, with slight column staggering
    const jitterX = (rand() - 0.5) * cellW * 0.28 + (c % 2 === 0 ? -cellW * 0.06 : cellW * 0.06)
    const jitterY = (rand() - 0.5) * cellH * 0.36
    const cx = left + (c + 0.5) * cellW + jitterX
    const cy = top - (r + 0.5) * cellH + jitterY
    nodes.push({ dataset: datasets[i], position: new THREE.Vector3(cx, cy, 0) })
  }
  return { nodes, cell: { w: cellW, h: cellH } }
}

function computeConnections(nodes: NodeSpec[], threshold: number): [THREE.Vector3, THREE.Vector3][] {
  const pairs: [THREE.Vector3, THREE.Vector3][] = []
  for (let i = 0; i < nodes.length; i++) {
    const distances: { j: number, d: number }[] = []
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue
      const d = nodes[i].position.distanceTo(nodes[j].position)
      if (d <= threshold) distances.push({ j, d })
    }
    distances.sort((a, b) => a.d - b.d)
    distances.slice(0, 2).forEach(n => pairs.push([nodes[i].position, nodes[n.j].position]))
  }
  return pairs
}

function createHaloTexture(): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2)
  g.addColorStop(0, 'rgba(130,170,220,0.55)')
  g.addColorStop(0.35, 'rgba(130,170,220,0.20)')
  g.addColorStop(1, 'rgba(130,170,220,0.0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.anisotropy = 4
  return tex
}

function CircleNode({ node, onClick, onHover, baseSize, weight }: { node: NodeSpec, onClick: (ds: Dataset) => void, onHover: (ds: Dataset | null) => void, baseSize: number, weight: number }) {
  const haloTex = useMemo(() => createHaloTexture(), [])
  const grp = useRef<THREE.Group>(null)
  const [isHover, setIsHover] = useState(false)
  useFrame(({ clock }) => {
    if (!grp.current) return
    const t = clock.getElapsedTime()
    const s = 1 + Math.sin(t * 1.6) * 0.02
    grp.current.scale.setScalar(s)
  })
  const size = baseSize * (0.9 + 0.2 * weight)
  return (
    <group ref={grp} position={node.position.toArray()} onClick={() => onClick(node.dataset)} onPointerOver={() => { setIsHover(true); onHover(node.dataset) }} onPointerOut={() => { setIsHover(false); onHover(null) }}>
      <sprite scale={[size * 1.6, size * 1.6, 1]}>
        <spriteMaterial map={haloTex} color={new THREE.Color(colorForType(node.dataset.possibilities))} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={isHover ? 0.65 : 0.38} />
      </sprite>
      <mesh>
        <circleGeometry args={[size * 1.3, 36]} />
        <meshStandardMaterial color={new THREE.Color(colorForType(node.dataset.possibilities))} emissive={new THREE.Color('#4e81c1')} emissiveIntensity={isHover ? 0.35 : 0.22} roughness={0.88} metalness={0.04} />
      </mesh>
      {isHover && (
        <mesh>
          <ringGeometry args={[size * 1.45, size * 1.55, 64]} />
          <meshBasicMaterial color="#cfe0ff" transparent opacity={0.35} />
        </mesh>
      )}
      <Html center distanceFactor={10} style={{ pointerEvents: 'none' }}>
        <div style={{ fontSize: 13, color: isHover ? '#eaf2ff' : '#cfe0ff', background: 'rgba(10,16,28,0.55)', padding: '3px 8px', borderRadius: 6, border: '1px solid #21314a', backdropFilter: 'blur(2px)', whiteSpace: 'nowrap' }}>
          {titleFor(node.dataset)}
        </div>
      </Html>
    </group>
  )
}

function Scene({ datasets, onSelect }: { datasets: Dataset[], onSelect: (ds: Dataset) => void }) {
  const groupRef = useRef<THREE.Group>(null)
  const { viewport } = useThree()
  const layout = useMemo(() => generateNodesScatter(datasets, viewport.width, viewport.height), [datasets, viewport.width, viewport.height])
  const nodes = layout.nodes
  const baseSize = Math.min(layout.cell.w, layout.cell.h) * 0.22
  // Simple relevance weight based on num_files (proxy). Normalize 0..1 across datasets
  const weights = useMemo(() => {
    const vals = datasets.map(d => d.num_files || 0)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const span = Math.max(1, max - min)
    return datasets.map(d => (d.num_files - min) / span)
  }, [datasets])
  // Connect as a closed ring to ensure continuity
  const pairs = useMemo(() => {
    const ring: [THREE.Vector3, THREE.Vector3][] = []
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i].position
      const b = nodes[(i + 1) % nodes.length].position
      ring.push([a, b])
    }
    return ring
  }, [nodes])
  const [hovered, setHovered] = useState<Dataset | null>(null)

  // Static orientation (no 3D tilt)
  useFrame(() => {})

  return (
    <>
      {/* Background meshes removed to avoid dark rectangular banding; Starfield provides ambience */}
      {/* Removed large color sprites to avoid rectangular bands */}
      <ambientLight intensity={0.6} />
      <pointLight position={[10, 10, 10]} intensity={0.9} color="#9fc1ff" />
      <group ref={groupRef} position={[0, -0.5, 0]}>
        {pairs.map((p, idx) => (
          <Line key={idx} points={[p[0], p[1]]} color="#a3bcff" opacity={0.28} transparent lineWidth={1.4} />
        ))}
        {nodes.map((n, idx) => (
          <CircleNode key={idx} node={n} onClick={onSelect} onHover={setHovered} baseSize={baseSize} weight={weights[idx] ?? 0.5} />
        ))}
      </group>
      <OrbitControls enableDamping dampingFactor={0.06} rotateSpeed={0.25} zoomSpeed={0.6} panSpeed={0.5} minDistance={14} maxDistance={90} enableRotate={false} />
      {hovered && (
        <Html position={[0, -12.5, 0]}>
          <div className="hovercard">
            <div className="hovercard-title">{titleFor(hovered)}</div>
            <div className="hovercard-sub">{hovered.possibilities ? `Type: ${hovered.possibilities}` : 'Type: —'} • Files: {hovered.num_files}</div>
            <div className="hovercard-note">Click to open full details</div>
          </div>
        </Html>
      )}
    </>
  )
}

export default function ResultsMap({ datasets, onSelect }: { datasets: Dataset[], onSelect: (ds: Dataset) => void }) {
  return (
    <Canvas className="canvas3d" camera={{ position: [0, 0, 40], fov: 55 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <color attach="background" args={[0, 0, 0]} />
      <Scene datasets={datasets} onSelect={onSelect} />
    </Canvas>
  )
}
