// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react'

type FileOutput = {
  id?: string
  file_path: string
  file_format?: string | null
  file_size?: number | null
  num_rows?: number | null
  num_columns?: number | null
  num_rows_with_missing?: number | null
  num_columns_with_missing?: number | null
  column_dtypes?: Record<string, string> | null
}

type DatasetWithFiles = {
  id: string
  source_url: string
  display_name?: string | null
  source_id?: string | null
  num_files: number
  total_size_bytes?: number | null
  files: FileOutput[]
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000'

function prettyTitle(name?: string | null, url?: string): string {
  const base = name || (url ? new URL(url).pathname.split('/').filter(Boolean).slice(-1)[0] : 'Dataset')
  const s = base.replace(/[-_]+/g, ' ').trim()
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

function formatBytes(n?: number | null): string {
  if (!n || n <= 0) return 'Unknown'
  const kb = n / 1024, mb = kb / 1024, gb = mb / 1024
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  if (mb >= 1) return `${Math.round(mb)} MB`
  if (kb >= 1) return `${Math.round(kb)} KB`
  return `${n} bytes`
}

export default function Analysis() {
  const params = new URLSearchParams(window.location.search)
  const sourceUrl = params.get('source_url') || ''
  const [dataset, setDataset] = useState<DatasetWithFiles | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeIdx, setActiveIdx] = useState(0)
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<{ headers: string[]; rows: any[] } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'type'>('name')
  const [plotPrompt, setPlotPrompt] = useState('')
  const [plotImage, setPlotImage] = useState<string | null>(null)
  const [plotError, setPlotError] = useState<string | null>(null)
  const [plotLoading, setPlotLoading] = useState(false)
  const [plotSuggestions, setPlotSuggestions] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const url = new URL(`${API_BASE}/dataset`)
        url.searchParams.set('source_url', sourceUrl)
        const res = await fetch(url.toString())
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setDataset(data.dataset || null)
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load dataset')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (sourceUrl) load()
    return () => { cancelled = true }
  }, [sourceUrl])

  const title = useMemo(() => prettyTitle(dataset?.display_name, dataset?.source_url), [dataset])
  
  // Filter to only show columnar files (CSV, XLSX, XLS, JSON)
  const supportedExtensions = ['.csv', '.xlsx', '.xls', '.json']
  const files = useMemo(() => {
    if (!dataset?.files) return []
    return dataset.files.filter(file => {
      const fileName = file.file_path.toLowerCase()
      return supportedExtensions.some(ext => fileName.endsWith(ext))
    })
  }, [dataset?.files])
  
  const active = files[activeIdx]

  // When dataset loads, if ?file= is set select that file
  useEffect(() => {
    if (!dataset || files.length === 0) return
    const p = new URLSearchParams(window.location.search)
    const fileParam = p.get('file')
    if (fileParam) {
      const idx = files.findIndex(f => f.file_path.endsWith(fileParam))
      if (idx >= 0) setActiveIdx(idx)
    } else {
      // Reset to first file if no specific file is requested
      setActiveIdx(0)
    }
  }, [dataset, files])

  // Load preview whenever active file changes
  useEffect(() => {
    async function loadPrev() {
      if (!dataset || !active) return
      setPreviewLoading(true)
      try {
        const url = new URL(`${API_BASE}/file-preview`)
        url.searchParams.set('source_url', dataset.source_url)
        const fname = active.file_path.split('/').slice(-1)[0]
        url.searchParams.set('file_name', fname)
        url.searchParams.set('limit', '200')
        const res = await fetch(url.toString())
        const data = await res.json()
        setPreview({ headers: data.headers || [], rows: data.rows || [] })
        // Persist selected file in URL for refresh deeplinking
        const u = new URL(window.location.href)
        u.searchParams.set('file', fname)
        window.history.replaceState({}, '', u.toString())
      } catch (e) {
        setPreview({ headers: [], rows: [] })
      } finally {
        setPreviewLoading(false)
      }
    }
    loadPrev()
  }, [dataset, activeIdx])

  // Load plot suggestions when active file changes
  useEffect(() => {
    async function loadSuggestions() {
      if (!dataset || !active) return
      try {
        const res = await fetch(`${API_BASE}/plot/suggestions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_path: active.file_path })
        })
        const data = await res.json()
        setPlotSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
      } catch (e) {
        setPlotSuggestions([])
      }
    }
    loadSuggestions()
  }, [dataset, activeIdx])

  async function reloadSuggestions() {
    if (!dataset || !active) return
    try {
      const res = await fetch(`${API_BASE}/plot/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: active.file_path })
      })
      const data = await res.json()
      setPlotSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
    } catch (e) {
      setPlotSuggestions([])
    }
  }

  async function onGeneratePlot() {
    if (!dataset || !active || !plotPrompt.trim()) return
    setPlotLoading(true)
    setPlotImage(null)
    setPlotError(null)
    try {
      const res = await fetch(`${API_BASE}/plot/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: active.file_path, prompt: plotPrompt })
      })
      if (!res.ok) {
        let detail = 'Failed to generate plot'
        try { const j = await res.json(); detail = j?.detail || detail } catch {}
        setPlotError(detail)
        setPlotImage(null)
      } else {
        const data = await res.json()
        setPlotImage(data.image || null)
      }
    } catch (e) {
      setPlotError((e as any)?.message || 'Error generating plot')
      setPlotImage(null)
    } finally {
      setPlotLoading(false)
    }
  }

  function onDownloadPlot() {
    if (!plotImage) return
    try {
      const a = document.createElement('a')
      a.href = plotImage
      a.download = 'nexora_plot.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      console.error('Download failed', e)
    }
  }

  return (
    <div className="universe" style={{ minHeight: '100vh' }}>
      <div className="results-layout analysis-page" style={{ gridTemplateColumns: '280px 1fr' }}>
        <header className="results-topbar analysis-topbar" style={{ gridColumn: '1 / -1', position: 'relative' }}>
          <div className="header-left">
            <a href="/results" className="backlink">← Back to Results</a>
          </div>
          <div className="header-center">
            <h2 className="analysis-title">{title} – Analysis</h2>
          </div>
          <div className="header-right">
            <button className="pill-action" onClick={async () => {
              if (!dataset || !active) return
              const fname = active.file_path.split('/').slice(-1)[0]
              try {
                const durl = new URL(`${API_BASE}/download-file`)
                durl.searchParams.set('source_url', dataset.source_url)
                durl.searchParams.set('file_name', fname)
                const res = await fetch(durl.toString())
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const blob = await res.blob()
                const a = document.createElement('a')
                const downloadUrl = window.URL.createObjectURL(blob)
                a.href = downloadUrl
                a.download = fname
                document.body.appendChild(a)
                a.click()
                a.remove()
                window.URL.revokeObjectURL(downloadUrl)
              } catch (e) {
                console.error('Download failed', e)
              }
            }}>Download file</button>
            <a className="pill-action" href={dataset?.source_url} target="_blank" rel="noreferrer">View on Source</a>
          </div>
        </header>

        <aside className="sidebar-placeholder" style={{ height: 'calc(100vh - 56px)', overflowY: 'auto', overflowX: 'hidden' }}>
          <div className="summary-sub" style={{ marginBottom: 8 }}>
            Files {dataset?.files && dataset.files.length > files.length 
              ? `(${files.length} of ${dataset.files.length} supported)` 
              : `(${files.length})`}
          </div>
          <input className="file-search" placeholder="Search files…" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="dataset-list">
            {files.filter(f => f.file_path.toLowerCase().includes(search.toLowerCase())).map((f, i) => (
              <button key={i} className="dataset-item" data-active={i === activeIdx} onClick={() => setActiveIdx(i)}>
                <span className="color-dot" style={{ background: i === activeIdx ? '#73b3ff' : '#4a9eff' }} />
                <span className="dataset-name" title={f.file_path}>{f.file_path.split('/').slice(-1)[0]}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="analysis-main">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : !dataset ? (
            <div className="empty">Dataset not found.</div>
          ) : files.length === 0 ? (
            <div className="empty">
              {dataset?.files && dataset.files.length > 0 
                ? "No supported columnar files (CSV, XLSX, XLS, JSON) found in this dataset."
                : "No files recorded for this dataset."
              }
            </div>
          ) : (
            <div className="analysis-grid">
              <section className="card">
                <div className="summary-sub">Overview</div>
                <div className="overview-stats">
                  <div className="overview-stat-item">
                    <div className="overview-stat-value">{active?.num_rows?.toLocaleString() ?? '—'}</div>
                    <div className="overview-stat-label">Total Rows</div>
                  </div>
                  <div className="overview-stat-item">
                    <div className="overview-stat-value">{active?.num_columns ?? '—'}</div>
                    <div className="overview-stat-label">Total Columns</div>
                  </div>
                  <div className="overview-stat-item">
                    <div className="overview-stat-value">{formatBytes(active?.file_size)}</div>
                    <div className="overview-stat-label">File Size</div>
                  </div>
                  <div className="overview-stat-item">
                    <div className="overview-stat-value">{active?.num_rows_with_missing ?? '0'}</div>
                    <div className="overview-stat-label">Missing Rows</div>
                  </div>
                  <div className="overview-stat-item">
                    <div className="overview-stat-value">{active?.num_columns_with_missing ?? '0'}</div>
                    <div className="overview-stat-label">Missing Columns</div>
                  </div>
                  <div className="overview-stat-item">
                    <div className="overview-stat-value">
                      {active?.num_rows && active?.num_rows_with_missing 
                        ? Math.round(((active.num_rows - active.num_rows_with_missing) / active.num_rows) * 100)
                        : '100'}%
                    </div>
                    <div className="overview-stat-label">Data Quality</div>
                  </div>
                </div>
              </section>

              <section className="card">
                <div className="summary-sub columns-types-header">
                  <span>Columns & Types</span>
                  <div className="sort-controls">
                    <button className="pill-action" data-active={sortBy==='name'} onClick={() => setSortBy('name')}>Sort: Name</button>
                    <button className="pill-action" data-active={sortBy==='type'} onClick={() => setSortBy('type')}>Sort: Type</button>
                  </div>
                </div>
                <div className="columns-list">
                  {Object.entries(active?.column_dtypes || {})
                    .sort((a, b) => {
                      if (sortBy === 'name') return a[0].localeCompare(b[0])
                      return String(a[1]).localeCompare(String(b[1]))
                    })
                    .map(([name, dtype]) => {
                    const t = String(dtype || '').toLowerCase()
                    const color = t.includes('int') || t.includes('float') || t.includes('double') ? '#7dd34d' : t.includes('date') || t.includes('time') ? '#ffd166' : '#73b3ff'
                    return (
                      <div key={name} className="col-item">
                        <span className="col-name">{name}</span>
                        <span className="col-type-chip" style={{ background: color }}>{dtype}</span>
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Data Preview (left) */}
              <section className="card data-preview-card">
                <div className="summary-sub">Data Preview</div>
                {previewLoading ? (
                  <div className="preview-placeholder">Loading preview…</div>
                ) : preview && preview.headers.length > 0 ? (
                  <div className="preview-scroll">
                    <table className="preview-table">
                      <thead>
                        <tr>{preview.headers.map(h => <th key={h}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((r, idx) => (
                          <tr key={idx}>{preview.headers.map(h => <td key={h}>{String(r[h] ?? '')}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="preview-placeholder">No preview available</div>
                )}
              </section>

              {/* Plots (right) */}
              <section className="card plots-card">
                <div className="summary-sub">Plots</div>
                <div className="plots-panel">
                  <div className="preview-placeholder plot-view">
                    {plotLoading ? 'Generating plot…' : plotError ? (
                      <div style={{ color: '#ff6b6b', textAlign: 'center', padding: 8 }}>{plotError}</div>
                    ) : plotImage ? (
                      <img 
                        src={plotImage} 
                        alt="Generated plot" 
                        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} 
                      />
                    ) : 'Plots will appear here.'}
                  </div>
                </div>
              </section>

              {/* Controls bar (full width, bottom) */}
              <section className="card plot-controls-bar" style={{ gridColumn: '1 / -1' }}>
                {plotSuggestions && plotSuggestions.length > 0 && (
                  <div className="suggestions-row">
                    {plotSuggestions.map((s, i) => (
                      <button key={i} className="pill-action" type="button" onClick={() => setPlotPrompt(s)} style={{ minWidth: 0 }}>{s}</button>
                    ))}
                  </div>
                )}
                <div className="controls-row">
                  <input className="plots-input" value={plotPrompt} onChange={e => setPlotPrompt(e.target.value)} placeholder="Describe the plot you want (e.g., 'Line chart of sales over time')" />
                  <div className="plots-actions">
                    <button className="pill-action" type="button" onClick={onDownloadPlot} disabled={!plotImage}>Download PNG</button>
                    <button className="pill-action" type="button" disabled={plotLoading || !plotPrompt.trim()} onClick={onGeneratePlot}>{plotLoading ? 'Generating…' : 'Generate plots'}</button>
                  </div>
                </div>
              </section>

              {/* Removed full-width AI Insights to keep layout clean */}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}



