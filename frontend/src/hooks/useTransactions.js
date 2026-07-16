import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * useTransactions — subscribes to the `transactions` Supabase table via
 * Realtime Postgres changes and returns a live-updating list of records.
 *
 * Fixes applied:
 *  - setLoading(false) is now called in the error branch (was missing before).
 *  - DELETE handler guards against payload.old?.id being undefined (tables
 *    without REPLICA IDENTITY FULL return an empty `old` object).
 *  - Channel reference stored in a ref so cleanup is always reliable even
 *    if limit changes between mount and unmount.
 */
export function useTransactions(limit = 50) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)

  // Keep a ref to the channel so the cleanup function always sees the
  // latest channel regardless of closure capture timing.
  const channelRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    // 1. Initial fetch
    async function fetchInitial() {
      const { data, error: fetchError } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (cancelled) return

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)   // FIX: was missing — UI was stuck in "Loading…" on error
        return
      }
      setTransactions(data ?? [])
      setLoading(false)
    }

    fetchInitial()

    // 2. Realtime subscription
    const channel = supabase
      .channel('transactions-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        (payload) => {
          if (cancelled) return

          if (payload.eventType === 'INSERT') {
            setTransactions((prev) => [payload.new, ...prev].slice(0, limit))
          } else if (payload.eventType === 'UPDATE') {
            setTransactions((prev) =>
              prev.map((t) => (t.id === payload.new.id ? payload.new : t))
            )
          } else if (payload.eventType === 'DELETE') {
            // FIX: payload.old.id is undefined when REPLICA IDENTITY is not FULL.
            // Guard against this to avoid silently matching every row.
            const deletedId = payload.old?.id
            if (deletedId) {
              setTransactions((prev) => prev.filter((t) => t.id !== deletedId))
            }
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      cancelled = true
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [limit])

  return { transactions, loading, error }
}
