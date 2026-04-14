import { CategoryPage as CategoryPageComponent } from '../components/CategoryPage'

export function CategoryPage({ folder }: { folder: string }) {
  return <CategoryPageComponent folder={folder} />
}
