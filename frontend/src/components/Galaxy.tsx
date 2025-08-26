import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Line } from '@react-three/drei'

type NodeSpec = {
  position: THREE.Vector3
  radius: number
  color: string
}

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function generateNodes(count: number): NodeSpec[] {
  const nodes: NodeSpec[] = []
  const colors = [
    '#79a8ff',
    '#8bd3ff',
    '#a0a8ff',
    '#66e0ff',
    '#6aa9ff',
    '#b7c7ff',
  ]
  for (let i = 0; i < count; i++) {
    // Position on a sphere shell with some jitter
    const r = randBetween(16, 28)
    const theta = Math.acos(randBetween(-1, 1))
    const phi = randBetween(0, Math.PI * 2)
    const x = r * Math.sin(theta) * Math.cos(phi) + randBetween(-2, 2)
    const y = r * Math.cos(theta) + randBetween(-2, 2)
    const z = r * Math.sin(theta) * Math.sin(phi) + randBetween(-2, 2)
    nodes.push({
      position: new THREE.Vector3(x, y, z),
      radius: randBetween(0.4, 1.6),
      color: colors[Math.floor(Math.random() * colors.length)],
    })
  }
  return nodes
}

function computeConnections(nodes: NodeSpec[], maxDistance = 12): [THREE.Vector3, THREE.Vector3][] {
  const pairs: [THREE.Vector3, THREE.Vector3][] = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].position
      const b = nodes[j].position
      if (a.distanceTo(b) <= maxDistance) {
        pairs.push([a, b])
      }
    }
  }
  return pairs
}

function Planets({ nodes }: { nodes: NodeSpec[] }) {
  return (
    <group>
      {nodes.map((n, idx) => (
        <mesh key={idx} position={n.position.toArray()}>
          <sphereGeometry args={[n.radius, 24, 24]} />
          <meshStandardMaterial color={n.color} emissive={n.color} emissiveIntensity={0.2} roughness={0.6} metalness={0.1} />
        </mesh>
      ))}
    </group>
  )
}

function Connections({ pairs }: { pairs: [THREE.Vector3, THREE.Vector3][] }) {
  return (
    <group>
      {pairs.map((p, idx) => (
        <Line key={idx} points={[p[0], p[1]]} color="#7fa6ff" opacity={0.25} transparent lineWidth={1} />
      ))}
    </group>
  )
}

function Scene() {
  const groupRef = useRef<THREE.Group>(null)
  const nodes = useMemo(() => generateNodes(34), [])
  const pairs = useMemo(() => computeConnections(nodes, 11.5), [nodes])

  useFrame((_state, delta) => {
    if (!groupRef.current) return
    groupRef.current.rotation.y += delta * 0.06
    groupRef.current.rotation.x += delta * 0.018
  })

  return (
    <>
      <ambientLight intensity={0.7} />
      <pointLight position={[8, 12, 10]} intensity={1.2} color="#9fc1ff" />
      <group ref={groupRef}>
        <Planets nodes={nodes} />
        <Connections pairs={pairs} />
      </group>
      <OrbitControls enableDamping dampingFactor={0.08} rotateSpeed={0.45} zoomSpeed={0.6} panSpeed={0.5} minDistance={12} maxDistance={80} />
    </>
  )
}

export default function Galaxy() {
  return (
    <Canvas camera={{ position: [0, 0, 40], fov: 55 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <color attach="background" args={[0, 0, 0]} />
      <Scene />
    </Canvas>
  )
}


