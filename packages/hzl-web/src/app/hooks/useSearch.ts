import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../api/client';
import type { SearchResponse, SearchTaskResult } from '../api/types';

const DEBOUNCE_MS = 250;

export interface UseSearchResult {
  results: SearchTaskResult[];
  total: number;
  searching: boolean;
}

export function useSearch(query: string): UseSearchResult {
  const [results, setResults] = useState<SearchTaskResult[]>([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController>();

  const doSearch = useCallback((q: string) => {
    abortRef.current?.abort();

    if (!q.trim()) {
      setResults([]);
      setTotal(0);
      setSearching(false);
      return;
    }

    setSearching(true);
    const controller = new AbortController();
    abortRef.current = controller;

    fetchJson<SearchResponse>('/api/search', { q }, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setResults(data.tasks);
          setTotal(data.total);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResults([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      });
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!query.trim()) {
      doSearch('');
      return;
    }
    timerRef.current = setTimeout(() => doSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [query, doSearch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { results, total, searching };
}
