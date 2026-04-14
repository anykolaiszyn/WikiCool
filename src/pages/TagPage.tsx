import { useParams } from 'react-router-dom'
import { TagPage as TagPageComponent } from '../components/TagPage'

export function TagPage() {
  const { tag = '' } = useParams<{ tag: string }>()
  return <TagPageComponent tag={decodeURIComponent(tag)} />
}
