import { useState } from 'react'
import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL

export function useCalendar() {
  const [loading, setLoading] = useState(false)

  const connectGoogle = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${API_URL}/auth/google`, {
      headers: { Authorization: `Bearer ${session?.access_token}` }
    })
    const { url } = await res.json()
    const urlWithState = url + `&state=${session?.user.id}`
    window.location.href = urlWithState
  }

  const createEvent = async (taskId: string, eventDate: string, eventTime: string) => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${API_URL}/tasks/${taskId}/calendar-event`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ eventDate, eventTime }),
    })
    const data = await res.json()
    setLoading(false)
    return data
  }

  return { connectGoogle, createEvent, loading }
}
