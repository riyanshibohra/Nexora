import React, { useState, useMemo, useEffect } from 'react'

interface QuickPlotsProps {
  columnDtypes: Record<string, string>
  numRows: number
  numColumns: number
  missingRows: number
  missingColumns: number
  dataQuality: number
  sourceUrl?: string
  fileName?: string
}

interface GeneratedPlot {
  path: string
  type: string
  title: string
  description: string
}

interface PlotGenerationResult {
  success: boolean
  plots: GeneratedPlot[]
  total_plots: number
  dataset_info: any
  file_name: string
}

type PlotType = 'missing_heatmap' | 'type_distribution' | 'data_quality' | 'column_analysis'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000'

export const QuickPlots: React.FC<QuickPlotsProps> = ({
  columnDtypes,
  numRows,
  numColumns,
  missingRows,
  missingColumns,
  dataQuality,
  sourceUrl,
  fileName
}) => {
  const [currentPlotIndex, setCurrentPlotIndex] = useState(0)
  const [generatedPlots, setGeneratedPlots] = useState<GeneratedPlot[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [showGeneratedPlots, setShowGeneratedPlots] = useState(false)

  // Generate plots function
  const generatePlots = async () => {
    if (!sourceUrl || !fileName) {
      setGenerationError('Missing source URL or file name')
      return
    }

    setIsGenerating(true)
    setGenerationError(null)

    try {
      const response = await fetch(`${API_BASE}/generate-plots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_url: sourceUrl,
          file_name: fileName,
          sample_size: 1000
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result: PlotGenerationResult = await response.json()
      
      if (result.success) {
        setGeneratedPlots(result.plots)
        setShowGeneratedPlots(true)
        setCurrentPlotIndex(0)
      } else {
        setGenerationError('Failed to generate plots')
      }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsGenerating(false)
    }
  }

  const plots = useMemo(() => {
    const plotTypes: PlotType[] = ['missing_heatmap', 'type_distribution', 'data_quality', 'column_analysis']
    return plotTypes.filter(type => {
      // Only show relevant plots based on data
      if (type === 'missing_heatmap' && missingRows === 0 && missingColumns === 0) return false
      if (type === 'data_quality' && dataQuality === 100) return false
      return true
    })
  }, [missingRows, missingColumns, dataQuality])

  const nextPlot = () => {
    setCurrentPlotIndex((prev) => (prev + 1) % plots.length)
  }

  const prevPlot = () => {
    setCurrentPlotIndex((prev) => (prev - 1 + plots.length) % plots.length)
  }

  const renderMissingHeatmap = () => {
    if (missingRows === 0 && missingColumns === 0) return null
    
    const missingData = [
      { column: 'Sample Column 1', missing: Math.round(Math.random() * 100) },
      { column: 'Sample Column 2', missing: Math.round(Math.random() * 50) },
      { column: 'Sample Column 3', missing: Math.round(Math.random() * 75) },
      { column: 'Sample Column 4', missing: Math.round(Math.random() * 25) },
      { column: 'Sample Column 5', missing: Math.round(Math.random() * 90) }
    ]

    return (
      <div className="plot-content">
        <h4>Missing Data Heatmap</h4>
        <div className="heatmap-container">
          {missingData.map((item, idx) => (
            <div key={idx} className="heatmap-row">
              <div className="heatmap-label">{item.column}</div>
              <div className="heatmap-bars">
                {Array.from({ length: 10 }, (_, i) => (
                  <div
                    key={i}
                    className={`heatmap-cell ${i < (item.missing / 10) ? 'missing' : 'present'}`}
                    title={`${item.missing}% missing`}
                  />
                ))}
              </div>
              <div className="heatmap-percentage">{item.missing}%</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderTypeDistribution = () => {
    const typeCounts: Record<string, number> = {}
    Object.values(columnDtypes).forEach(type => {
      const cleanType = type.toLowerCase()
      if (cleanType.includes('int') || cleanType.includes('float') || cleanType.includes('double')) {
        typeCounts['Numeric'] = (typeCounts['Numeric'] || 0) + 1
      } else if (cleanType.includes('date') || cleanType.includes('time')) {
        typeCounts['DateTime'] = (typeCounts['DateTime'] || 0) + 1
      } else if (cleanType.includes('bool')) {
        typeCounts['Boolean'] = (typeCounts['Boolean'] || 0) + 1
      } else {
        typeCounts['Text'] = (typeCounts['Text'] || 0) + 1
      }
    })

    const total = Object.values(typeCounts).reduce((sum, count) => sum + count, 0)
    
    return (
      <div className="plot-content">
        <h4>Column Type Distribution</h4>
        <div className="pie-chart-container">
          <svg width="120" height="120" viewBox="0 0 120 120">
            {Object.entries(typeCounts).map(([type, count], index) => {
              const percentage = (count / total) * 100
              const startAngle = index === 0 ? 0 : 
                Object.entries(typeCounts).slice(0, index).reduce((sum, [_, c]) => sum + (c / total) * 360, 0)
              const endAngle = startAngle + (percentage / 100) * 360
              
              const x1 = 60 + 40 * Math.cos(startAngle * Math.PI / 180)
              const y1 = 60 + 40 * Math.sin(startAngle * Math.PI / 180)
              const x2 = 60 + 40 * Math.cos(endAngle * Math.PI / 180)
              const y2 = 60 + 40 * Math.sin(endAngle * Math.PI / 180)
              
              const largeArcFlag = percentage > 50 ? 1 : 0
              
              const color = type === 'Numeric' ? '#7dd34d' : 
                           type === 'DateTime' ? '#ffd166' : 
                           type === 'Boolean' ? '#ff6b6b' : '#73b3ff'
              
              return (
                <path
                  key={type}
                  d={`M 60 60 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                  fill={color}
                  stroke="#0b1220"
                  strokeWidth="2"
                />
              )
            })}
          </svg>
          <div className="pie-legend">
            {Object.entries(typeCounts).map(([type, count]) => {
              const percentage = ((count / total) * 100).toFixed(1)
              const color = type === 'Numeric' ? '#7dd34d' : 
                           type === 'DateTime' ? '#ffd166' : 
                           type === 'Boolean' ? '#ff6b6b' : '#73b3ff'
              return (
                <div key={type} className="legend-item">
                  <div className="legend-color" style={{ background: color }} />
                  <span>{type}: {count} ({percentage}%)</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const renderDataQuality = () => {
    if (dataQuality === 100) return null
    
    const qualityLevel = dataQuality >= 90 ? 'Excellent' : 
                        dataQuality >= 75 ? 'Good' : 
                        dataQuality >= 50 ? 'Fair' : 'Poor'
    
    const qualityColor = dataQuality >= 90 ? '#7dd34d' : 
                        dataQuality >= 75 ? '#ffd166' : 
                        dataQuality >= 50 ? '#ff9f43' : '#ff6b6b'
    
    return (
      <div className="plot-content">
        <h4>Data Quality Assessment</h4>
        <div className="quality-container">
          <div className="quality-gauge">
            <svg width="120" height="80" viewBox="0 0 120 80">
              {/* Gauge background */}
              <path
                d="M 20 60 A 30 30 0 0 1 100 60"
                fill="none"
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="8"
              />
              {/* Gauge fill */}
              <path
                d="M 20 60 A 30 30 0 0 1 100 60"
                fill="none"
                stroke={qualityColor}
                strokeWidth="8"
                strokeDasharray={`${(dataQuality / 100) * 126} 126`}
                strokeDashoffset="126"
                strokeLinecap="round"
              />
              {/* Gauge needle */}
              <line
                x1="60"
                y1="60"
                x2={60 + 25 * Math.cos((dataQuality / 100) * Math.PI - Math.PI / 2)}
                y2={60 + 25 * Math.sin((dataQuality / 100) * Math.PI - Math.PI / 2)}
                stroke="#ffffff"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <div className="quality-score">{dataQuality}%</div>
          </div>
          <div className="quality-details">
            <div className="quality-level" style={{ color: qualityColor }}>
              {qualityLevel}
            </div>
            <div className="quality-description">
              {dataQuality >= 90 ? 'Data is highly reliable and complete' :
               dataQuality >= 75 ? 'Data has minor quality issues' :
               dataQuality >= 50 ? 'Data has significant quality concerns' :
               'Data quality needs immediate attention'}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderColumnAnalysis = () => {
    const numericColumns = Object.entries(columnDtypes).filter(([_, type]) => 
      type.toLowerCase().includes('int') || type.toLowerCase().includes('float')
    )
    
    const textColumns = Object.entries(columnDtypes).filter(([_, type]) => 
      !type.toLowerCase().includes('int') && !type.toLowerCase().includes('float') && 
      !type.toLowerCase().includes('date') && !type.toLowerCase().includes('time')
    )
    
    return (
      <div className="plot-content">
        <h4>Column Analysis</h4>
        <div className="analysis-container">
          <div className="analysis-section">
            <h5>Numeric Columns ({numericColumns.length})</h5>
            <div className="column-list">
              {numericColumns.slice(0, 5).map(([name, type]) => (
                <div key={name} className="column-item numeric">
                  <span className="column-name">{name}</span>
                  <span className="column-type">{type}</span>
                </div>
              ))}
              {numericColumns.length > 5 && (
                <div className="more-indicator">+{numericColumns.length - 5} more</div>
              )}
            </div>
          </div>
          
          <div className="analysis-section">
            <h5>Categorical Columns ({textColumns.length})</h5>
            <div className="column-list">
              {textColumns.slice(0, 5).map(([name, type]) => (
                <div key={name} className="column-item categorical">
                  <span className="column-name">{name}</span>
                  <span className="column-type">{type}</span>
                </div>
              ))}
              {textColumns.length > 5 && (
                <div className="more-indicator">+{textColumns.length - 5} more</div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderCurrentPlot = () => {
    if (plots.length === 0) {
      return (
        <div className="plot-content">
          <h4>No Plots Available</h4>
          <p>This dataset doesn't have enough variation to generate meaningful plots.</p>
        </div>
      )
    }

    const currentPlotType = plots[currentPlotIndex]
    
    switch (currentPlotType) {
      case 'missing_heatmap':
        return renderMissingHeatmap()
      case 'type_distribution':
        return renderTypeDistribution()
      case 'data_quality':
        return renderDataQuality()
      case 'column_analysis':
        return renderColumnAnalysis()
      default:
        return null
    }
  }

  return (
    <div className="quick-plots-container">
      <div className="plots-header">
        <h3>Quick Plots</h3>
        <div className="plot-controls">
          {!showGeneratedPlots && sourceUrl && fileName && (
            <button 
              onClick={generatePlots} 
              disabled={isGenerating}
              className="generate-plots-btn"
            >
              {isGenerating ? 'Generating...' : 'Generate Plots'}
            </button>
          )}
        </div>
      </div>
      
      {generationError && (
        <div className="error-message">
          <p>Error generating plots: {generationError}</p>
          <button onClick={() => setGenerationError(null)}>Dismiss</button>
        </div>
      )}
      
      {isGenerating && (
        <div className="loading-message">
          <p>Generating plots... This may take a few seconds.</p>
        </div>
      )}
      
      {showGeneratedPlots && generatedPlots.length > 0 ? (
        <div className="generated-plot-content">
          <div className="plot-info">
            <h4>{generatedPlots[currentPlotIndex]?.title}</h4>
            <p>{generatedPlots[currentPlotIndex]?.description}</p>
          </div>
          <div className="plot-image">
            <img 
              src={`${API_BASE}/plot-image?plot_path=${encodeURIComponent(generatedPlots[currentPlotIndex]?.path || '')}`}
              alt={generatedPlots[currentPlotIndex]?.title}
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>
          {generatedPlots.length > 1 && (
            <div className="plot-navigation">
              <button 
                className="nav-button prev" 
                onClick={prevPlot}
                disabled={generatedPlots.length <= 1}
              >
                ← Previous
              </button>
              <div className="plot-indicator">
                {currentPlotIndex + 1} of {generatedPlots.length}
              </div>
              <button 
                className="nav-button next" 
                onClick={nextPlot}
                disabled={generatedPlots.length <= 1}
              >
                Next →
              </button>
            </div>
          )}
          <div className="plot-actions">
            <button onClick={() => setShowGeneratedPlots(false)}>
              Back to Static Plots
            </button>
          </div>
        </div>
      ) : !isGenerating && !generationError ? (
        <>
          {plots.length > 0 ? renderCurrentPlot() : (
            <div className="plot-content">
              <h4>No Plots Available</h4>
              <p>This dataset doesn't have enough variation to generate meaningful plots.</p>
              {sourceUrl && fileName && (
                <p>Click "Generate Plots" to create custom visualizations!</p>
              )}
            </div>
          )}
          
          {plots.length > 1 && (
            <div className="plot-navigation">
              <button 
                className="nav-button prev" 
                onClick={prevPlot}
                disabled={plots.length <= 1}
              >
                ← Previous
              </button>
              <div className="plot-indicator">
                {currentPlotIndex + 1} of {plots.length}
              </div>
              <button 
                className="nav-button next" 
                onClick={nextPlot}
                disabled={plots.length <= 1}
              >
                Next →
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
