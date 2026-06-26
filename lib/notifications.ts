import { supabase } from '@/lib/supabase'

type NotificationType = 'created' | 'approved' | 'rejected' | 'overdue_reminder'

export async function sendNotification(type: NotificationType, passId: string) {
    try {
        const { data: pass } = await supabase
            .from('gate_passes')
            .select('*, approver:profiles!approver_id(*), creator:profiles!created_by(*)')
            .eq('id', passId)
            .single()

        if (!pass) return

        const recipients: Record<NotificationType, string[]> = {
            created: pass.approver?.email ? [pass.approver.email] : [],
            approved: pass.creator?.email ? [pass.creator.email] : [],
            rejected: pass.creator?.email ? [pass.creator.email] : [],
            overdue_reminder: [pass.creator?.email, pass.approver?.email].filter(Boolean) as string[],
        }

        const emailsToSend = recipients[type]

        for (const email of emailsToSend) {
            try {
                await fetch('/api/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: email,
                        type,
                        passNumber: pass.pass_number,
                        recipientName: type === 'created' ? (pass.approver?.full_name || 'Approver') : (pass.creator?.full_name || 'User'),
                        url: `${window.location.origin}/gate-pass/${passId}`,
                    }),
                })
            } catch (err) {
                console.log('Email send failed, continuing:', err)
            }
        }
    } catch (error) {
        console.log('Notification error (non-blocking):', error)
    }
}