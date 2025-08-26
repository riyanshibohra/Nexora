import React from 'react'

export default function InsightsModal({ open, onClose }: { open: boolean, onClose: () => void }) {
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="hover-header">
          <div className="hover-title" style={{ fontSize: 18 }}>✨ AI Insights</div>
          <button className="hover-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="hover-desc" style={{ marginTop: 10 }}>Coming soon — this will summarize the result set, suggest top datasets, and visualize key terms.</div>
      </div>
    </div>
  )
}
