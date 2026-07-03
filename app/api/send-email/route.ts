import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthedRequestContext, canAccessPass } from '@/lib/auth'

const resend = new Resend(process.env.RESEND_API_KEY)

type NotificationType = 'created' | 'approved' | 'rejected' | 'overdue_reminder'

function escapeHtml(str: string) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

function getSubjectAndHtml(
    type: NotificationType,
    recipientName: string,
    passNumber: string,
    url: string
) {
    const safeName = escapeHtml(recipientName)
    const safePassNumber = escapeHtml(passNumber)

    const subjects: Record<NotificationType, string> = {
        created: `New Gate Pass Pending Approval: ${safePassNumber}`,
        approved: `Your Gate Pass Has Been Approved: ${safePassNumber}`,
        rejected: `Your Gate Pass Has Been Rejected: ${safePassNumber}`,
        overdue_reminder: `Reminder: Material Not Yet Returned – ${safePassNumber}`,
    }

    const messages: Record<NotificationType, string> = {
        created: `A new gate pass <strong>${safePassNumber}</strong> has been submitted and is waiting for your approval.`,
        approved: `Your gate pass <strong>${safePassNumber}</strong> has been approved.`,
        rejected: `Your gate pass <strong>${safePassNumber}</strong> has been rejected. Please check the details for more information.`,
        overdue_reminder: `The material sent out on returnable gate pass <strong>${safePassNumber}</strong> was due back by its validity date and has not yet been marked returned at the gate. Please follow up.`,
    }

    const html = `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Hi ${safeName},</h2>
            <p>${messages[type]}</p>
            <p>
                <a href="${url}" style="display:inline-block; padding: 10px 20px; background:#2563eb; color:#fff; text-decoration:none; border-radius:8px;">
                    View Gate Pass
                </a>
            </p>
            <p style="color:#888; font-size:12px; margin-top: 24px;">
                Material Gate Pass System – BHEL Haridwar
            </p>
        </div>
    `

    return { subject: subjects[type], html }
}

export async function POST(request: NextRequest) {
    try {
        const ctx = await getAuthedRequestContext(request)
        if (!ctx) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const { profile, client: supabase } = ctx

        const body = await request.json()
        const { passId, type } = body as { passId: string; type: NotificationType }

        if (!passId || !type) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const { data: pass } = await supabase
            .from('gate_passes')
            .select('*, approver:profiles!approver_id(*), creator:profiles!created_by(*)')
            .eq('id', passId)
            .single()

        if (!pass) {
            return NextResponse.json({ error: 'Gate pass not found' }, { status: 404 })
        }

        // Caller must actually be involved with this pass — they cannot ask
        // us to email some unrelated pass's data to themselves or anyone else.
        if (!canAccessPass(profile, pass)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Server decides the recipient list from the DB. The client never
        // gets to supply an email address or a redirect URL directly —
        // that's what made the old version an open relay.
        const recipientMap: Record<NotificationType, { email?: string; name?: string }[]> = {
            created: pass.approver ? [{ email: pass.approver.email, name: pass.approver.full_name }] : [],
            approved: pass.creator ? [{ email: pass.creator.email, name: pass.creator.full_name }] : [],
            rejected: pass.creator ? [{ email: pass.creator.email, name: pass.creator.full_name }] : [],
            overdue_reminder: [pass.creator, pass.approver]
                .filter(Boolean)
                .map((p: any) => ({ email: p.email, name: p.full_name })),
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.VERCEL_URL}`
        const passUrl = `${appUrl}/gate-pass/${pass.id}`

        const results: { to: string; ok: boolean }[] = []
        for (const r of recipientMap[type] || []) {
            if (!r.email) continue
            const { subject, html } = getSubjectAndHtml(type, r.name || 'there', pass.pass_number, passUrl)
            try {
                const { error } = await resend.emails.send({
                    from: 'Gate Pass System <onboarding@resend.dev>',
                    to: r.email,
                    subject,
                    html,
                })
                if (error) console.error('Resend error:', error)
                results.push({ to: r.email, ok: !error })
            } catch (err) {
                console.error('Send email failed:', err)
                results.push({ to: r.email, ok: false })
            }
        }

        return NextResponse.json({ success: true, results })
    } catch (err: any) {
        console.error('Send email route error:', err)
        return NextResponse.json(
            { error: err?.message || 'Failed to send email' },
            { status: 500 }
        )
    }
}