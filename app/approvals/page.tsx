'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { sendNotification } from '@/lib/notifications'

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
    const [actionLoading, setActionLoading] = useState(false)

    useEffect(() => {
        fetchPendingApprovals()
    }, [])

    const fetchPendingApprovals = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return router.push('/login')

        const { data } = await supabase
            .from('gate_passes')
            .select('*')
            .eq('approver_id', session.user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })

        setPasses(data || [])
        setLoading(false)
    }

    const handleApprove = async (passId: string) => {
        setActionLoading(true)
        const { data: { session } } = await supabase.auth.getSession()

        await supabase
            .from('gate_passes')
            .update({
                status: 'approved',
                approved_at: new Date().toISOString(),
            })
            .eq('id', passId)

        await supabase.from('activity_logs').insert({
            gate_pass_id: passId,
            user_id: session?.user.id,
            action: 'approved',
        })

        await sendNotification('approved', passId)

        setPasses(prev => prev.filter(p => p.id !== passId))
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
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
            <p className="text-white text-xl">Loading...</p>
        </div>
    )

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
            <div className="max-w-3xl mx-auto">
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-8">

                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h1 className="text-2xl font-bold text-white">My Approvals</h1>
                            <p className="text-slate-400 mt-1">{passes.length} passes awaiting your approval</p>
                        </div>
                        <button onClick={() => router.push('/dashboard')} className="text-slate-400 hover:text-white transition">
                            ← Back
                        </button>
                    </div>

                    {passes.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <p className="text-4xl mb-3">✅</p>
                            <p>No pending approvals</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {passes.map(pass => (
                                <div key={pass.id} className="bg-white/5 border border-white/10 rounded-xl p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <span className="text-white font-semibold">{pass.pass_number}</span>
                                            <span className={`ml-3 text-xs px-2 py-1 rounded-full border capitalize ${pass.type === 'inward' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-purple-500/20 text-purple-400 border-purple-500/30'}`}>
                                                {pass.type}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => router.push(`/gate-pass/${pass.id}`)}
                                            className="text-blue-400 hover:text-blue-300 text-sm transition"
                                        >
                                            View Details →
                                        </button>
                                    </div>

                                    <div className="text-slate-400 text-sm mb-4">
                                        {pass.department} • {pass.driver_name} • {pass.vehicle_number} • {pass.materials?.length} materials
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => handleApprove(pass.id)}
                                            disabled={actionLoading}
                                            className="flex-1 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:bg-green-900 text-white font-medium text-sm transition"
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

                                    {rejectingId === pass.id && (
                                        <div className="mt-3">
                                            <input
                                                type="text"
                                                placeholder="Rejection reason..."
                                                value={rejectionReason}
                                                onChange={e => setRejectionReason(e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-700 text-white placeholder:text-slate-500 outline-none focus:border-red-500 text-sm transition mb-2"
                                            />
                                            <button
                                                onClick={() => handleReject(pass.id)}
                                                disabled={actionLoading || !rejectionReason}
                                                className="w-full py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-900 text-white text-sm font-medium transition"
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