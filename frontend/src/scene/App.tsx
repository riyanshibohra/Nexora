import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

// Types based on the tavily_search_tool output
type TavilySearchOutput = {
  title: string
  url: string
  content: string
}

type DatasetPlanet = {
  id: string
  title: string
  url: string
  content: string
  size: number
  type: 'tabular' | 'images' | 'text' | 'other'
  position: THREE.Vector3
  mesh: THREE.Mesh
  glow: THREE.Mesh
}

type UIState = 'landing' | 'searching' | 'results' | 'detail'

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [uiState, setUiState] = useState<UIState>('landing')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<TavilySearchOutput[]>([])
  const [selectedPlanet, setSelectedPlanet] = useState<DatasetPlanet | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Three.js scene setup
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const composerRef = useRef<EffectComposer | null>(null)
  const planetsRef = useRef<DatasetPlanet[]>([])
  const starsRef = useRef<THREE.Points | null>(null)
  const animationIdRef = useRef<number | null>(null)

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.outputColorSpace = THREE.SRGBColorSpace
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000011)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
    camera.position.set(0, 0, 75)
    cameraRef.current = camera

    // Lighting
    const ambient = new THREE.AmbientLight(0x1a1a2e, 0.3)
    scene.add(ambient)
    
    const hemi = new THREE.HemisphereLight(0x4a90e2, 0x0a0a14, 0.6)
    scene.add(hemi)
    
    const dir = new THREE.DirectionalLight(0x4a90e2, 0.8)
    dir.position.set(6, 12, 10)
    scene.add(dir)

    // Stars background
    const starsGeometry = new THREE.BufferGeometry()
    const starCount = 2000
    const positions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 1000
      positions[i * 3 + 1] = (Math.random() - 0.5) * 1000
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1000
    }
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const starsMaterial = new THREE.PointsMaterial({ 
      color: 0x8ea0ff, 
      size: 0.8, 
      sizeAttenuation: true, 
      transparent: true, 
      opacity: 0.8 
    })
    const stars = new THREE.Points(starsGeometry, starsMaterial)
    scene.add(stars)
    starsRef.current = stars

    // Postprocessing
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 
      0.3, 0.8, 0.01
    )
    composer.addPass(bloom)
    composerRef.current = composer

    // Animation loop
    const animate = () => {
      if (starsRef.current) {
        starsRef.current.rotation.y += 0.0001
      }
      
      if (planetsRef.current.length > 0) {
        planetsRef.current.forEach(planet => {
          planet.mesh.rotation.y += 0.01
          planet.glow.rotation.y += 0.01
        })
      }
      
      composer.render()
      animationIdRef.current = requestAnimationFrame(animate)
    }
    animate()

    // Handle window resize
    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight)
      composer.setSize(window.innerWidth, window.innerHeight)
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
      renderer.dispose()
      starsGeometry.dispose()
      starsMaterial.dispose()
    }
  }, [])

  // Create planets from search results
  useEffect(() => {
    if (!sceneRef.current || !searchResults.length) return

    // Clear existing planets
    planetsRef.current.forEach(planet => {
      sceneRef.current!.remove(planet.mesh)
      sceneRef.current!.remove(planet.glow)
    })
    planetsRef.current = []

    // Create new planets
    const radius = 40
    const numResults = searchResults.length
    
    searchResults.forEach((result, idx) => {
      // Calculate position in a spherical formation
      const theta = (idx / numResults) * Math.PI * 2
      const phi = Math.acos(2 * (idx / numResults) - 1)
      const r = radius + Math.random() * 15 + (idx % 3) * 5 // Add some variation
      
      const position = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      )

      // Determine dataset type and color based on content analysis
      const type = determineDatasetType(result.content)
      const color = getTypeColor(type)
      
      // Calculate planet size based on content length and relevance
      const contentLength = result.content.length
      const titleLength = result.title.length
      const baseSize = 1.5
      const sizeMultiplier = Math.min(3, Math.max(0.5, (contentLength + titleLength) / 200))
      const size = baseSize + sizeMultiplier

      // Create planet mesh with better materials
      const planetGeometry = new THREE.SphereGeometry(size, 32, 32)
      const planetMaterial = new THREE.MeshPhongMaterial({ 
        color: color,
        emissive: color.clone().multiplyScalar(0.3),
        shininess: 100,
        transparent: true,
        opacity: 0.9
      })
      const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial)
      planetMesh.position.copy(position)
      planetMesh.userData = { result, type, size: size }

      // Create enhanced glow effect
      const glowGeometry = new THREE.SphereGeometry(size * 1.8, 32, 32)
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.2,
        side: THREE.BackSide
      })
      const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial)
      glowMesh.position.copy(position)

      // Add to scene
      sceneRef.current!.add(planetMesh)
      sceneRef.current!.add(glowMesh)

      // Store planet data
      const planet: DatasetPlanet = {
        id: `planet-${idx}`,
        title: result.title,
        url: result.url,
        content: result.content,
        size,
        type,
        position,
        mesh: planetMesh,
        glow: glowMesh
      }
      planetsRef.current.push(planet)
    })

    // Animate camera to show all planets
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 0, 100)
    }
  }, [searchResults])

  // Handle planet clicks
  useEffect(() => {
    if (!canvasRef.current || !planetsRef.current.length) return

    const canvas = canvasRef.current
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    const handleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, cameraRef.current!)
      const intersects = raycaster.intersectObjects(planetsRef.current.map(p => p.mesh))

      if (intersects.length > 0) {
        const clickedMesh = intersects[0].object
        const planet = planetsRef.current.find(p => p.mesh === clickedMesh)
        if (planet) {
          setSelectedPlanet(planet)
          setUiState('detail')
          
          // Zoom camera to planet
          if (cameraRef.current) {
            const targetPosition = planet.position.clone().multiplyScalar(1.5)
            cameraRef.current.position.lerp(targetPosition, 0.1)
          }
        }
      }
    }

    canvas.addEventListener('click', handleClick)
    return () => canvas.removeEventListener('click', handleClick)
  }, [searchResults])

  // Search function
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    
    setIsSearching(true)
    setError(null)
    
    try {
      // Call the backend API that simulates tavily_search_tool
      const response = await fetch('http://localhost:8000/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: searchQuery }),
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      setSearchResults(data.results)
      setUiState('results')
    } catch (err: any) {
      setError(err.message || 'Search failed. Make sure the backend is running on http://localhost:8000')
    } finally {
      setIsSearching(false)
    }
  }

  // Helper functions
  const determineDatasetType = (content: string): 'tabular' | 'images' | 'text' | 'other' => {
    const lowerContent = content.toLowerCase()
    const lowerTitle = content.toLowerCase()
    
    // Check for tabular data indicators
    if (lowerContent.includes('csv') || lowerContent.includes('excel') || 
        lowerContent.includes('table') || lowerContent.includes('spreadsheet') ||
        lowerContent.includes('dataframe') || lowerContent.includes('columns') ||
        lowerContent.includes('rows') || lowerContent.includes('tabular')) {
      return 'tabular'
    }
    
    // Check for image data indicators
    if (lowerContent.includes('image') || lowerContent.includes('photo') || 
        lowerContent.includes('picture') || lowerContent.includes('visual') ||
        lowerContent.includes('vision') || lowerContent.includes('computer vision') ||
        lowerContent.includes('classification') || lowerContent.includes('detection')) {
      return 'images'
    }
    
    // Check for text data indicators
    if (lowerContent.includes('text') || lowerContent.includes('document') || 
        lowerContent.includes('article') || lowerContent.includes('news') ||
        lowerContent.includes('nlp') || lowerContent.includes('natural language') ||
        lowerContent.includes('sentiment') || lowerContent.includes('language model') ||
        lowerContent.includes('translation') || lowerContent.includes('summarization')) {
      return 'text'
    }
    
    // Check for time series data
    if (lowerContent.includes('time series') || lowerContent.includes('temporal') ||
        lowerContent.includes('forecasting') || lowerContent.includes('trend') ||
        lowerContent.includes('sequence') || lowerContent.includes('chronological')) {
      return 'tabular'
    }
    
    // Check for audio data
    if (lowerContent.includes('audio') || lowerContent.includes('sound') ||
        lowerContent.includes('speech') || lowerContent.includes('music') ||
        lowerContent.includes('voice') || lowerContent.includes('acoustic')) {
      return 'other'
    }
    
    // Check for graph/network data
    if (lowerContent.includes('graph') || lowerContent.includes('network') ||
        lowerContent.includes('social') || lowerContent.includes('relationship') ||
        lowerContent.includes('connection') || lowerContent.includes('node')) {
      return 'other'
    }
    
    return 'other'
  }

  const getTypeColor = (type: string): THREE.Color => {
    switch (type) {
      case 'tabular': return new THREE.Color(0x4a90e2) // Blue
      case 'images': return new THREE.Color(0x9b59b6) // Purple
      case 'text': return new THREE.Color(0x2ecc71) // Green
      default: return new THREE.Color(0xe74c3c) // Red
    }
  }

  const getTypeIcon = (type: string): string => {
    switch (type) {
      case 'tabular': return '📊'
      case 'images': return '🖼️'
      case 'text': return '📝'
      default: return '🔮'
    }
  }

  const handleBackToResults = () => {
    setSelectedPlanet(null)
    setUiState('results')
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 0, 100)
    }
  }

  const handleBackToLanding = () => {
    setSearchResults([])
    setSelectedPlanet(null)
    setUiState('landing')
    setSearchQuery('')
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 0, 75)
    }
  }

  return (
    <>
      {/* Landing Page - The Observatory */}
      {uiState === 'landing' && (
        <div className="landing-overlay">
          <div className="landing-content">
            <h1 className="nexora-title">Nexora</h1>
            <div className="search-container">
              <input
                type="text"
                placeholder="Type a query... watch datasets appear in your universe"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="search-input"
              />
              <button 
                onClick={handleSearch}
                className="search-button"
                disabled={isSearching}
              >
                {isSearching ? 'Searching...' : '🔭 Explore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results Page - The Data Galaxy */}
      {uiState === 'results' && (
        <div className="results-overlay">
          <div className="results-header">
            <button onClick={handleBackToLanding} className="back-button">
              ← Back to Observatory
            </button>
            <h2>Data Galaxy</h2>
            <p>{searchResults.length} datasets discovered</p>
          </div>
          <div className="legend">
            <div className="legend-item">
              <span className="legend-color blue"></span>
              <span>Tabular Data</span>
            </div>
            <div className="legend-item">
              <span className="legend-color purple"></span>
              <span>Images</span>
            </div>
            <div className="legend-item">
              <span className="legend-color green"></span>
              <span>Text</span>
            </div>
            <div className="legend-item">
              <span className="legend-color red"></span>
              <span>Other</span>
            </div>
          </div>
        </div>
      )}

      {/* Detail Page - Zoomed-In Planet View */}
      {uiState === 'detail' && selectedPlanet && (
        <div className="detail-overlay">
          <div className="spaceship-hud">
            <div className="hud-header">
              <button onClick={handleBackToResults} className="back-button">
                ← Back to Galaxy
              </button>
              <h3>Planet Data</h3>
            </div>
            <div className="hud-content">
              <div className="planet-info">
                <div className="planet-header">
                  <span className="planet-type-icon">{getTypeIcon(selectedPlanet.type)}</span>
                  <h4>{selectedPlanet.title}</h4>
                </div>
                <span className="planet-type-badge">{selectedPlanet.type} dataset</span>
                <p className="planet-description">{selectedPlanet.content}</p>
                <div className="planet-metrics">
                  <div className="metric">
                    <span className="metric-label">Content Length:</span>
                    <span className="metric-value">{selectedPlanet.content.length} characters</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Planet Size:</span>
                    <span className="metric-value">{selectedPlanet.size.toFixed(1)} units</span>
                  </div>
                </div>
              </div>
              <div className="planet-actions">
                <a 
                  href={selectedPlanet.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="action-button primary"
                >
                  🌐 View on Kaggle
                </a>
                <button className="action-button secondary">
                  📥 Download Dataset
                </button>
                <button className="action-button secondary">
                  ⭐ Add to My Galaxy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Canvas */}
      <canvas ref={canvasRef} className="main-canvas" />
      
      {/* Loading and Error States */}
      {isSearching && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>Searching the data universe...</p>
        </div>
      )}
      
      {error && (
        <div className="error-overlay">
          <p className="error-message">{error}</p>
          <button onClick={() => setError(null)} className="error-close">×</button>
        </div>
      )}
    </>
  )
}


