import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// This route runs as a scheduled cron job, not on behalf of any logged-in
// user — there's no session/JWT to attach, so the anon key + RLS approach
// used elsewhere doesn't apply here. It needs the service role key, which
// bypasses RLS entirely. That's safe specifically because access to this
// route is already gated by the CRON_SECRET check below; the service role
// key itself must never be exposed to the browser or committed to the repo.
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY)

// Vercel Cron (or any external scheduler) hits this once a day.
// It finds returnable gate passes whose material has exited the gate,
// whose validity period (expiry_date) has passed, and which haven't
// already been emailed about — then sends a reminder and marks them notified.
export async function GET(req: NextRequest) {
    // Fail CLOSED: if the secret isn't configured, refuse to run at all
    // instead of silently allowing anyone on the internet to trigger this.
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'CRON_SECRET not configured on server' }, { status: 500 })
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured on server' }, { status: 500 })
    }

    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const nowISO = new Date().toISOString()

    const { data: overduePasses, error } = await supabase
        .from('gate_passes')
        .select('*, approver:profiles!approver_id(*), creator:profiles!created_by(*)')
        .eq('type', 'returnable')
        .eq('status', 'exited')
        .eq('overdue_notified', false)
        .lt('expiry_date', nowISO)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!overduePasses || overduePasses.length === 0) {
        return NextResponse.json({ checked: 0, notified: 0 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.VERCEL_URL}`
    let notified = 0

    for (const pass of overduePasses) {
        const recipients = [pass.creator?.email, pass.approver?.email].filter(Boolean) as string[]
        const url = `${appUrl}/gate-pass/${pass.id}`

        for (const to of recipients) {
            try {
                await resend.emails.send({
                    from: 'Gate Pass System <onboarding@resend.dev>',
                    to,
                    subject: `Reminder: Material Not Yet Returned – ${pass.pass_number}`,
                    html: `
                        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                            <h2>Hi,</h2>
                            <p>The material sent out on returnable gate pass <strong>${pass.pass_number}</strong> was due back on <strong>${new Date(pass.expiry_date).toLocaleDateString('en-IN')}</strong> and has not yet been marked returned at the gate.</p>
                            <p>Please follow up so the material can be returned, or the gate pass updated.</p>
                            <p>
                                <a href="${url}" style="display:inline-block; padding: 10px 20px; background:#2563eb; color:#fff; text-decoration:none; border-radius:8px;">
                                    View Gate Pass
                                </a>
                            </p>
                            <p style="color:#888; font-size:12px; margin-top: 24px;">
                                Material Gate Pass System – BHEL Haridwar
                            </p>
                        </div>
                    `,
                })
            } catch (err) {
                console.error('Overdue reminder email failed:', err)
            }
        }

        await supabase
            .from('gate_passes')
            .update({ overdue_notified: true })
            .eq('id', pass.id)

        try {
            await supabase.from('activity_logs').insert({
                gate_pass_id: pass.id,
                action: 'overdue_reminder_sent',
            })
        } catch (err) {
            console.error('Could not write overdue activity log (non-blocking):', err)
        }

        notified++
    }

    return NextResponse.json({ checked: overduePasses.length, notified })
}