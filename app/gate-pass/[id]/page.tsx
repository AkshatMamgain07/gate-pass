'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { supabase } from '@/lib/supabase'
import { sendNotification } from '@/lib/notifications'
import { STATUS_COLORS, STATUS_LABELS, PASS_TYPE_COLORS, PASS_TYPE_LABELS, formatDate, formatDateTime, isOverdue } from '@/lib/gatepass'

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
    const [rejectionReason, setRejectionReason] = useState('')
    const [showRejectInput, setShowRejectInput] = useState(false)
    const [expiryDate, setExpiryDate] = useState('')
    const [showApproveInput, setShowApproveInput] = useState(false)
    const [actionLoading, setActionLoading] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return router.push('/login')

            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', session.user.id)
                .single()

            setUserRole(profile?.role || 'user')

            const { data } = await supabase
                .from('gate_passes')
                .select('*')
                .eq('id', id)
                .single()

            setPass(data)
            setLoading(false)
        }
        fetchData()
    }, [id])

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
        setActionLoading(true)
        const { data: { session } } = await supabase.auth.getSession()

        await supabase
            .from('gate_passes')
            .update({
                status: 'approved',
                approver_id: session?.user.id,
                approved_at: new Date().toISOString(),
                expiry_date: pass?.type === 'returnable' ? expiryDate : null,
            })
            .eq('id', id)

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

    if (loading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <p className="text-gray-500 text-lg">Loading...</p>
        </div>
    )

    if (!pass) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <p className="text-gray-500 text-lg">Gate pass not found</p>
        </div>
    )

    const overdue = isOverdue(pass)
    const canEdit = EDITABLE_STATUSES.includes(pass.status) && (pass.status === 'pending' || userRole === 'admin')

    return (
        <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
            <div className="max-w-3xl mx-auto">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8">

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{pass.pass_number}</h1>
                            <div className="flex gap-2 mt-2 flex-wrap">
                                <span className={`text-xs px-3 py-1 rounded-full border font-medium ${overdue ? STATUS_COLORS.overdue : STATUS_COLORS[pass.status]}`}>
                                    {overdue ? STATUS_LABELS.overdue : (STATUS_LABELS[pass.status] || pass.status)}
                                </span>
                                <span className={`text-xs px-3 py-1 rounded-full border font-medium ${PASS_TYPE_COLORS[pass.type]}`}>
                                    {PASS_TYPE_LABELS[pass.type] || pass.type}
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-2 flex-wrap w-full sm:w-auto">
                            <button
                                onClick={() => handleDownloadPdf()}
                                className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-sm font-medium transition"
                            >
                                📄 PDF
                            </button>
                            {canEdit && (
                                <button
                                    onClick={() => router.push(`/gate-pass/${id}/edit`)}
                                    className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition"
                                >
                                    ✏️ Edit
                                </button>
                            )}
                            <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-900 transition px-2 text-sm font-medium">
                                ← Back
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                        {[
                            { label: 'Department', value: pass.department },
                            { label: 'From', value: pass.from_location || 'N/A' },
                            { label: 'To', value: pass.to_location || 'N/A' },
                            { label: 'Vehicle Number', value: pass.vehicle_number },
                            { label: 'Driver Name', value: pass.driver_name },
                            { label: 'Driver Phone', value: pass.driver_phone },
                            { label: 'Invoice Number', value: pass.invoice_number || 'N/A' },
                            { label: 'Invoice Date', value: pass.invoice_date || 'N/A' },
                            { label: 'Created At', value: formatDateTime(pass.created_at) },
                            ...(pass.type === 'returnable' ? [{ label: 'Valid Until (Expiry)', value: formatDate(pass.expiry_date) }] : []),
                            ...(pass.exited_at ? [{ label: 'Exited Gate At', value: formatDateTime(pass.exited_at) }] : []),
                            ...(pass.returned_at ? [{ label: 'Returned At', value: formatDateTime(pass.returned_at) }] : []),
                        ].map(({ label, value }) => (
                            <div key={label} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                <p className="text-gray-400 text-xs mb-1">{label}</p>
                                <p className="text-gray-900 text-sm font-medium">{value}</p>
                            </div>
                        ))}
                    </div>

                    {overdue && (
                        <div className="mb-6 bg-orange-50 border border-orange-200 rounded-xl p-4">
                            <p className="text-orange-700 text-sm font-medium">
                                ⚠️ This material has not been returned and the validity period has expired. A reminder email has been sent.
                            </p>
                        </div>
                    )}

                    <div className="mb-6">
                        <h2 className="text-gray-900 font-semibold mb-3">Materials ({pass.materials?.length})</h2>
                        <div className="space-y-2">
                            {pass.materials?.map((m: any, i: number) => (
                                <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                    <div className="flex justify-between">
                                        <div>
                                            <p className="text-gray-900 font-medium">{m.name}</p>
                                            <p className="text-gray-500 text-sm">{m.quantity} {m.unit}</p>
                                        </div>
                                        <p className="text-gray-900 font-medium">₹{m.value}</p>
                                    </div>
                                    {(m.material_id || m.date_issued) && (
                                        <div className="flex gap-4 mt-2 pt-2 border-t border-gray-200 text-xs text-gray-400">
                                            {m.material_id && <span className="font-mono">ID: {m.material_id}</span>}
                                            {m.date_issued && <span>Issued: {m.date_issued}</span>}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {pass.invoice_url && (
                        <div className="mb-6">
                            <a href={pass.invoice_url} target="_blank" className="text-blue-600 hover:text-blue-700 text-sm underline">
                                View Invoice File
                            </a>
                        </div>
                    )}

                    {pass.status === 'rejected' && pass.rejection_reason && (
                        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                            <p className="text-red-700 text-sm">
                                <span className="font-semibold">Rejection Reason:</span> {pass.rejection_reason}
                            </p>
                        </div>
                    )}

                    {pass.gate_reject_reason && (
                        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                            <p className="text-red-700 text-sm">
                                <span className="font-semibold">Gate Denied Reason:</span> {pass.gate_reject_reason}
                            </p>
                        </div>
                    )}

                    {userRole === 'admin' && pass.status === 'pending' && (
                        <div className="border-t border-gray-200 pt-6">
                            <h2 className="text-gray-900 font-semibold mb-4">Actions</h2>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleApproveClick}
                                    disabled={actionLoading}
                                    className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-semibold transition"
                                >
                                    ✓ Approve
                                </button>
                                <button
                                    onClick={() => setShowRejectInput(!showRejectInput)}
                                    className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition"
                                >
                                    ✕ Reject
                                </button>
                            </div>

                            {showApproveInput && (
                                <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
                                    <label className="block text-sm font-medium text-blue-900 mb-2">
                                        Valid until (when must the material be returned?)
                                    </label>
                                    <input
                                        type="date"
                                        value={expiryDate}
                                        min={new Date().toISOString().slice(0, 10)}
                                        onChange={e => setExpiryDate(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl bg-white border border-blue-300 text-gray-900 outline-none focus:border-blue-500 transition mb-3"
                                    />
                                    <button
                                        onClick={handleApprove}
                                        disabled={actionLoading || !expiryDate}
                                        className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-semibold transition"
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
                                        className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-red-500 transition mb-3"
                                    />
                                    <button
                                        onClick={handleReject}
                                        disabled={actionLoading || !rejectionReason}
                                        className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-semibold transition"
                                    >
                                        Confirm Reject
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </main>
    )
}