import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * useTransactions — subscribes to the `transactions` Supabase table via
 * Realtime Postgres changes and returns a live-updating list of records.
 */
export function useTransactions(limit = 50) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)

  useEffect(() => {
    // 1. Initial fetch
    async function fetchInitial() {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) { setError(error.message); return }
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
          if (payload.eventType === 'INSERT') {
            setTransactions((prev) => [payload.new, ...prev].slice(0, limit))
          } else if (payload.eventType === 'UPDATE') {
            setTransactions((prev) =>
              prev.map((t) => (t.id === payload.new.id ? payload.new : t))
            )
          } else if (payload.eventType === 'DELETE') {
            setTransactions((prev) => prev.filter((t) => t.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [limit])

  return { transactions, loading, error }
}
