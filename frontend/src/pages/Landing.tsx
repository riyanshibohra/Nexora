import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000'

export default function Landing() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<'intro' | 'search'>('intro')
  const navigate = useNavigate()

  useEffect(() => {
    const t = setTimeout(() => setStage('search'), 4000) // 4s hero, then reveal search
    return () => clearTimeout(t)
  }, [])

  async function onExplore(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/run-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      navigate('/results', { state: { result: data } })
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="universe" data-stage={stage}>
      <div className="layer stars" />
      <div className="layer twinkle" />
      {stage === 'intro' ? (
        <div className="content fade-in">
          <section className="hero">
            <div className="stack">
              <h1 className="brand-title">Nexora</h1>
              <p className="brand-sub">Find the dataset. Spark the idea.</p>
            </div>
          </section>
          <section className="search">
            <form className="search-row" onSubmit={onExplore}>
              <input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Type what you're looking for..." />
              <button className="button-primary" disabled={loading} type="submit">{loading ? 'Exploring…' : 'Explore'}</button>
            </form>
            {error && <p style={{ color: '#ff6b6b', textAlign: 'center', marginTop: 12 }}>{error}</p>}
          </section>
        </div>
      ) : (
        <div className="content fade-in">
          <section className="hero">
            <div style={{ textAlign: 'center' }}>
              <h1 className="brand-title" style={{ fontSize: '42px' }}>Nexora</h1>
              <p className="brand-sub">Find the dataset. Spark the idea.</p>
            </div>
          </section>
          <section className="search">
            <form className="search-row" onSubmit={onExplore}>
              <input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Type what you're looking for..." />
              <button className="button-primary" disabled={loading} type="submit">{loading ? 'Exploring…' : 'Explore'}</button>
            </form>
            {error && <p style={{ color: '#ff6b6b', textAlign: 'center', marginTop: 12 }}>{error}</p>}
          </section>
        </div>
      )}
    </div>
  )
}


