import React from 'react'
import type { Dataset } from './ResultsMap'

export default function HoverPanel({ dataset, onClose }: { dataset: Dataset | null, onClose: () => void }) {
  if (!dataset) return null
  const title = dataset.display_name || dataset.source_id || new URL(dataset.source_url).pathname.split('/').filter(Boolean).slice(-1)[0]
  return (
    <aside className="hover-panel">
      <div className="hover-header">
        <div>
          <div className="hover-title">{title}</div>
          <div className="hover-sub">{dataset.source_url}</div>
        </div>
        <button className="hover-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="hover-stats">
        <div className="pill">Files: {dataset.num_files}</div>
        {dataset.possibilities && <div className="pill">Type: {dataset.possibilities}</div>}
      </div>
      {dataset.description && (
        <div className="hover-desc">{dataset.description}</div>
      )}
      <div className="hover-actions">
        <a className="button-secondary" href={dataset.source_url} target="_blank" rel="noreferrer">View on Kaggle</a>
        <button className="button-secondary" disabled>Explore Dataset</button>
        <button className="button-secondary" disabled>Download Dataset</button>
      </div>
    </aside>
  )
}
