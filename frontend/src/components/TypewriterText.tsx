import React, { useState, useEffect } from 'react'

const phrases = [
  'datasets',
  'patterns',
  'connections',
  'stories'
]

export default function TypewriterText() {
  const [currentPhrase, setCurrentPhrase] = useState(0)
  const [currentText, setCurrentText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [speed, setSpeed] = useState(150)

  useEffect(() => {
    const phrase = phrases[currentPhrase]
    
    const timer = setTimeout(() => {
      if (!isDeleting) {
        if (currentText.length < phrase.length) {
          setCurrentText(phrase.substring(0, currentText.length + 1))
          setSpeed(Math.random() * 100 + 50) // Vary typing speed
        } else {
          setTimeout(() => setIsDeleting(true), 2000) // Pause before deleting
        }
      } else {
        if (currentText.length > 0) {
          setCurrentText(phrase.substring(0, currentText.length - 1))
          setSpeed(50) // Faster deletion
        } else {
          setIsDeleting(false)
          setCurrentPhrase((prev) => (prev + 1) % phrases.length)
        }
      }
    }, speed)

    return () => clearTimeout(timer)
  }, [currentText, isDeleting, currentPhrase, speed])

  return (
    <div className="typewriter-container">
      <span className="typewriter-text">{currentText}</span>
      <span className="typewriter-cursor">|</span>
    </div>
  )
}
