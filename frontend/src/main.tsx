import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Analysis from './pages/Analysis'
import Landing from './pages/Landing'
import Results from './pages/Results'
import './styles.css'

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/results', element: <Results /> },
  { path: '/analysis', element: <Analysis /> },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)


