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
    created_at: string
    materials: any[]
}

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    approved: 'bg-green-500/20 text-green-400 border-green-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    verified: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

export default function GatePassListPage() {
    const router = useRouter()
    const [passes, setPasses] = useState<GatePass[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('all')

    useEffect(() => {
        const fetchPasses = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return router.push('/login')

            const { data } = await supabase
                .from('gate_passes')
                .select('*')
                .order('created_at', { ascending: false })

            setPasses(data || [])
            setLoading(false)
        }
        fetchPasses()
    }, [])

    const filtered = filter === 'all' ? passes : passes.filter(p => p.status === filter)

    if (loading) return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
            <p className="text-white text-xl">Loading...</p>
        </div>
    )

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
            <div className="max-w-5xl mx-auto">
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-8">

                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-white">All Gate Passes</h1>
                            <p className="text-slate-400 mt-1">{passes.length} total passes</p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => router.push('/gate-pass/new')}
                                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition"
                            >
                                + New Pass
                            </button>
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition"
                            >
                                ← Back
                            </button>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex gap-2 mb-6 flex-wrap">
                        {['all', 'pending', 'approved', 'rejected', 'verified'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition ${filter === f
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                    }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* List */}
                    {filtered.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <p className="text-4xl mb-3">📭</p>
                            <p>No gate passes found</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filtered.map(pass => (
                                <div
                                    key={pass.id}
                                    className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition cursor-pointer"
                                    onClick={() => router.push(`/gate-pass/${pass.id}`)}
                                >
                                    <div className="flex items-center justify-between flex-wrap gap-3">
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-white font-semibold">{pass.pass_number}</span>
                                                <span className={`text-xs px-2 py-1 rounded-full border capitalize ${STATUS_COLORS[pass.status] || 'bg-slate-500/20 text-slate-400'}`}>
                                                    {pass.status}
                                                </span>
                                                <span className={`text-xs px-2 py-1 rounded-full border capitalize ${pass.type === 'inward' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-purple-500/20 text-purple-400 border-purple-500/30'}`}>
                                                    {pass.type}
                                                </span>
                                            </div>
                                            <div className="text-slate-400 text-sm mt-1">
                                                {pass.department} • {pass.driver_name} • {pass.vehicle_number}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-slate-400 text-sm">
                                                {new Date(pass.created_at).toLocaleDateString('en-IN')}
                                            </div>
                                            <div className="text-slate-500 text-xs mt-1">
                                                {pass.materials?.length || 0} materials
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}