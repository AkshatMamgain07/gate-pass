import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)

type NotificationType = 'created' | 'approved' | 'rejected' | 'overdue_reminder'

function getSubjectAndHtml(
    type: NotificationType,
    recipientName: string,
    passNumber: string,
    url: string
) {
    const subjects: Record<NotificationType, string> = {
        created: `New Gate Pass Pending Approval: ${passNumber}`,
        approved: `Your Gate Pass Has Been Approved: ${passNumber}`,
        rejected: `Your Gate Pass Has Been Rejected: ${passNumber}`,
        overdue_reminder: `Reminder: Material Not Yet Returned – ${passNumber}`,
    }

    const messages: Record<NotificationType, string> = {
        created: `A new gate pass <strong>${passNumber}</strong> has been submitted and is waiting for your approval.`,
        approved: `Your gate pass <strong>${passNumber}</strong> has been approved.`,
        rejected: `Your gate pass <strong>${passNumber}</strong> has been rejected. Please check the details for more information.`,
        overdue_reminder: `The material sent out on returnable gate pass <strong>${passNumber}</strong> was due back by its validity date and has not yet been marked returned at the gate. Please follow up.`,
    }

    const html = `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Hi ${recipientName},</h2>
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
        const body = await request.json()
        const { to, type, passNumber, recipientName, url } = body as {
            to: string
            type: NotificationType
            passNumber: string
            recipientName: string
            url: string
        }

        if (!to || !type || !passNumber) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            )
        }

        const { subject, html } = getSubjectAndHtml(type, recipientName, passNumber, url)

        const { data, error } = await resend.emails.send({
            from: 'Gate Pass System <onboarding@resend.dev>',
            to,
            subject,
            html,
        })

        if (error) {
            console.error('Resend error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, data })
    } catch (err: any) {
        console.error('Send email route error:', err)
        return NextResponse.json(
            { error: err?.message || 'Failed to send email' },
            { status: 500 }
        )
    }
}