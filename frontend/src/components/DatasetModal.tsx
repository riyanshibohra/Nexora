import React from 'react'
import type { Dataset } from './ResultsMap'

function prettyTitle(slugish: string): string {
  const s = slugish.replace(/[-_]+/g, ' ').trim()
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

function titleFor(ds: Dataset): string {
  const base = ds.display_name || ds.source_id || new URL(ds.source_url).pathname.split('/').filter(Boolean).slice(-1)[0] || 'Dataset'
  return prettyTitle(base)
}

function getSourceName(url: string): string {
  try {
    const urlObj = new URL(url)
    if (urlObj.hostname.includes('kaggle.com')) {
      return 'Kaggle'
    }
    return urlObj.hostname
  } catch {
    return 'Unknown Source'
  }
}

function formatFileSize(sizeInBytes: number | null | undefined): string {
  if (!sizeInBytes || sizeInBytes === 0) {
    return 'Unknown size'
  }
  
  const bytes = sizeInBytes
  const kb = bytes / 1024
  const mb = kb / 1024
  const gb = mb / 1024
  
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`
  } else if (mb >= 1) {
    return `${Math.round(mb)} MB`
  } else if (kb >= 1) {
    return `${Math.round(kb)} KB`
  } else {
    return `${bytes} bytes`
  }
}

function getTaskType(possibilities: string | null): string {
  if (!possibilities) return 'General'
  
  const p = possibilities.toLowerCase()
  if (p.includes('classification')) return 'Classification'
  if (p.includes('regression')) return 'Regression'
  if (p.includes('time_series')) return 'Time Series'
  if (p.includes('clustering')) return 'Clustering'
  if (p.includes('text')) return 'NLP'
  if (p.includes('image')) return 'Computer Vision'
  return 'Analysis'
}

function truncateDescription(desc: string | null, maxLines: number = 2): string {
  if (!desc) return ''
  
  // Split into words and estimate line breaks
  const words = desc.split(' ')
  const wordsPerLine = 15 // Rough estimate
  const maxWords = maxLines * wordsPerLine
  
  if (words.length <= maxWords) {
    return desc
  }
  
  return words.slice(0, maxWords).join(' ') + '...'
}

function buildFallbackDescription(dataset: Dataset, taskType: string): string {
  const title = titleFor(dataset)
  const src = getSourceName(dataset.source_url)
  const typePart = taskType && taskType !== 'Analysis' ? `${taskType} ` : ''
  return `A ${typePart}dataset: ${title} (source: ${src}).`
}

export default function DatasetModal({ dataset, onClose }: { dataset: Dataset | null, onClose: () => void }) {
  if (!dataset) return null

  const ds: Dataset = dataset
  const title = titleFor(ds)
  const sourceName = getSourceName(ds.source_url)
  const taskType = getTaskType(ds.possibilities ?? null)
  const actualSize = formatFileSize(ds.total_size_bytes)
  const description = (ds.description && ds.description.trim().length > 0)
    ? ds.description
    : buildFallbackDescription(ds, taskType)

  async function handleDownload() {
    try {
      const url = new URL(import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000')
      url.pathname = '/download-dataset-zip'
      url.searchParams.set('source_url', ds.source_url)

      const res = await fetch(url.toString())
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const a = document.createElement('a')
      const downloadUrl = window.URL.createObjectURL(blob)
      a.href = downloadUrl
      a.download = `${title}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(downloadUrl)
    } catch (e) {
      console.error('Download failed', e)
    }
  }

  return (
    <div className="dataset-modal-backdrop" onClick={onClose}>
      <div className="dataset-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="dataset-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        
        {/* Header Section */}
        <div className="dataset-header">
          <div className="dataset-title">{title}</div>
          <div className="dataset-source">{sourceName}</div>
        </div>

        {/* Stats Chips */}
        <div className="dataset-stats">
          <div className="dataset-chip">{taskType}</div>
          <div className="dataset-chip">No. of Files: {dataset.num_files}</div>
          <div className="dataset-chip">Size: {actualSize}</div>
        </div>

        {/* Description */}
        <div className="dataset-description">
          <div className="dataset-description-label">Description:</div>
          <div className="dataset-description-text">{description}</div>
        </div>

        {/* Action Buttons */}
        <div className="dataset-actions">
          <a 
            className="dataset-button dataset-button-secondary" 
            href={ds.source_url} 
            target="_blank" 
            rel="noreferrer"
          >
            View on Kaggle
          </a>
          <button className="dataset-button dataset-button-secondary" onClick={() => {
            const url = new URL(window.location.origin)
            url.pathname = '/analysis'
            url.searchParams.set('source_url', ds.source_url)
            window.location.href = url.toString()
          }}>
            Explore Dataset (Analysis)
          </button>
          <button className="dataset-button dataset-button-secondary" onClick={handleDownload}>
            Download Dataset
          </button>
        </div>
      </div>
    </div>
  )
}