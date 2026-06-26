'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
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
    materials: any[]
    approved_at: string
    expiry_date: string
    exited_at: string
    returned_at: string
}

export default function SecurityPage() {
    const router = useRouter()
    const [searchTerm, setSearchTerm] = useState('')
    const [searching, setSearching] = useState(false)
    const [searchError, setSearchError] = useState('')
    const [pass, setPass] = useState<GatePass | null>(null)
    const [actionLoading, setActionLoading] = useState(false)
    const [denyReason, setDenyReason] = useState('')
    const [showDenyInput, setShowDenyInput] = useState<'exit' | 'return' | null>(null)

    const [awaitingExit, setAwaitingExit] = useState<GatePass[]>([])
    const [awaitingReturn, setAwaitingReturn] = useState<GatePass[]>([])
    const [listLoading, setListLoading] = useState(true)
    const [tab, setTab] = useState<'exit' | 'return'>('exit')

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return router.push('/login')
            await fetchLists()
        }
        init()
    }, [])

    const fetchLists = async () => {
        setListLoading(true)
        const { data: exitData } = await supabase
            .from('gate_passes')
            .select('*')
            .eq('status', 'approved')
            .order('approved_at', { ascending: false })

        const { data: returnData } = await supabase
            .from('gate_passes')
            .select('*')
            .eq('status', 'exited')
            .eq('type', 'returnable')
            .order('exited_at', { ascending: false })

        setAwaitingExit(exitData || [])
        setAwaitingReturn(returnData || [])
        setListLoading(false)
    }

    const loadPass = async (idOrPassNumber: string) => {
        setSearchError('')
        setPass(null)
        setShowDenyInput(null)
        setDenyReason('')
        if (!idOrPassNumber.trim()) return
        setSearching(true)

        const term = idOrPassNumber.trim()
        // Try exact pass_number match first, then fall back to id (uuid)
        let { data } = await supabase
            .from('gate_passes')
            .select('*')
            .eq('pass_number', term)
            .maybeSingle()

        if (!data) {
            const byId = await supabase
                .from('gate_passes')
                .select('*')
                .eq('id', term)
                .maybeSingle()
            data = byId.data
        }

        if (!data) {
            setSearchError('No gate pass found with that ID / pass number. Please check and try again.')
        } else {
            setPass(data)
        }
        setSearching(false)
    }

    const handleSearch = () => loadPass(searchTerm)

    const handleApproveExit = async () => {
        if (!pass) return
        setActionLoading(true)
        const { data: { session } } = await supabase.auth.getSession()

        const newStatus = pass.type === 'returnable' ? 'exited' : 'completed'

        await supabase
            .from('gate_passes')
            .update({
                status: newStatus,
                exited_at: new Date().toISOString(),
                exit_verified_by: session?.user.id,
            })
            .eq('id', pass.id)

        await supabase.from('activity_logs').insert({
            gate_pass_id: pass.id,
            user_id: session?.user.id,
            action: 'gate_exit_approved',
        })

        setPass(prev => prev ? { ...prev, status: newStatus, exited_at: new Date().toISOString() } : null)
        setActionLoading(false)
        fetchLists()
    }

    const handleDenyExit = async () => {
        if (!pass || !denyReason) return
        setActionLoading(true)
        const { data: { session } } = await supabase.auth.getSession()

        await supabase
            .from('gate_passes')
            .update({ gate_reject_reason: denyReason })
            .eq('id', pass.id)

        await supabase.from('activity_logs').insert({
            gate_pass_id: pass.id,
            user_id: session?.user.id,
            action: 'gate_exit_denied',
            metadata: { reason: denyReason },
        })

        setShowDenyInput(null)
        setDenyReason('')
        setActionLoading(false)
    }

    const handleApproveReturn = async () => {
        if (!pass) return
        setActionLoading(true)
        const { data: { session } } = await supabase.auth.getSession()

        await supabase
            .from('gate_passes')
            .update({
                status: 'completed',
                returned_at: new Date().toISOString(),
                return_verified_by: session?.user.id,
            })
            .eq('id', pass.id)

        await supabase.from('activity_logs').insert({
            gate_pass_id: pass.id,
            user_id: session?.user.id,
            action: 'gate_return_approved',
        })

        setPass(prev => prev ? { ...prev, status: 'completed', returned_at: new Date().toISOString() } : null)
        setActionLoading(false)
        fetchLists()
    }

    const handleDenyReturn = async () => {
        if (!pass || !denyReason) return
        setActionLoading(true)
        const { data: { session } } = await supabase.auth.getSession()

        await supabase
            .from('gate_passes')
            .update({ gate_reject_reason: denyReason })
            .eq('id', pass.id)

        await supabase.from('activity_logs').insert({
            gate_pass_id: pass.id,
            user_id: session?.user.id,
            action: 'gate_return_denied',
            metadata: { reason: denyReason },
        })

        setShowDenyInput(null)
        setDenyReason('')
        setActionLoading(false)
    }

    const overdue = pass ? isOverdue(pass) : false

    return (
        <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
            <div className="max-w-3xl mx-auto">

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Security Gate Check</h1>
                        <p className="text-gray-500 mt-1">Enter a gate pass ID or number to verify it</p>
                    </div>
                    <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-900 transition text-sm font-medium">
                        ← Back
                    </button>
                </div>

                {/* Search box */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Gate Pass ID / Number</label>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            placeholder="e.g. GP/2026/000123"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            className="flex-1 px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition text-lg"
                            autoFocus
                        />
                        <button
                            onClick={handleSearch}
                            disabled={searching}
                            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold transition"
                        >
                            {searching ? 'Checking...' : 'Check'}
                        </button>
                    </div>
                    {searchError && (
                        <p className="text-red-600 text-sm mt-3">{searchError}</p>
                    )}
                </div>

                {/* Result card */}
                {pass && (
                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 mb-6">
                        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">{pass.pass_number}</h2>
                                <div className="flex gap-2 mt-2 flex-wrap">
                                    <span className={`text-xs px-3 py-1 rounded-full border font-medium ${overdue ? STATUS_COLORS.overdue : STATUS_COLORS[pass.status]}`}>
                                        {overdue ? STATUS_LABELS.overdue : (STATUS_LABELS[pass.status] || pass.status)}
                                    </span>
                                    <span className={`text-xs px-3 py-1 rounded-full border font-medium ${PASS_TYPE_COLORS[pass.type]}`}>
                                        {PASS_TYPE_LABELS[pass.type] || pass.type}
                                    </span>
                                </div>
                            </div>
                            <a
                                href={`/gate-pass/${pass.id}`}
                                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                            >
                                Full Details →
                            </a>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400 text-xs mb-1">Vehicle Number</p>
                                <p className="text-gray-900 font-medium">{pass.vehicle_number}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400 text-xs mb-1">Department</p>
                                <p className="text-gray-900 font-medium">{pass.department}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400 text-xs mb-1">From → To</p>
                                <p className="text-gray-900 font-medium">{pass.from_location || 'N/A'} → {pass.to_location || 'N/A'}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400 text-xs mb-1">Driver</p>
                                <p className="text-gray-900 font-medium">{pass.driver_name}</p>
                            </div>
                            {pass.type === 'returnable' && (
                                <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                                    <p className="text-gray-400 text-xs mb-1">Valid Until</p>
                                    <p className={`font-medium ${overdue ? 'text-orange-600' : 'text-gray-900'}`}>{formatDate(pass.expiry_date)}</p>
                                </div>
                            )}
                        </div>

                        <div className="text-gray-500 text-sm mb-4">
                            {pass.materials?.length} material item(s)
                        </div>

                        {/* Action area depending on status */}
                        {pass.status === 'pending' && (
                            <p className="text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-xl p-4">
                                This pass has not been approved yet. It cannot exit the gate.
                            </p>
                        )}

                        {pass.status === 'rejected' && (
                            <p className="text-red-700 text-sm bg-red-50 border border-red-200 rounded-xl p-4">
                                This pass was rejected and is not valid for gate exit.
                            </p>
                        )}

                        {pass.status === 'cancelled' && (
                            <p className="text-gray-600 text-sm bg-gray-50 border border-gray-200 rounded-xl p-4">
                                This pass was cancelled and is not valid for gate exit.
                            </p>
                        )}

                        {pass.status === 'approved' && (
                            <div>
                                <p className="text-sm text-gray-600 mb-3">Verify vehicle, driver and materials match this pass, then:</p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleApproveExit}
                                        disabled={actionLoading}
                                        className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-semibold transition"
                                    >
                                        ✓ Approve Exit
                                    </button>
                                    <button
                                        onClick={() => setShowDenyInput(showDenyInput === 'exit' ? null : 'exit')}
                                        className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition"
                                    >
                                        ✕ Deny Exit
                                    </button>
                                </div>
                                {showDenyInput === 'exit' && (
                                    <div className="mt-3">
                                        <input
                                            type="text"
                                            placeholder="Reason for denying exit..."
                                            value={denyReason}
                                            onChange={e => setDenyReason(e.target.value)}
                                            className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-red-500 transition mb-2"
                                        />
                                        <button
                                            onClick={handleDenyExit}
                                            disabled={actionLoading || !denyReason}
                                            className="w-full py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium transition"
                                        >
                                            Confirm Denial
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {pass.status === 'exited' && pass.type === 'returnable' && (
                            <div>
                                {overdue && (
                                    <p className="text-orange-700 text-sm bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3">
                                        ⚠️ This material is overdue for return.
                                    </p>
                                )}
                                <p className="text-sm text-gray-600 mb-3">Material is out. When it comes back through the gate:</p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleApproveReturn}
                                        disabled={actionLoading}
                                        className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-semibold transition"
                                    >
                                        ✓ Mark Returned
                                    </button>
                                    <button
                                        onClick={() => setShowDenyInput(showDenyInput === 'return' ? null : 'return')}
                                        className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition"
                                    >
                                        ✕ Flag Issue
                                    </button>
                                </div>
                                {showDenyInput === 'return' && (
                                    <div className="mt-3">
                                        <input
                                            type="text"
                                            placeholder="What's wrong (mismatch, damage, etc.)..."
                                            value={denyReason}
                                            onChange={e => setDenyReason(e.target.value)}
                                            className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-red-500 transition mb-2"
                                        />
                                        <button
                                            onClick={handleDenyReturn}
                                            disabled={actionLoading || !denyReason}
                                            className="w-full py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium transition"
                                        >
                                            Confirm Flag
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {pass.status === 'completed' && (
                            <p className="text-violet-700 text-sm bg-violet-50 border border-violet-200 rounded-xl p-4">
                                ✓ This gate pass is fully completed. {pass.returned_at ? `Returned ${formatDateTime(pass.returned_at)}.` : pass.exited_at ? `Exited ${formatDateTime(pass.exited_at)}.` : ''}
                            </p>
                        )}
                    </div>
                )}

                {/* Pending lists for quick reference */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                    <div className="flex gap-2 mb-4">
                        <button
                            onClick={() => setTab('exit')}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === 'exit' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            Awaiting Exit ({awaitingExit.length})
                        </button>
                        <button
                            onClick={() => setTab('return')}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === 'return' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            Awaiting Return ({awaitingReturn.length})
                        </button>
                    </div>

                    {listLoading ? (
                        <p className="text-gray-400 text-sm py-6 text-center">Loading...</p>
                    ) : (
                        <div className="space-y-2">
                            {(tab === 'exit' ? awaitingExit : awaitingReturn).length === 0 ? (
                                <p className="text-gray-400 text-sm py-6 text-center">Nothing here right now.</p>
                            ) : (
                                (tab === 'exit' ? awaitingExit : awaitingReturn).map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => { setSearchTerm(p.pass_number); loadPass(p.pass_number) }}
                                        className="w-full text-left bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl p-3 transition flex items-center justify-between"
                                    >
                                        <div>
                                            <span className="text-gray-900 font-medium text-sm">{p.pass_number}</span>
                                            <span className="text-gray-500 text-sm ml-2">{p.department} • {p.vehicle_number}</span>
                                        </div>
                                        <span className="text-blue-600 text-sm">Check →</span>
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>

            </div>
        </main>
    )
}
