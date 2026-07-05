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

// How many days a pass has to stay overdue, unreturned, before Security
// gets pulled in. Before this existed, materials could sit overdue for
// days with nobody but the (unresponsive) creator ever being told —
// Security only found out when they happened to notice or someone
// mentioned it in person.
const ESCALATION_DAYS = 3

// Vercel Cron hits this once a day.
//
// Stage 1 — first time a returnable pass's material is found overdue
// (exited, past its expiry_date, never reminded before): email the
// person who created the pass, asking them to return it.
//
// Stage 2 — if a pass is *still* overdue ESCALATION_DAYS after that first
// reminder (i.e. the creator didn't act), email every Security account so
// they can chase it down directly, instead of only finding out days later.
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
    const escalationCutoffISO = new Date(Date.now() - ESCALATION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.VERCEL_URL}`

    let reminded = 0
    let escalated = 0

    // --- Stage 1: initial reminder to the creator ---
    const { data: newlyOverdue, error: stage1Error } = await supabase
        .from('gate_passes')
        .select('*, creator:profiles!created_by(*)')
        .eq('type', 'returnable')
        .eq('status', 'exited')
        .eq('overdue_notified', false)
        .lt('expiry_date', nowISO)

    if (stage1Error) {
        return NextResponse.json({ error: stage1Error.message }, { status: 500 })
    }

    for (const pass of newlyOverdue || []) {
        const url = `${appUrl}/gate-pass/${pass.id}`

        if (pass.creator?.email) {
            try {
                await resend.emails.send({
                    from: 'Gate Pass System <onboarding@resend.dev>',
                    to: pass.creator.email,
                    subject: `Reminder: Please Return Material – ${pass.pass_number}`,
                    html: `
                        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                            <h2>Hi ${pass.creator.full_name || ''},</h2>
                            <p>The material sent out on your returnable gate pass <strong>${pass.pass_number}</strong> was due back on <strong>${new Date(pass.expiry_date).toLocaleDateString('en-IN')}</strong> and has not yet been marked returned at the gate.</p>
                            <p>Please return it at the gate as soon as possible.</p>
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

        reminded++
    }

    // --- Stage 2: escalate to Security if still overdue after the cutoff ---
    const { data: stillOverdue, error: stage2Error } = await supabase
        .from('gate_passes')
        .select('*, creator:profiles!created_by(*)')
        .eq('type', 'returnable')
        .eq('status', 'exited')
        .eq('overdue_notified', true)
        .eq('overdue_escalated', false)
        .lt('expiry_date', escalationCutoffISO)

    if (stage2Error) {
        return NextResponse.json({ error: stage2Error.message }, { status: 500 })
    }

    if (stillOverdue && stillOverdue.length > 0) {
        const { data: securityStaff } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('role', 'security')

        for (const pass of stillOverdue) {
            const url = `${appUrl}/gate-pass/${pass.id}`
            const daysOverdue = Math.floor((Date.now() - new Date(pass.expiry_date).getTime()) / (24 * 60 * 60 * 1000))

            for (const staff of securityStaff || []) {
                if (!staff.email) continue
                try {
                    await resend.emails.send({
                        from: 'Gate Pass System <onboarding@resend.dev>',
                        to: staff.email,
                        subject: `⚠ Overdue ${daysOverdue}+ Days – Follow Up Required – ${pass.pass_number}`,
                        html: `
                            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                                <h2>Hi ${staff.full_name || ''},</h2>
                                <p>Gate pass <strong>${pass.pass_number}</strong> has been overdue for <strong>${daysOverdue} days</strong> and the material still hasn't been returned. The person who created it (${pass.creator?.full_name || pass.creator?.email || 'unknown'}) was already reminded but hasn't acted.</p>
                                <p>Please follow up directly.</p>
                                <p>
                                    <a href="${url}" style="display:inline-block; padding: 10px 20px; background:#dc2626; color:#fff; text-decoration:none; border-radius:8px;">
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
                    console.error('Security escalation email failed:', err)
                }
            }

            await supabase
                .from('gate_passes')
                .update({ overdue_escalated: true })
                .eq('id', pass.id)

            try {
                await supabase.from('activity_logs').insert({
                    gate_pass_id: pass.id,
                    action: 'overdue_escalated_to_security',
                    metadata: { days_overdue: daysOverdue },
                })
            } catch (err) {
                console.error('Could not write escalation activity log (non-blocking):', err)
            }

            escalated++
        }
    }

    return NextResponse.json({
        checked: (newlyOverdue?.length || 0) + (stillOverdue?.length || 0),
        reminded,
        escalated,
    })
}