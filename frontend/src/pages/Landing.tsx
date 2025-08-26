import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import DataMesh from '../components/DataMesh'
import TypewriterText from '../components/TypewriterText'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000'

export default function Landing() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  async function onExplore(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!query.trim()) return
    setLoading(true)
    
    console.log('Making request to:', `${API_BASE}/run-agent`)
    console.log('Query:', query)
    
    try {
      const res = await fetch(`${API_BASE}/run-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      
      console.log('Response status:', res.status)
      console.log('Response ok:', res.ok)
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      console.log('Success! Got data:', data)
      navigate('/results', { state: { result: data } })
    } catch (err: any) {
      console.error('Request failed:', err)
      setError(err?.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="landing-container">
      <div className="landing-background">
        <DataMesh />
      </div>
      
      <div className="landing-content">
        <div className="landing-center">
          <div className="brand-section">
            <h1 className="brand-title">Nexora</h1>
            <p className="brand-subtitle">Find the dataset. Spark the idea.</p>
          </div>
          
          <div className="hero-section">
            
            <div className="hero-text">
              <span className="hero-prefix">Explore </span>
              <span className="typewriter-bracket">{"{ "}</span>
              <TypewriterText />
              <span className="typewriter-bracket">{" }"}</span>
            </div>
            
            <form className="hero-form" onSubmit={onExplore}>
              <input 
                className="hero-input" 
                value={query} 
                onChange={e => setQuery(e.target.value)} 
                placeholder="Type what you're looking for..." 
              />
              <button 
                className="hero-button" 
                disabled={loading} 
                type="submit"
              >
                {loading ? 'Starting…' : "Let's start"}
              </button>
            </form>
            
            {error && <p className="hero-error">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}


