// @ts-nocheck
import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, Text } from '@react-three/drei'

function DatasetNodes({ count = 25 }: { count?: number }) {
  const group = useRef<THREE.Group>(null)
  
  const nodes = useMemo(() => {
    const nodeData = []
    for (let i = 0; i < count; i++) {
      nodeData.push({
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 16,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 4
        ),
        size: 0.8 + Math.random() * 0.4,
        color: ['#4a9eff', '#00ff88', '#ff6b6b', '#ffd700'][Math.floor(Math.random() * 4)],
        pulseSpeed: 1 + Math.random() * 2
      })
    }
    return nodeData
  }, [count])
  
  useFrame(({ clock, mouse }) => {
    if (!group.current) return
    const time = clock.getElapsedTime()
    
    group.current.children.forEach((node, i) => {
      const data = nodes[i]
      const pulse = Math.sin(time * data.pulseSpeed) * 0.1 + 1
      node.scale.setScalar(data.size * pulse)
      
      // Gentle mouse attraction
      const mouseInfluence = new THREE.Vector3(mouse.x * 8, mouse.y * 6, 0)
      const distance = node.position.distanceTo(mouseInfluence)
      if (distance < 4) {
        node.position.lerp(mouseInfluence, 0.002)
      }
    })
  })
  
  return (
    <group ref={group}>
      {nodes.map((node, i) => (
        <mesh key={i} position={node.position}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial 
            color={node.color} 
            transparent 
            opacity={0.7}
            wireframe={i % 3 === 0}
          />
        </mesh>
      ))}
    </group>
  )
}

function DataConnections() {
  const group = useRef<THREE.Group>(null)
  
  const connections = useMemo(() => {
    const lines = []
    for (let i = 0; i < 15; i++) {
      lines.push({
        start: new THREE.Vector3(
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 3
        ),
        end: new THREE.Vector3(
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 3
        ),
        phase: Math.random() * Math.PI * 2
      })
    }
    return lines
  }, [])
  
  useFrame(({ clock }) => {
    if (!group.current) return
    const time = clock.getElapsedTime()
    
    group.current.children.forEach((line, i) => {
      const material = (line as any).material
      const pulse = Math.sin(time * 1.5 + connections[i].phase) * 0.5 + 0.5
      material.opacity = 0.1 + pulse * 0.3
    })
  })
  
  return (
    <group ref={group}>
      {connections.map((conn, i) => (
        <Line
          key={i}
          points={[conn.start, conn.end]}
          color="#4a9eff"
          transparent
          opacity={0.2}
          lineWidth={1.5}
          dashed
        />
      ))}
    </group>
  )
}

function FloatingLabels() {
  const labels = [
    { text: 'CSV', position: [-5, 3, 1] },
    { text: 'JSON', position: [4, -2, -1] },
    { text: 'ML', position: [-2, -4, 2] },
    { text: 'API', position: [6, 2, 0] }
  ]
  
  return (
    <>
      {labels.map((label, i) => (
        <Text
          key={i}
          position={label.position}
          fontSize={0.8}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {label.text}
        </Text>
      ))}
    </>
  )
}

function Scene() {
  const { viewport } = useThree()
  
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} color="#6bb6ff" intensity={0.5} />
      
      <DatasetNodes count={20} />
      <DataConnections />
      <FloatingLabels />
    </>
  )
}

export default function InteractiveVisualization() {
  return (
    <div className="dataset-viz">
      <Canvas 
        camera={{ position: [0, 0, 18], fov: 50 }} 
        dpr={[1, 2]} 
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={[0.05, 0.08, 0.12]} />
        <Scene />
      </Canvas>
    </div>
  )
}
