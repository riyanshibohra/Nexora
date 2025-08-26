import React from 'react'
import type { Dataset } from './ResultsMap'

export default function DetailsDrawer({ dataset, onClose }: { dataset: Dataset | null, onClose: () => void }) {
  const open = !!dataset
  const title = dataset ? (dataset.display_name || dataset.source_id || new URL(dataset.source_url).pathname.split('/').filter(Boolean).slice(-1)[0]) : ''
  return (
    <aside className="drawer" data-open={open}>
      <div className="drawer-header">
        <div>
          <div className="drawer-title">{title}</div>
          {dataset && <div className="drawer-sub">{dataset.source_url}</div>}
        </div>
        <button className="hover-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {dataset && (
        <div className="drawer-body">
          <div className="hover-stats" style={{ marginTop: 6 }}>
            <div className="pill">Files: {dataset.num_files}</div>
            {dataset.possibilities && <div className="pill">Type: {dataset.possibilities}</div>}
          </div>
          {dataset.description && <div className="hover-desc" style={{ marginTop: 10 }}>{dataset.description}</div>}
          <div className="hover-actions" style={{ marginTop: 12 }}>
            <a className="button-secondary" href={dataset.source_url} target="_blank" rel="noreferrer">View on Kaggle</a>
            <button className="button-secondary" disabled>Explore Dataset</button>
            <button className="button-secondary" disabled>Download Dataset</button>
          </div>
        </div>
      )}
    </aside>
  )
}
