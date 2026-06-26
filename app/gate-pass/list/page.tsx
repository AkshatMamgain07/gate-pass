'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { STATUS_COLORS, STATUS_LABELS, PASS_TYPE_COLORS, PASS_TYPE_LABELS, formatDate, isOverdue } from '@/lib/gatepass'

interface GatePass {
    id: string
    pass_number: string
    type: string
    status: string
    department: string
    driver_name: string
    vehicle_number: string
    created_at: string
    expiry_date: string
    materials: any[]
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

    const filtered = filter === 'all' ? passes : passes.filter(p => (isOverdue(p) ? 'overdue' : p.status) === filter)

    if (loading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <p className="text-gray-500 text-lg">Loading...</p>
        </div>
    )

    return (
        <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
            <div className="max-w-5xl mx-auto">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8">

                    {/* Header */}
                    <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">All Gate Passes</h1>
                            <p className="text-gray-500 mt-1">{passes.length} total passes</p>
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
                                className="px-4 py-2 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium transition"
                            >
                                ← Back
                            </button>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex gap-2 mb-6 flex-wrap">
                        {['all', 'pending', 'approved', 'exited', 'overdue', 'completed', 'rejected', 'cancelled'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition ${filter === f
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                {f === 'all' ? 'All' : (STATUS_LABELS[f] || f)}
                            </button>
                        ))}
                    </div>

                    {/* List */}
                    {filtered.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <p className="text-4xl mb-3">📭</p>
                            <p>No gate passes found</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filtered.map(pass => {
                                const overdue = isOverdue(pass)
                                const effStatus = overdue ? 'overdue' : pass.status
                                return (
                                    <div
                                        key={pass.id}
                                        className="bg-gray-50 border border-gray-200 rounded-xl p-4 hover:bg-gray-100 transition cursor-pointer"
                                        onClick={() => router.push(`/gate-pass/${pass.id}`)}
                                    >
                                        <div className="flex items-center justify-between flex-wrap gap-3">
                                            <div>
                                                <div className="flex items-center gap-3 flex-wrap">
                                                    <span className="text-gray-900 font-semibold">{pass.pass_number}</span>
                                                    <span className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_COLORS[effStatus] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                                        {STATUS_LABELS[effStatus] || effStatus}
                                                    </span>
                                                    <span className={`text-xs px-2 py-1 rounded-full border font-medium ${PASS_TYPE_COLORS[pass.type] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                                        {PASS_TYPE_LABELS[pass.type] || pass.type}
                                                    </span>
                                                </div>
                                                <div className="text-gray-500 text-sm mt-1">
                                                    {pass.department} • {pass.driver_name} • {pass.vehicle_number}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-gray-500 text-sm">
                                                    {formatDate(pass.created_at)}
                                                </div>
                                                <div className="text-gray-400 text-xs mt-1">
                                                    {pass.materials?.length || 0} materials
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}
