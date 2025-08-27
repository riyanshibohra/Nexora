import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ResultsMap, { Dataset } from '../components/ResultsMap'
import Starfield from '../components/Starfield'
import DatasetModal from '../components/DatasetModal'
import InsightsModal from '../components/InsightsModal'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000'

type DatasetsResponse = { datasets: Dataset[] }

type RunState = {
  dataset_ids?: string[]
  state?: { status?: string[] }
}

export default function Results() {
  const location = useLocation() as any
  const navigate = useNavigate()
  const runPayload = (location?.state?.result || null) as RunState | null
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Dataset | null>(null)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE}/datasets`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as DatasetsResponse
        if (!cancelled) {
          const ids = (runPayload?.dataset_ids || []) as string[]
          const all = data.datasets || []
          const filtered = ids && ids.length > 0 ? all.filter(d => ids.includes(d.id)) : all
          setDatasets(filtered)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load datasets')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [runPayload])

  const runStatus = useMemo(() => runPayload?.state?.status ?? [], [runPayload])

  // Generate stable, unique colors per dataset (first 10 guaranteed unique)
  const colorsById = useMemo(() => {
    const palette = [
      '#4a9eff', // blue
      '#00d4aa', // teal
      '#7dd34d', // green
      '#ffd166', // yellow
      '#ff9b42', // orange
      '#ff6b6b', // red
      '#ff6bd6', // pink
      '#a08bff', // purple
      '#6ae0ff', // cyan
      '#b9ff5e', // lime
    ]
    const map: Record<string, string> = {}
    datasets.forEach((d, i) => {
      const color = palette[i % palette.length]
      map[d.id] = color
    })
    return map
  }, [datasets])

  function titleFor(ds: Dataset): string {
    const base = ds.display_name || ds.source_id || new URL(ds.source_url).pathname.split('/').filter(Boolean).slice(-1)[0] || 'Dataset'
    const s = base.replace(/[-_]+/g, ' ').trim()
    return s.replace(/\b\w/g, c => c.toUpperCase())
  }

  async function handleNewSearch() {
    setResetting(true)
    try {
      console.log('Resetting all data...')
      const res = await fetch(`${API_BASE}/reset`, {
        method: 'DELETE',
      })
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      console.log('Reset successful:', data.message)
      
      // Navigate back to landing page
      navigate('/')
    } catch (err: any) {
      console.error('Reset failed:', err)
      // Still navigate even if reset fails
      navigate('/')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="universe" style={{ minHeight: '100vh' }}>
      <div className="layer" style={{ inset: 0, pointerEvents: 'none' }}>
        <Starfield />
      </div>

      <header className="cine-topbar">
        <h2 className="brand-title" style={{ fontSize: '28px', margin: 0 }}>Nexora</h2>
        <div className="cine-actions">
          {/* Insights button removed per new summary design */}
          <button 
            className="button-primary" 
            onClick={handleNewSearch}
            disabled={resetting}
          >
            {resetting ? 'Resetting...' : 'New search'}
          </button>
        </div>
      </header>

      <div className="results-layout">
        <div className="results-body">
          <div className="results-map">
            {loading ? (
              <div className="loading">Loading datasets…</div>
            ) : error ? (
              <div className="error">{error}</div>
            ) : datasets.length === 0 ? (
              <div className="empty">No datasets yet. Run a search on the landing page.</div>
            ) : (
              <ResultsMap datasets={datasets} onSelect={setSelected} hoverId={hoverId} colorsById={colorsById} />
            )}
          </div>

          <div className="results-sidebar">
            <div className="summary-panel">
              <div className="summary-title">Summary View</div>
              <div className="summary-section">
                <div className="summary-sub">Datasets</div>
                <div className="dataset-list">
                  {datasets.slice(0, 10).map(ds => (
                    <button
                      key={ds.id}
                      className="dataset-item"
                      data-active={hoverId === ds.id}
                      onMouseEnter={() => setHoverId(ds.id)}
                      onMouseLeave={() => setHoverId(null)}
                      onClick={() => setSelected(ds)}
                    >
                      <span className="color-dot" style={{ background: colorsById[ds.id] }} />
                      <span className="dataset-name">{titleFor(ds)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DatasetModal dataset={selected} onClose={() => setSelected(null)} />
      <InsightsModal open={insightsOpen} onClose={() => setInsightsOpen(false)} />
    </div>
  )
}



