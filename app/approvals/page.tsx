'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { requireRole } from '@/lib/auth'
import { sendNotification } from '@/lib/notifications'
import { PASS_TYPE_COLORS, PASS_TYPE_LABELS } from '@/lib/gatepass'

interface GatePass {
    id: string
    pass_number: string
    type: string
    status: string
    department: string
    driver_name: string
    vehicle_number: string
    created_at: string
    materials: any[]
}

export default function ApprovalsPage() {
    const router = useRouter()
    const [passes, setPasses] = useState<GatePass[]>([])
    const [loading, setLoading] = useState(true)
    const [rejectingId, setRejectingId] = useState<string | null>(null)
    const [rejectionReason, setRejectionReason] = useState('')
    const [approvingId, setApprovingId] = useState<string | null>(null)
    const [expiryDate, setExpiryDate] = useState('')
    const [actionLoading, setActionLoading] = useState(false)

    useEffect(() => {
        const init = async () => {
            // Only people who actually approve gate passes should see this
            // queue — a 'user' or 'vendor' account has no business here.
            const profile = await requireRole(['approver', 'admin'], router)
            if (!profile) return
            await fetchPendingApprovals(profile.id)
        }
        init()
    }, [])

    const fetchPendingApprovals = async (approverId: string) => {
        const { data } = await supabase
            .from('gate_passes')
            .select('*')
            .eq('approver_id', approverId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })

        setPasses(data || [])
        setLoading(false)
    }

    const startApprove = (pass: GatePass) => {
        if (pass.type === 'returnable') {
            setApprovingId(approvingId === pass.id ? null : pass.id)
            setExpiryDate('')
        } else {
            handleApprove(pass.id, null)
        }
    }

    const handleApprove = async (passId: string, withExpiry: string | null) => {
        setActionLoading(true)
        const { data: { session } } = await supabase.auth.getSession()

        await supabase
            .from('gate_passes')
            .update({
                status: 'approved',
                approved_at: new Date().toISOString(),
                expiry_date: withExpiry,
            })
            .eq('id', passId)

        await supabase.from('activity_logs').insert({
            gate_pass_id: passId,
            user_id: session?.user.id,
            action: 'approved',
            metadata: withExpiry ? { expiry_date: withExpiry } : undefined,
        })

        await sendNotification('approved', passId)

        setPasses(prev => prev.filter(p => p.id !== passId))
        setApprovingId(null)
        setActionLoading(false)
    }

    const handleReject = async (passId: string) => {
        if (!rejectionReason) return
        setActionLoading(true)
        const { data: { session } } = await supabase.auth.getSession()

        await supabase
            .from('gate_passes')
            .update({
                status: 'rejected',
                rejection_reason: rejectionReason,
            })
            .eq('id', passId)

        await supabase.from('activity_logs').insert({
            gate_pass_id: passId,
            user_id: session?.user.id,
            action: 'rejected',
            metadata: { reason: rejectionReason },
        })

        await sendNotification('rejected', passId)

        setPasses(prev => prev.filter(p => p.id !== passId))
        setRejectingId(null)
        setRejectionReason('')
        setActionLoading(false)
    }

    if (loading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <p className="text-gray-500 text-lg">Loading...</p>
        </div>
    )

    return (
        <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
            <div className="max-w-3xl mx-auto">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8">

                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">My Approvals</h1>
                            <p className="text-gray-500 mt-1">{passes.length} passes awaiting your approval</p>
                        </div>
                        <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-900 transition text-sm font-medium">
                            ← Back
                        </button>
                    </div>

                    {passes.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <p className="text-4xl mb-3">✅</p>
                            <p>No pending approvals</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {passes.map(pass => (
                                <div key={pass.id} className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <span className="text-gray-900 font-semibold">{pass.pass_number}</span>
                                            <span className={`ml-3 text-xs px-2 py-1 rounded-full border font-medium ${PASS_TYPE_COLORS[pass.type] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                                {PASS_TYPE_LABELS[pass.type] || pass.type}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => router.push(`/gate-pass/${pass.id}`)}
                                            className="text-blue-600 hover:text-blue-700 text-sm transition font-medium"
                                        >
                                            View Details →
                                        </button>
                                    </div>

                                    <div className="text-gray-500 text-sm mb-4">
                                        {pass.department} • {pass.driver_name} • {pass.vehicle_number} • {pass.materials?.length} materials
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => startApprove(pass)}
                                            disabled={actionLoading}
                                            className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium text-sm transition"
                                        >
                                            ✓ Approve
                                        </button>
                                        <button
                                            onClick={() => setRejectingId(rejectingId === pass.id ? null : pass.id)}
                                            className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition"
                                        >
                                            ✕ Reject
                                        </button>
                                    </div>

                                    {approvingId === pass.id && (
                                        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
                                            <label className="block text-sm font-medium text-blue-900 mb-2">
                                                Valid until (when must it be returned?)
                                            </label>
                                            <input
                                                type="date"
                                                value={expiryDate}
                                                min={new Date().toISOString().slice(0, 10)}
                                                onChange={e => setExpiryDate(e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg bg-white border border-blue-300 text-gray-900 outline-none focus:border-blue-500 text-sm transition mb-2"
                                            />
                                            <button
                                                onClick={() => handleApprove(pass.id, expiryDate)}
                                                disabled={actionLoading || !expiryDate}
                                                className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium transition"
                                            >
                                                Confirm Approval
                                            </button>
                                        </div>
                                    )}

                                    {rejectingId === pass.id && (
                                        <div className="mt-3">
                                            <input
                                                type="text"
                                                placeholder="Rejection reason..."
                                                value={rejectionReason}
                                                onChange={e => setRejectionReason(e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-red-500 text-sm transition mb-2"
                                            />
                                            <button
                                                onClick={() => handleReject(pass.id)}
                                                disabled={actionLoading || !rejectionReason}
                                                className="w-full py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium transition"
                                            >
                                                Confirm Reject
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                </div>
            </div>
        </main>
    )
}
