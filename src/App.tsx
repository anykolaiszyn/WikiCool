import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AuthGate } from './components/AuthGate'
import { WikiStoreProvider } from './components/WikiStore'
import { Layout } from './components/Layout'
import { PageView } from './pages/PageView'
import { EditorPage } from './pages/EditorPage'
import { NewPage } from './pages/NewPage'
import { HistoryPage } from './pages/HistoryPage'
import { TagPage } from './pages/TagPage'
import { CategoryPage } from './pages/CategoryPage'
import { SearchPage } from './pages/SearchPage'
import { CategoriesIndex } from './pages/CategoriesIndex'
import { NotFoundPage } from './pages/NotFoundPage'
import { GraphPage } from './pages/GraphPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'

// Adapters to pull slug/splat out of route params and pass as a typed prop.
function PageViewRoute() {
  const { '*': slug = 'index' } = useParams()
  return <PageView slug={slug} />
}

function EditorRoute() {
  const { '*': slug = '' } = useParams()
  return <EditorPage slug={slug} />
}

function HistoryRoute() {
  const { '*': slug = '' } = useParams()
  return <HistoryPage slug={slug} />
}

function CategoryRoute() {
  const { '*': folder = '' } = useParams()
  return <CategoryPage folder={folder} />
}

export default function App() {
  return (
    <Routes>
      {/*
       * /auth/callback must be outside AuthGate so the OAuth redirect lands
       * before the user is authenticated. AuthCallbackPage reads the token
       * from the URL fragment, calls setToken(), then navigates to the wiki.
       */}
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* All other routes are guarded by AuthGate. */}
      <Route
        path="*"
        element={
          <AuthGate>
            <WikiStoreProvider>
              <Layout>
                <Routes>
                  <Route path="/" element={<Navigate to="/wiki/index" replace />} />
                  <Route path="/wiki/*" element={<PageViewRoute />} />
                  <Route path="/edit/*" element={<EditorRoute />} />
                  <Route path="/new" element={<NewPage />} />
                  <Route path="/history/*" element={<HistoryRoute />} />
                  <Route path="/tag/:tag" element={<TagPage />} />
                  <Route path="/category/*" element={<CategoryRoute />} />
                  <Route path="/categories" element={<CategoriesIndex />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/graph" element={<GraphPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Layout>
            </WikiStoreProvider>
          </AuthGate>
        }
      />
    </Routes>
  )
}
