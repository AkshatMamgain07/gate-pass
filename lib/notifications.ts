import { supabase } from '@/lib/supabase'

type NotificationType = 'created' | 'approved' | 'rejected' | 'overdue_reminder'

export async function sendNotification(type: NotificationType, passId: string) {
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return // not logged in — nothing to authorize the request with

        await fetch('/api/send-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ passId, type }),
        })
    } catch (error) {
        console.log('Notification error (non-blocking):', error)
    }
}