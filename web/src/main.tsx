import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout.tsx'
import { OverviewPage } from './pages/Overview.tsx'
import { ProjectsPage } from './pages/Projects.tsx'
import { ProjectDetailPage } from './pages/ProjectDetail.tsx'
import { ProgramsPage } from './pages/Programs.tsx'
import { GraphPage } from './pages/Graph.tsx'
import { ResourcesPage } from './pages/Resources.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:namespace/:name" element={<ProjectDetailPage />} />
          <Route path="/programs" element={<ProgramsPage />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
