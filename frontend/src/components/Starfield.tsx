import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'

function Stars({ count = 1200 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null)
  const { positions, sizes, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const phases = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      // Create stars in multiple layers for depth
      const layer = Math.random()
      let radius, size
      
      if (layer < 0.6) {
        // Close layer - subtle background stars
        radius = THREE.MathUtils.randFloat(15, 35)
        size = THREE.MathUtils.randFloat(0.05, 0.1)
      } else if (layer < 0.85) {
        // Medium layer
        radius = THREE.MathUtils.randFloat(35, 60)
        size = THREE.MathUtils.randFloat(0.08, 0.15)
      } else {
        // Far layer
        radius = THREE.MathUtils.randFloat(60, 120)
        size = THREE.MathUtils.randFloat(0.12, 0.2)
      }
      
      const theta = Math.acos(THREE.MathUtils.randFloatSpread(2))
      const phi = THREE.MathUtils.randFloat(0, Math.PI * 2)
      positions[i * 3 + 0] = radius * Math.sin(theta) * Math.cos(phi)
      positions[i * 3 + 1] = radius * Math.cos(theta)
      positions[i * 3 + 2] = radius * Math.sin(theta) * Math.sin(phi)
      sizes[i] = size
      phases[i] = Math.random() * Math.PI * 2
    }
    return { positions, sizes, phases }
  }, [count])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const pts = pointsRef.current
    if (!pts) return
    const mat = pts.material as THREE.PointsMaterial
    
    // Very subtle twinkling effect
    const baseOpacity = 0.4
    const twinkle1 = Math.sin(t * 0.3) * 0.05
    const twinkle2 = Math.sin(t * 0.8) * 0.03
    const randomFlicker = Math.sin(t * 8) * 0.01
    mat.opacity = baseOpacity + twinkle1 + twinkle2 + randomFlicker
    
    // Subtle parallax drift
    pts.rotation.y = t * 0.005
    pts.rotation.x = Math.sin(t * 0.02) * 0.01
    pts.rotation.z = Math.cos(t * 0.015) * 0.008
  })

  const texture = useMemo(() => {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.9)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(canvas)
    tex.anisotropy = 4
    return tex
  }, [])

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={texture}
        sizeAttenuation={true}
        transparent={true}
        depthWrite={false}
        color="#ffffff"
        size={0.3}
        opacity={0.4}
      />
    </points>
  )
}

function Scene() {
  return (
    <group>
      <ambientLight intensity={0.1} />
      <Stars count={800} />
    </group>
  )
}

export default function Starfield() {
  return (
    <Canvas camera={{ position: [0, 0, 1], fov: 75 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <color attach="background" args={[0, 0, 0]} />
      <Scene />
    </Canvas>
  )
}
