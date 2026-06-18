'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface GatePass {
    id: string
    pass_number: string
    type: string
    status: string
    department: string
    driver_name: string
    vehicle_number: string
    approved_at: string
    materials: any[]
}

export default function SecurityPage() {
    const router = useRouter()
    const [passes, setPasses] = useState<GatePass[]>([])
    const [loading, setLoading] = useState(true)
    const [verifyingId, setVerifyingId] = useState<string | null>(null)
    const [gateNotes, setGateNotes] = useState('')
    const [actionLoading, setActionLoading] = useState(false)

    useEffect(() => {
        fetchApprovedPasses()
    }, [])

    const fetchApprovedPasses = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return router.push('/login')

        const { data } = await supabase
            .from('gate_passes')
            .select('*')
            .eq('status', 'approved')
            .order('approved_at', { ascending: false })

        setPasses(data || [])
        setLoading(false)
    }

    const handleVerify = async (passId: string) => {
        setActionLoading(true)
        const { data: { session } } = await supabase.auth.getSession()

        await supabase
            .from('gate_passes')
            .update({
                status: 'completed',
                verified_at: new Date().toISOString(),
                gate_notes: gateNotes,
                verified_by: session?.user.id,
            })
            .eq('id', passId)

        await supabase.from('activity_logs').insert({
            gate_pass_id: passId,
            user_id: session?.user.id,
            action: 'verified',
            metadata: { notes: gateNotes },
        })

        setPasses(prev => prev.filter(p => p.id !== passId))
        setVerifyingId(null)
        setGateNotes('')
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
                            <h1 className="text-2xl font-bold text-white">Security Verification</h1>
                            <p className="text-slate-400 mt-1">{passes.length} approved passes awaiting gate verification</p>
                        </div>
                        <button onClick={() => router.push('/dashboard')} className="text-slate-400 hover:text-white transition">
                            ← Back
                        </button>
                    </div>

                    {passes.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <p className="text-4xl mb-3">🚧</p>
                            <p>No passes awaiting verification</p>
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

                                    <div className="grid grid-cols-2 gap-3 mb-4">
                                        <div className="bg-slate-900/50 rounded-lg p-3">
                                            <p className="text-slate-500 text-xs mb-1">Vehicle Number</p>
                                            <p className="text-white font-medium">{pass.vehicle_number}</p>
                                        </div>
                                        <div className="bg-slate-900/50 rounded-lg p-3">
                                            <p className="text-slate-500 text-xs mb-1">Department</p>
                                            <p className="text-white font-medium">{pass.department}</p>
                                        </div>
                                    </div>

                                    <div className="text-slate-400 text-sm mb-4">
                                        Driver: {pass.driver_name} • {pass.materials?.length} materials
                                    </div>

                                    {verifyingId === pass.id ? (
                                        <div className="space-y-3">
                                            <textarea
                                                placeholder="Gate notes (optional)..."
                                                value={gateNotes}
                                                onChange={e => setGateNotes(e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-700 text-white placeholder:text-slate-500 outline-none focus:border-blue-500 text-sm transition resize-none"
                                                rows={2}
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleVerify(pass.id)}
                                                    disabled={actionLoading}
                                                    className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 text-white text-sm font-medium transition"
                                                >
                                                    Confirm Verification
                                                </button>
                                                <button
                                                    onClick={() => { setVerifyingId(null); setGateNotes('') }}
                                                    className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setVerifyingId(pass.id)}
                                            className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition"
                                        >
                                            🚪 Mark as Verified
                                        </button>
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