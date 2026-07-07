'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { requireRole } from '@/lib/auth'
import { STATUS_COLORS, STATUS_LABELS, PASS_TYPE_COLORS, PASS_TYPE_LABELS, formatDate, formatDateTime, isOverdue } from '@/lib/gatepass'
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
    materials: any[]
    approved_at: string
    expiry_date: string
    exited_at: string
    returned_at: string
    gate_reject_reason: string | null
}

const ROLE_LABELS: Record<string, string> = {
    user: 'Department User',
    security: 'Security Gate',
    admin: 'Administrator',
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
    const [viewerRole, setViewerRole] = useState('')
    const [viewerName, setViewerName] = useState('')

    const [awaitingExit, setAwaitingExit] = useState<GatePass[]>([])
    const [awaitingReturn, setAwaitingReturn] = useState<GatePass[]>([])
    const [listLoading, setListLoading] = useState(true)
    const [tab, setTab] = useState<'exit' | 'return'>('exit')

    useEffect(() => {
        const init = async () => {
            // This is the CISF / security checkpoint portal — only
            // security staff and admins should ever land here.
            const profile = await requireRole(['security', 'admin'], router, '/dashboard')
            if (!profile) return
            setViewerRole(profile.role)
            setViewerName(profile.full_name || profile.email)
            await fetchLists()
        }
        init()
    }, [])

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

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
                gate_reject_reason: null,
            })
            .eq('id', pass.id)

        await supabase.from('activity_logs').insert({
            gate_pass_id: pass.id,
            user_id: session?.user.id,
            action: 'gate_exit_approved',
        })

        setPass(prev => prev ? { ...prev, status: newStatus, exited_at: new Date().toISOString(), gate_reject_reason: null } : null)
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

        setPass(prev => prev ? { ...prev, gate_reject_reason: denyReason } : null)
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
                gate_reject_reason: null,
            })
            .eq('id', pass.id)

        await supabase.from('activity_logs').insert({
            gate_pass_id: pass.id,
            user_id: session?.user.id,
            action: 'gate_return_approved',
        })

        setPass(prev => prev ? { ...prev, status: 'completed', returned_at: new Date().toISOString(), gate_reject_reason: null } : null)
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

        setPass(prev => prev ? { ...prev, gate_reject_reason: denyReason } : null)
        setShowDenyInput(null)
        setDenyReason('')
        setActionLoading(false)
    }

    const overdue = pass ? isOverdue(pass) : false
    const inputClass = "w-full px-4 py-3 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-navy focus:ring-2 focus:ring-gp-navy/10 transition"

    return (
        <main className="min-h-screen bg-gp-paper flex flex-col">
            <PortalHeader
                userName={viewerName}
                roleLabel={ROLE_LABELS[viewerRole] || viewerRole}
                onLogout={handleLogout}
            />

            <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8">

                {/* Header */}
                <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-gp-steel mb-1">
                            Checkpoint Verification
                        </p>
                        <h1 className="text-2xl font-heading font-semibold text-gp-ink">Security Gate Check</h1>
                        <p className="text-gp-steel text-sm mt-1">Enter a gate pass ID or number to verify it</p>
                    </div>
                    {viewerRole === 'admin' && (
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="text-gp-steel hover:text-gp-navy transition text-sm font-medium"
                        >
                            ← Back to Dashboard
                        </button>
                    )}
                </div>

                {/* Search box */}
                <div className="bg-white border border-gp-line rounded-md shadow-sm p-6 mb-6">
                    <div className="h-1 bg-gp-navy -m-6 mb-6 rounded-t-md" />
                    <label className="block text-xs uppercase tracking-wide text-gp-steel mb-2">Gate Pass ID / Number</label>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            placeholder="e.g. GP/2026/000123"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            className={`flex-1 text-lg ${inputClass}`}
                            autoFocus
                        />
                        <button
                            onClick={handleSearch}
                            disabled={searching}
                            className="px-6 py-3 rounded-sm bg-gp-navy hover:bg-gp-navy-deep disabled:bg-gp-navy/40 text-gp-paper font-semibold transition tracking-wide"
                        >
                            {searching ? 'Checking…' : 'Check'}
                        </button>
                    </div>
                    {searchError && (
                        <p className="text-sm text-gp-rust bg-gp-rust/5 border border-gp-rust/30 rounded-sm px-3 py-2 mt-3">
                            {searchError}
                        </p>
                    )}
                </div>

                {/* Result card */}
                {pass && (
                    <div className="bg-white border border-gp-line rounded-md shadow-sm p-6 mb-6">
                        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
                            <div>
                                <h2 className="text-lg font-heading font-semibold text-gp-ink">{pass.pass_number}</h2>
                                <div className="flex gap-2 mt-2 flex-wrap">
                                    <span className={`text-xs px-3 py-1 rounded-sm border font-medium uppercase tracking-wide ${overdue ? STATUS_COLORS.overdue : STATUS_COLORS[pass.status]}`}>
                                        {overdue ? STATUS_LABELS.overdue : (STATUS_LABELS[pass.status] || pass.status)}
                                    </span>
                                    <span className={`text-xs px-3 py-1 rounded-sm border font-medium uppercase tracking-wide ${PASS_TYPE_COLORS[pass.type]}`}>
                                        {PASS_TYPE_LABELS[pass.type] || pass.type}
                                    </span>
                                </div>
                            </div>

                            <a href={`/gate-pass/${pass.id}`}
                                className="text-gp-navy hover:text-gp-amber text-sm font-medium"
                            >
                                Full Details →
                            </a>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-gp-paper/60 border border-gp-line rounded-sm p-3">
                                <p className="text-gp-steel text-xs mb-1 uppercase tracking-wide">Vehicle Number</p>
                                <p className="text-gp-ink font-medium">{pass.vehicle_number}</p>
                            </div>
                            <div className="bg-gp-paper/60 border border-gp-line rounded-sm p-3">
                                <p className="text-gp-steel text-xs mb-1 uppercase tracking-wide">Department</p>
                                <p className="text-gp-ink font-medium">{pass.department}</p>
                            </div>
                            <div className="bg-gp-paper/60 border border-gp-line rounded-sm p-3">
                                <p className="text-gp-steel text-xs mb-1 uppercase tracking-wide">From → To</p>
                                <p className="text-gp-ink font-medium">{pass.from_location || 'N/A'} → {pass.to_location || 'N/A'}</p>
                            </div>
                            <div className="bg-gp-paper/60 border border-gp-line rounded-sm p-3">
                                <p className="text-gp-steel text-xs mb-1 uppercase tracking-wide">Driver</p>
                                <p className="text-gp-ink font-medium">{pass.driver_name}</p>
                            </div>
                            {pass.type === 'returnable' && (
                                <div className="bg-gp-paper/60 border border-gp-line rounded-sm p-3 col-span-2">
                                    <p className="text-gp-steel text-xs mb-1 uppercase tracking-wide">Valid Until</p>
                                    <p className={`font-medium ${overdue ? 'text-gp-rust' : 'text-gp-ink'}`}>{formatDate(pass.expiry_date)}</p>
                                </div>
                            )}
                        </div>

                        <div className="text-gp-steel text-sm mb-4">
                            {pass.materials?.length} material item(s)
                        </div>

                        {/* Action area depending on status */}
                        {pass.status === 'pending' && (
                            <p className="text-sm text-gp-amber bg-gp-amber/5 border border-gp-amber/30 rounded-sm p-4">
                                This pass has not been approved yet. It cannot exit the gate.
                            </p>
                        )}

                        {pass.status === 'rejected' && (
                            <p className="text-sm text-gp-rust bg-gp-rust/5 border border-gp-rust/30 rounded-sm p-4">
                                This pass was rejected and is not valid for gate exit.
                            </p>
                        )}

                        {pass.status === 'cancelled' && (
                            <p className="text-sm text-gp-steel bg-gp-steel/5 border border-gp-steel/30 rounded-sm p-4">
                                This pass was cancelled and is not valid for gate exit.
                            </p>
                        )}

                        {pass.status === 'approved' && (
                            <div>
                                {pass.gate_reject_reason && (
                                    <p className="text-sm text-gp-rust bg-gp-rust/5 border border-gp-rust/30 rounded-sm p-3 mb-3">
                                        ✕ Exit was denied at the gate — <span className="font-medium">{pass.gate_reject_reason}</span>. Re-check and approve once resolved.
                                    </p>
                                )}
                                <p className="text-sm text-gp-steel mb-3">Verify vehicle, driver and materials match this pass, then:</p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleApproveExit}
                                        disabled={actionLoading}
                                        className="flex-1 py-3 rounded-sm bg-gp-forest hover:bg-gp-forest/90 disabled:bg-gp-forest/40 text-gp-paper font-semibold transition tracking-wide"
                                    >
                                        ✓ Approve Exit
                                    </button>
                                    <button
                                        onClick={() => setShowDenyInput(showDenyInput === 'exit' ? null : 'exit')}
                                        className="flex-1 py-3 rounded-sm bg-gp-rust hover:bg-gp-rust/90 text-gp-paper font-semibold transition tracking-wide"
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
                                            className="w-full px-4 py-3 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-rust transition mb-2"
                                        />
                                        <button
                                            onClick={handleDenyExit}
                                            disabled={actionLoading || !denyReason}
                                            className="w-full py-2 rounded-sm bg-gp-rust hover:bg-gp-rust/90 disabled:bg-gp-rust/40 text-gp-paper text-sm font-medium transition"
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
                                    <p className="text-sm text-gp-rust bg-gp-rust/5 border border-gp-rust/30 rounded-sm p-3 mb-3">
                                        ⚠️ This material is overdue for return.
                                    </p>
                                )}
                                {pass.gate_reject_reason && (
                                    <p className="text-sm text-gp-rust bg-gp-rust/5 border border-gp-rust/30 rounded-sm p-3 mb-3">
                                        ✕ Return was flagged — <span className="font-medium">{pass.gate_reject_reason}</span>. Re-check and confirm once resolved.
                                    </p>
                                )}
                                <p className="text-sm text-gp-steel mb-3">Material is out. When it comes back through the gate:</p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleApproveReturn}
                                        disabled={actionLoading}
                                        className="flex-1 py-3 rounded-sm bg-gp-forest hover:bg-gp-forest/90 disabled:bg-gp-forest/40 text-gp-paper font-semibold transition tracking-wide"
                                    >
                                        ✓ Mark Returned
                                    </button>
                                    <button
                                        onClick={() => setShowDenyInput(showDenyInput === 'return' ? null : 'return')}
                                        className="flex-1 py-3 rounded-sm bg-gp-rust hover:bg-gp-rust/90 text-gp-paper font-semibold transition tracking-wide"
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
                                            className="w-full px-4 py-3 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-rust transition mb-2"
                                        />
                                        <button
                                            onClick={handleDenyReturn}
                                            disabled={actionLoading || !denyReason}
                                            className="w-full py-2 rounded-sm bg-gp-rust hover:bg-gp-rust/90 disabled:bg-gp-rust/40 text-gp-paper text-sm font-medium transition"
                                        >
                                            Confirm Flag
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {pass.status === 'completed' && (
                            <p className="text-sm text-gp-paper bg-gp-navy border border-gp-navy rounded-sm p-4">
                                ✓ This gate pass is fully completed. {pass.returned_at ? `Returned ${formatDateTime(pass.returned_at)}.` : pass.exited_at ? `Exited ${formatDateTime(pass.exited_at)}.` : ''}
                            </p>
                        )}
                    </div>
                )}

                {/* Pending lists for quick reference */}
                <div className="bg-white border border-gp-line rounded-md shadow-sm p-6">
                    <div className="flex gap-2 mb-4">
                        <button
                            onClick={() => setTab('exit')}
                            className={`px-4 py-2 rounded-sm text-xs font-semibold uppercase tracking-wide border transition ${tab === 'exit' ? 'bg-gp-navy text-gp-paper border-gp-navy' : 'bg-white text-gp-steel border-gp-line hover:border-gp-navy/40 hover:text-gp-navy'}`}
                        >
                            Awaiting Exit ({awaitingExit.length})
                        </button>
                        <button
                            onClick={() => setTab('return')}
                            className={`px-4 py-2 rounded-sm text-xs font-semibold uppercase tracking-wide border transition ${tab === 'return' ? 'bg-gp-navy text-gp-paper border-gp-navy' : 'bg-white text-gp-steel border-gp-line hover:border-gp-navy/40 hover:text-gp-navy'}`}
                        >
                            Awaiting Return ({awaitingReturn.length})
                        </button>
                    </div>

                    {listLoading ? (
                        <p className="text-gp-steel text-sm py-6 text-center">Loading...</p>
                    ) : (
                        <div className="space-y-2">
                            {(tab === 'exit' ? awaitingExit : awaitingReturn).length === 0 ? (
                                <p className="text-gp-steel text-sm py-6 text-center">Nothing here right now.</p>
                            ) : (
                                (tab === 'exit' ? awaitingExit : awaitingReturn).map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => { setSearchTerm(p.pass_number); loadPass(p.pass_number) }}
                                        className="w-full text-left bg-gp-paper/60 hover:bg-gp-paper border border-gp-line rounded-sm p-3 transition flex items-center justify-between"
                                    >
                                        <div>
                                            <span className="text-gp-ink font-medium text-sm">{p.pass_number}</span>
                                            <span className="text-gp-steel text-sm ml-2">{p.department} • {p.vehicle_number}</span>
                                        </div>
                                        <span className="text-gp-navy text-sm">Check →</span>
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
