import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, MapPin, Loader2 } from 'lucide-react'

type SearchResult = {
  display_name: string
  lat: string
  lon: string
}

type LocationSearchProps = {
  onSelect: (lat: number, lng: number, name: string) => void
}

const NOMINATIM_URL = '/api/nominatim/search'

export default function LocationSearch({ onSelect }: LocationSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchTimeout = useRef<number | null>(null)

  const handleSearch = useCallback(async (val: string) => {
    if (!val.trim()) {
      setResults([])
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams({
        q: val,
        format: 'jsonv2',
        limit: '5',
      })
      const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setResults(data)
        setIsOpen(true)
      }
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (searchTimeout.current) {
      window.clearTimeout(searchTimeout.current)
    }

    if (query.length > 2) {
      searchTimeout.current = window.setTimeout(() => {
        handleSearch(query)
      }, 500)
    } else {
      setResults([])
      setIsOpen(false)
    }

    return () => {
      if (searchTimeout.current) {
        window.clearTimeout(searchTimeout.current)
      }
    }
  }, [query, handleSearch])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      <div className="relative flex items-center">
        <div className="absolute left-3 text-slate-400">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length > 2 && setIsOpen(true)}
          placeholder="Search city, district, or landmarks..."
          className="w-full bg-white/10 text-sm text-white placeholder:text-white/40 border border-white/10 rounded-full pl-10 pr-4 py-1.5 focus:outline-none focus:bg-white/20 focus:border-white/30 transition-all"
        />
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <ul className="py-2">
            {results.map((res, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(Number(res.lat), Number(res.lon), res.display_name)
                    setIsOpen(false)
                    setQuery('')
                  }}
                  className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-white/10 transition-colors group"
                >
                  <MapPin size={16} className="mt-0.5 text-slate-500 group-hover:text-blue-400 shrink-0" />
                  <span className="text-xs text-slate-200 line-clamp-2">{res.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
