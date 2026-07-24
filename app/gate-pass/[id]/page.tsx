'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { supabase } from '@/lib/supabase'
import { sendNotification } from '@/lib/notifications'
import { canAccessPass } from '@/lib/auth'
import { STATUS_COLORS, STATUS_LABELS, PASS_TYPE_COLORS, PASS_TYPE_LABELS, formatDate, formatDateTime, isOverdue, isGateDenied } from '@/lib/gatepass'
import { PortalHeader } from '@/components/PortalHeader'

interface GatePass {
    id: string
    pass_number: string
    type: string
    status: string
    department: string
    from_location: string
    to_location: string
    driver_name: string
    driver_phone: string
    vehicle_number: string
    vendor_name: string
    materials: any[]
    invoice_number: string
    invoice_date: string
    invoice_url: string
    created_at: string
    created_by: string
    approver_id: string | null
    approved_at: string
    expiry_date: string
    exited_at: string
    returned_at: string
    rejection_reason: string
    gate_reject_reason: string
}

const EDITABLE_STATUSES = ['pending', 'approved']

export default function GatePassDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const [pass, setPass] = useState<GatePass | null>(null)
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState('')
    const [viewerId, setViewerId] = useState('')
    const [rejectionReason, setRejectionReason] = useState('')
    const [showRejectInput, setShowRejectInput] = useState(false)
    const [expiryDate, setExpiryDate] = useState('')
    const [showApproveInput, setShowApproveInput] = useState(false)
    const [actionLoading, setActionLoading] = useState(false)
    const [approveError, setApproveError] = useState('')

    useEffect(() => {
        const fetchData = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return router.push('/login')

            const { data: profile } = await supabase
                .from('profiles')
                .select('id, role')
                .eq('id', session.user.id)
                .single()

            setUserRole(profile?.role || 'user')
            setViewerId(session.user.id)

            const { data } = await supabase
                .from('gate_passes')
                .select('*')
                .eq('id', id)
                .single()

            if (!data) return router.push('/dashboard')

            // Belt-and-suspenders on top of RLS: a department User should
            // only ever be able to open a pass they created themselves.
            // Admin and Security can open any pass (Security needs it to
            // verify at the gate).
            if (profile && !canAccessPass(profile as any, data)) {
                router.push('/dashboard')
                return
            }

            setPass(data)
            setLoading(false)
        }
        fetchData()
    }, [id])

    // Minimum selectable expiry date: the day AFTER the pass was created.
    // Derived from created_at rather than "today" so that a pass sitting
    // in pending for a few days before approval still enforces
    // expiry > creation, not just expiry >= today.
    const minExpiryDate = pass?.created_at
        ? new Date(new Date(pass.created_at).getTime() + 86400000).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)

    const handleApproveClick = () => {
        if (pass?.type === 'returnable') {
            setShowApproveInput(true)
        } else {
            handleApprove()
        }
    }

    const handleApprove = async () => {
        if (pass?.type === 'returnable' && !expiryDate) {
            return
        }

        // Server-of-truth check happens via DB constraint too, but we
        // validate here first so the admin gets an immediate, friendly
        // error instead of a failed insert.
        if (pass?.type === 'returnable' && pass.created_at) {
            const expiry = new Date(expiryDate)
            const createdAt = new Date(pass.created_at)
            const expiryDay = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate())
            const createdDay = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate())

            if (expiryDay <= createdDay) {
                setApproveError('Valid until date must be after the pass creation date.')
                return
            }
        }

        setApproveError('')
        setActionLoading(true)
        const { data: { session } } = await supabase.auth.getSession()

        const { error } = await supabase
            .from('gate_passes')
            .update({
                status: 'approved',
                approver_id: session?.user.id,
                approved_at: new Date().toISOString(),
                expiry_date: pass?.type === 'returnable' ? expiryDate : null,
            })
            .eq('id', id)

        if (error) {
            setApproveError('Could not approve — please check the date and try again.')
            setActionLoading(false)
            return
        }

        await supabase.from('activity_logs').insert({
            gate_pass_id: id,
            user_id: session?.user.id,
            action: 'approved',
            metadata: pass?.type === 'returnable' ? { expiry_date: expiryDate } : undefined,
        })

        await sendNotification('approved', id)

        setPass(prev => prev ? { ...prev, status: 'approved', expiry_date: expiryDate } : null)
        setShowApproveInput(false)
        setActionLoading(false)
    }

    const handleReject = async () => {
        if (!rejectionReason) return
        setActionLoading(true)
        const { data: { session } } = await supabase.auth.getSession()

        await supabase
            .from('gate_passes')
            .update({
                status: 'rejected',
                rejection_reason: rejectionReason,
                approver_id: session?.user.id,
            })
            .eq('id', id)

        await supabase.from('activity_logs').insert({
            gate_pass_id: id,
            user_id: session?.user.id,
            action: 'rejected',
            metadata: { reason: rejectionReason },
        })

        await sendNotification('rejected', id)

        setPass(prev => prev ? { ...prev, status: 'rejected', rejection_reason: rejectionReason } : null)
        setShowRejectInput(false)
        setActionLoading(false)
    }

    const handleDownloadPdf = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            router.push('/login')
            return
        }
        const res = await fetch(`/api/gate-pass/${id}/pdf`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) {
            alert('Could not download PDF — you may not have access to this gate pass.')
            return
        }
        const blob = await res.blob()
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = `gate-pass-${pass!.pass_number.replace(/\//g, '-')}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(blobUrl)
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    if (loading) return (
        <div className="min-h-screen bg-gp-paper flex items-center justify-center">
            <p className="text-gp-steel text-sm uppercase tracking-wide">Loading record…</p>
        </div>
    )

    if (!pass) return (
        <div className="min-h-screen bg-gp-paper flex items-center justify-center">
            <p className="text-gp-steel text-sm uppercase tracking-wide">Gate pass not found</p>
        </div>
    )

    const overdue = isOverdue(pass)
    // Security can flag/deny a pass at the gate (leaving a reason) without
    // changing pass.status away from 'approved' — so without this check the
    // badge would keep showing "Approved – Awaiting Gate Exit" even though
    // the material was actually turned away at the gate.
    const gateDenied = isGateDenied(pass)
    const effStatus = overdue ? 'overdue' : gateDenied ? 'gate_denied' : pass.status
    const canEdit = EDITABLE_STATUSES.includes(pass.status) &&
        (userRole === 'admin' || (pass.status === 'pending' && pass.created_by === viewerId))

    return (
        <main className="min-h-screen bg-gp-paper flex flex-col">
            <PortalHeader onLogout={handleLogout} />

            <div className="flex-1 p-4 sm:p-6">
                <div className="max-w-3xl mx-auto">
                    <button onClick={() => router.push('/dashboard')} className="text-gp-steel hover:text-gp-navy transition text-sm mb-4 inline-flex items-center gap-1">
                        ← Back to Dashboard
                    </button>

                    <div className="bg-card border border-gp-line rounded-sm shadow-sm overflow-hidden">
                        <div className="h-1.5 bg-gp-navy" />

                        <div className="p-6 sm:p-8">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-gp-line">
                                <div>
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-gp-steel mb-1">Material Gate Pass</p>
                                    <h1 className="text-xl sm:text-2xl font-heading font-semibold text-gp-ink font-mono">{pass.pass_number}</h1>
                                    <div className="flex gap-2 mt-3 flex-wrap">
                                        <span className={`text-[11px] px-3 py-1 rounded-sm border uppercase tracking-wide font-medium ${STATUS_COLORS[effStatus]}`}>
                                            {STATUS_LABELS[effStatus] || effStatus}
                                        </span>
                                        <span className={`text-[11px] px-3 py-1 rounded-sm border uppercase tracking-wide font-medium ${PASS_TYPE_COLORS[pass.type]}`}>
                                            {PASS_TYPE_LABELS[pass.type] || pass.type}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-2 flex-wrap w-full sm:w-auto">
                                    <button
                                        onClick={() => handleDownloadPdf()}
                                        className="px-4 py-2 rounded-sm bg-gp-navy hover:bg-gp-navy-deep text-gp-paper text-sm font-medium transition"
                                    >
                                        📄 Download PDF
                                    </button>
                                    {canEdit && (
                                        <button
                                            onClick={() => router.push(`/gate-pass/${id}/edit`)}
                                            className="px-4 py-2 rounded-sm border border-gp-navy/30 text-gp-navy hover:bg-gp-navy/5 text-sm font-medium transition"
                                        >
                                            ✏️ Edit
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                                {[
                                    { label: 'Department', value: pass.department },
                                    { label: 'From', value: pass.from_location || 'N/A' },
                                    { label: 'To', value: pass.to_location || 'N/A' },
                                    { label: 'Vehicle Number', value: pass.vehicle_number, mono: true },
                                    { label: 'Driver Name', value: pass.driver_name },
                                    { label: 'Driver Phone', value: pass.driver_phone, mono: true },
                                    { label: 'Invoice Number', value: pass.invoice_number || 'N/A', mono: true },
                                    { label: 'Invoice Date', value: pass.invoice_date || 'N/A' },
                                    { label: 'Created At', value: formatDateTime(pass.created_at) },
                                    ...(pass.type === 'returnable' ? [{ label: 'Valid Until (Expiry)', value: formatDate(pass.expiry_date) }] : []),
                                    ...(pass.exited_at ? [{ label: 'Exited Gate At', value: formatDateTime(pass.exited_at) }] : []),
                                    ...(pass.returned_at ? [{ label: 'Returned At', value: formatDateTime(pass.returned_at) }] : []),
                                ].map(({ label, value, mono }) => (
                                    <div key={label} className="bg-gp-paper border border-gp-line rounded-sm p-4">
                                        <p className="text-gp-steel text-[11px] uppercase tracking-wide mb-1">{label}</p>
                                        <p className={`text-gp-ink text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</p>
                                    </div>
                                ))}
                            </div>

                            {overdue && (
                                <div className="mb-6 bg-gp-rust/5 border border-gp-rust/30 rounded-sm p-4">
                                    <p className="text-gp-rust text-sm font-medium">
                                        ⚠ This material has not been returned and the validity period has expired. A reminder email has been sent.
                                    </p>
                                </div>
                            )}

                            <div className="mb-6">
                                <h2 className="text-gp-ink font-heading font-semibold mb-3">Materials ({pass.materials?.length})</h2>
                                <div className="space-y-2">
                                    {pass.materials?.map((m: any, i: number) => (
                                        <div key={i} className="bg-gp-paper border border-gp-line rounded-sm p-4">
                                            <div className="flex justify-between">
                                                <div>
                                                    <p className="text-gp-ink font-medium">{m.name}</p>
                                                    <p className="text-gp-steel text-sm">{m.quantity} {m.unit}</p>
                                                </div>
                                                <p className="text-gp-ink font-mono font-medium">₹{m.value}</p>
                                            </div>
                                            {(m.material_id || m.date_issued) && (
                                                <div className="flex gap-4 mt-2 pt-2 border-t border-gp-line text-xs text-gp-steel font-mono">
                                                    {m.material_id && <span>ID: {m.material_id}</span>}
                                                    {m.date_issued && <span>Issued: {m.date_issued}</span>}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {pass.invoice_url && (
                                <div className="mb-6">
                                    <a href={pass.invoice_url} target="_blank" className="text-gp-navy hover:text-gp-amber text-sm underline underline-offset-2">
                                        View Invoice File
                                    </a>
                                </div>
                            )}

                            {pass.status === 'rejected' && pass.rejection_reason && (
                                <div className="mb-6 bg-gp-rust/5 border border-gp-rust/30 rounded-sm p-4">
                                    <p className="text-gp-rust text-sm">
                                        <span className="font-semibold">Rejection Reason:</span> {pass.rejection_reason}
                                    </p>
                                </div>
                            )}

                            {pass.gate_reject_reason && (
                                <div className="mb-6 bg-gp-rust/5 border border-gp-rust/30 rounded-sm p-4">
                                    <p className="text-gp-rust text-sm">
                                        <span className="font-semibold">Gate Denied Reason:</span> {pass.gate_reject_reason}
                                    </p>
                                </div>
                            )}

                            {userRole === 'admin' && pass.status === 'pending' && (
                                <div className="border-t border-gp-line pt-6">
                                    <h2 className="text-gp-ink font-heading font-semibold mb-4">Actions</h2>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={handleApproveClick}
                                            disabled={actionLoading}
                                            className="flex-1 py-3 rounded-sm bg-gp-forest hover:bg-gp-forest/90 disabled:bg-gp-forest/40 text-white font-semibold transition"
                                        >
                                            ✓ Approve
                                        </button>
                                        <button
                                            onClick={() => setShowRejectInput(!showRejectInput)}
                                            className="flex-1 py-3 rounded-sm bg-gp-rust hover:bg-gp-rust/90 text-white font-semibold transition"
                                        >
                                            ✕ Reject
                                        </button>
                                    </div>

                                    {showApproveInput && (
                                        <div className="mt-4 bg-gp-navy/5 border border-gp-navy/20 rounded-sm p-4">
                                            <label className="block text-xs uppercase tracking-wide text-gp-navy mb-2">
                                                Valid until (when must the material be returned?)
                                            </label>
                                            <input
                                                type="date"
                                                value={expiryDate}
                                                min={minExpiryDate}
                                                onChange={e => {
                                                    setExpiryDate(e.target.value)
                                                    if (approveError) setApproveError('')
                                                }}
                                                className="w-full px-4 py-3 rounded-sm bg-white border border-gp-navy/30 text-gp-ink outline-none focus:border-gp-navy transition mb-3 font-mono"
                                            />
                                            {approveError && (
                                                <p className="text-gp-rust text-xs mb-3">{approveError}</p>
                                            )}
                                            <button
                                                onClick={handleApprove}
                                                disabled={actionLoading || !expiryDate}
                                                className="w-full py-3 rounded-sm bg-gp-forest hover:bg-gp-forest/90 disabled:bg-gp-forest/40 text-white font-semibold transition"
                                            >
                                                Confirm Approval
                                            </button>
                                        </div>
                                    )}

                                    {showRejectInput && (
                                        <div className="mt-4">
                                            <input
                                                type="text"
                                                placeholder="Rejection reason..."
                                                value={rejectionReason}
                                                onChange={e => setRejectionReason(e.target.value)}
                                                className="w-full px-4 py-3 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-rust transition mb-3"
                                            />
                                            <button
                                                onClick={handleReject}
                                                disabled={actionLoading || !rejectionReason}
                                                className="w-full py-3 rounded-sm bg-gp-rust hover:bg-gp-rust/90 disabled:bg-gp-rust/40 text-white font-semibold transition"
                                            >
                                                Confirm Reject
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}
