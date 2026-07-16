import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * useNotifications — subscribes to INSERT events on the `transactions` table
 * and calls `onFlaggedTransaction` whenever a new flagged transaction arrives
 * from a device OTHER than `ownDeviceId`.
 *
 * Used by DeviceOwner to receive push notification triggers when the
 * fraudster or secondary device submits a flagged payment.
 *
 * @param {string}   ownDeviceId           - This device's ID (events from this device are ignored)
 * @param {function} onFlaggedTransaction  - Called with the transaction row when a flag is received
 */
export function useNotifications(ownDeviceId, onFlaggedTransaction) {
  const callbackRef = useRef(onFlaggedTransaction)

  // Keep the callback ref fresh without re-subscribing on every render
  useEffect(() => {
    callbackRef.current = onFlaggedTransaction
  })

  useEffect(() => {
    const channel = supabase
      .channel(`notifications-for-${ownDeviceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions' },
        (payload) => {
          const tx = payload.new
          if (tx.status === 'flagged' && tx.device_id !== ownDeviceId) {
            callbackRef.current?.(tx)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [ownDeviceId])   // only re-subscribe if ownDeviceId changes
}
