import React from 'react'
import { useLocation, Link } from 'react-router-dom'

export default function Results() {
  const location = useLocation() as any
  const result = location?.state?.result

  return (
    <div style={{ minHeight: '100vh', background: '#0b0f16', color: 'white', padding: 24 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2>Nexora</h2>
          <Link to="/" style={{ color: '#4da3ff' }}>New search</Link>
        </div>
        {!result ? (
          <p>No result payload. Start from the landing page.</p>
        ) : (
          <div>
            <h3 style={{ marginBottom: 8 }}>Run summary</h3>
            <pre style={{ background: '#0f1522', padding: 16, borderRadius: 8, overflow: 'auto' }}>
{JSON.stringify({
  dataset_ids: result?.dataset_ids,
  status: result?.state?.status,
}, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}


