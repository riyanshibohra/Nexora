// @ts-nocheck
import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'

function FloatingDots({ count = 120 }: { count?: number }) {
  const mesh = useRef<THREE.Points>(null)
  
  const { positions, scales, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const scales = new Float32Array(count)
    const phases = new Float32Array(count)
    
    for (let i = 0; i < count; i++) {
      // More distributed and organic placement
      positions[i * 3] = (Math.random() - 0.5) * 50
      positions[i * 3 + 1] = (Math.random() - 0.5) * 30
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8
      
      scales[i] = 0.3 + Math.random() * 0.6
      phases[i] = Math.random() * Math.PI * 2
    }
    
    return { positions, scales, phases }
  }, [count])
  
  useFrame(({ clock, mouse }) => {
    if (!mesh.current) return
    
    const time = clock.getElapsedTime()
    const positions = mesh.current.geometry.attributes.position.array as Float32Array
    
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      
      // Gentle floating motion
      positions[i3 + 1] += Math.sin(time * 0.5 + phases[i]) * 0.002
      positions[i3] += Math.cos(time * 0.3 + phases[i] * 0.7) * 0.001
      
      // Subtle mouse influence
      const dx = mouse.x * 15 - positions[i3]
      const dy = mouse.y * 8 - positions[i3 + 1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      if (dist < 6) {
        const influence = (6 - dist) / 6 * 0.0003
        positions[i3] += dx * influence
        positions[i3 + 1] += dy * influence
      }
    }
    
    mesh.current.geometry.attributes.position.needsUpdate = true
    
    // Subtle material pulsing
    const material = mesh.current.material as THREE.PointsMaterial
    material.opacity = 0.4 + Math.sin(time * 0.8) * 0.1
  })
  
  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={count}
          array={scales}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        size={1.8}
        color="#6bb6ff"
        transparent
        opacity={0.6}
        sizeAttenuation={false}
        vertexColors={false}
      />
    </points>
  )
}

function SubtleWaves() {
  const mesh = useRef<THREE.Mesh>(null)
  
  useFrame(({ clock }) => {
    if (!mesh.current) return
    
    const time = clock.getElapsedTime()
    const geometry = mesh.current.geometry as THREE.PlaneGeometry
    const positions = geometry.attributes.position.array as Float32Array
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]
      const y = positions[i + 1]
      positions[i + 2] = Math.sin(x * 0.1 + time * 0.5) * Math.cos(y * 0.1 + time * 0.3) * 0.3
    }
    
    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals()
  })
  
  return (
    <mesh ref={mesh} position={[0, 0, -8]} rotation={[-Math.PI / 6, 0, 0]}>
      <planeGeometry args={[40, 25, 32, 20]} />
      <meshBasicMaterial
        color="#1a4b7a"
        transparent
        opacity={0.08}
        wireframe
      />
    </mesh>
  )
}

function Scene() {
  const { viewport } = useThree()
  
  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[20, 20, 20]} color="#6bb6ff" intensity={0.3} />
      <pointLight position={[-20, -10, 10]} color="#9d4edd" intensity={0.2} />
      
      <FloatingDots count={100} />
      <SubtleWaves />
    </>
  )
}

export default function DataMesh() {
  return (
    <Canvas 
      camera={{ position: [0, 0, 20], fov: 50 }} 
      dpr={[1, 2]} 
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={[0.01, 0.02, 0.05]} />
      <Scene />
    </Canvas>
  )
}


