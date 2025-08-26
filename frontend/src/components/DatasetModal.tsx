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

function formatFileSize(numFiles: number): string {
  // Estimate size based on number of files (rough approximation)
  const estimatedMB = numFiles * 15 // Rough estimate: 15MB per file
  if (estimatedMB < 1024) {
    return `${estimatedMB} MB`
  }
  return `${(estimatedMB / 1024).toFixed(1)} GB`
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
  if (!desc) return 'No description available for this dataset.'
  
  // Split into words and estimate line breaks
  const words = desc.split(' ')
  const wordsPerLine = 15 // Rough estimate
  const maxWords = maxLines * wordsPerLine
  
  if (words.length <= maxWords) {
    return desc
  }
  
  return words.slice(0, maxWords).join(' ') + '...'
}

export default function DatasetModal({ dataset, onClose }: { dataset: Dataset | null, onClose: () => void }) {
  if (!dataset) return null

  const title = titleFor(dataset)
  const sourceName = getSourceName(dataset.source_url)
  const taskType = getTaskType(dataset.possibilities)
  const estimatedSize = formatFileSize(dataset.num_files)
  const description = truncateDescription(dataset.description)

  return (
    <div className="dataset-modal-backdrop" onClick={onClose}>
      <div className="dataset-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="dataset-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        
        {/* Header Section */}
        <div className="dataset-header">
          <div className="dataset-title">{title}</div>
          <div className="dataset-source">{sourceName} • Last updated recently</div>
        </div>

        {/* Stats Chips */}
        <div className="dataset-stats">
          <div className="dataset-chip">{taskType}</div>
          <div className="dataset-chip">{dataset.num_files} Files</div>
          <div className="dataset-chip">Size: {estimatedSize}</div>
        </div>

        {/* Description */}
        <div className="dataset-description">
          <div className="dataset-description-label">Description:</div>
          <div className="dataset-description-text">{description}</div>
        </div>

        {/* Action Buttons */}
        <div className="dataset-actions">
          <a 
            className="dataset-button dataset-button-primary" 
            href={dataset.source_url} 
            target="_blank" 
            rel="noreferrer"
          >
            View on Kaggle
          </a>
          <button className="dataset-button dataset-button-secondary" disabled>
            Explore Dataset (Analysis)
          </button>
          <button className="dataset-button dataset-button-secondary" disabled>
            Download Dataset
          </button>
        </div>
      </div>
    </div>
  )
}