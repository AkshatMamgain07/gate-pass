'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { supabase } from '@/lib/supabase'
import { sendNotification } from '@/lib/notifications'

interface GatePass {
    id: string
    pass_number: string
    type: string
    status: string
    department: string
    driver_name: string
    driver_phone: string
    vehicle_number: string
    vendor_name: string
    materials: any[]
    invoice_number: string
    invoice_date: string
    invoice_url: string
    created_at: string
    rejection_reason: string
}

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    approved: 'bg-green-500/20 text-green-400 border-green-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    verified: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    cancelled: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

export default function GatePassDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const [pass, setPass] = useState<GatePass | null>(null)
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState('')
    const [rejectionReason, setRejectionReason] = useState('')
    const [showRejectInput, setShowRejectInput] = useState(false)
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

    const handleApprove = async () => {
        setActionLoading(true)
        const { data: { session } } = await supabase.auth.getSession()

        await supabase
            .from('gate_passes')
            .update({
                status: 'approved',
                approver_id: session?.user.id,
                approved_at: new Date().toISOString(),
            })
            .eq('id', id)

        await supabase.from('activity_logs').insert({
            gate_pass_id: id,
            user_id: session?.user.id,
            action: 'approved',
        })

        await sendNotification('approved', id)

        setPass(prev => prev ? { ...prev, status: 'approved' } : null)
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

    if (loading) return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
            <p className="text-white text-xl">Loading...</p>
        </div>
    )

    if (!pass) return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
            <p className="text-white text-xl">Gate pass not found</p>
        </div>
    )

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
            <div className="max-w-3xl mx-auto">
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-6 sm:p-8">

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-white">{pass.pass_number}</h1>
                            <div className="flex gap-2 mt-2">
                                <span className={`text-xs px-3 py-1 rounded-full border capitalize ${STATUS_COLORS[pass.status]}`}>
                                    {pass.status}
                                </span>
                                <span className={`text-xs px-3 py-1 rounded-full border capitalize ${pass.type === 'inward' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-purple-500/20 text-purple-400 border-purple-500/30'}`}>
                                    {pass.type}
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-2 flex-wrap w-full sm:w-auto">
                            <a
                                href={`/api/gate-pass/${id}/pdf`}
                                target="_blank"
                                className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-sm font-medium transition"
                            >
                                📄 PDF
                            </a>
                            {pass.status === 'pending' && (
                                <button
                                    onClick={() => router.push(`/gate-pass/${id}/edit`)}
                                    className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition"
                                >
                                    ✏️ Edit
                                </button>
                            )}
                            <button onClick={() => router.push('/dashboard')} className="text-slate-400 hover:text-white transition px-2">
                                ← Back
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                        {[
                            { label: 'Department', value: pass.department },
                            { label: 'Vehicle Number', value: pass.vehicle_number },
                            { label: 'Driver Name', value: pass.driver_name },
                            { label: 'Driver Phone', value: pass.driver_phone },
                            { label: 'Invoice Number', value: pass.invoice_number || 'N/A' },
                            { label: 'Invoice Date', value: pass.invoice_date || 'N/A' },
                            { label: 'Created At', value: new Date(pass.created_at).toLocaleString('en-IN') },
                        ].map(({ label, value }) => (
                            <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-4">
                                <p className="text-slate-500 text-xs mb-1">{label}</p>
                                <p className="text-white text-sm font-medium">{value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="mb-6">
                        <h2 className="text-white font-semibold mb-3">Materials ({pass.materials?.length})</h2>
                        <div className="space-y-2">
                            {pass.materials?.map((m: any, i: number) => (
                                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 flex justify-between">
                                    <div>
                                        <p className="text-white font-medium">{m.name}</p>
                                        <p className="text-slate-400 text-sm">{m.quantity} {m.unit}</p>
                                    </div>
                                    <p className="text-white font-medium">₹{m.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {pass.invoice_url && (
                        <div className="mb-6">
                            <a href={pass.invoice_url} target="_blank" className="text-blue-400 hover:text-blue-300 text-sm underline">
                                View Invoice File
                            </a>
                        </div>
                    )}

                    {pass.status === 'rejected' && pass.rejection_reason && (
                        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                            <p className="text-red-400 text-sm">
                                <span className="font-semibold">Rejection Reason:</span> {pass.rejection_reason}
                            </p>
                        </div>
                    )}

                    {userRole === 'admin' && pass.status === 'pending' && (
                        <div className="border-t border-white/10 pt-6">
                            <h2 className="text-white font-semibold mb-4">Actions</h2>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleApprove}
                                    disabled={actionLoading}
                                    className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:bg-green-900 text-white font-semibold transition"
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
                            {showRejectInput && (
                                <div className="mt-4">
                                    <input
                                        type="text"
                                        placeholder="Rejection reason..."
                                        value={rejectionReason}
                                        onChange={e => setRejectionReason(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-slate-700 text-white placeholder:text-slate-500 outline-none focus:border-red-500 transition mb-3"
                                    />
                                    <button
                                        onClick={handleReject}
                                        disabled={actionLoading || !rejectionReason}
                                        className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-red-900 text-white font-semibold transition"
                                    >
                                        Confirm Reject
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </main >
    )
}