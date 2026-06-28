'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { requireRole } from '@/lib/auth'
import { STATUS_COLORS, STATUS_LABELS, PASS_TYPE_COLORS, PASS_TYPE_LABELS, formatDate, isOverdue } from '@/lib/gatepass'
import { PortalHeader } from '@/components/PortalHeader'

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
}

const ROLE_LABELS: Record<string, string> = {
    user: 'Department User',
    approver: 'Approver',
    security: 'Security Gate',
    admin: 'Administrator',
}

export default function DashboardPage() {
    const [email, setEmail] = useState('')
    const [role, setRole] = useState('')
    const [loading, setLoading] = useState(true)
    const [passes, setPasses] = useState<GatePass[]>([])
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const router = useRouter()

    useEffect(() => {
        const fetchData = async () => {
            const profile = await requireRole(['user', 'approver', 'security', 'admin'], router, '/vendor/dashboard')
            if (!profile) return

            setEmail(profile.email)
            setRole(profile.role)

            const { data } = await supabase
                .from('gate_passes')
                .select('*')
                .order('created_at', { ascending: false })

            setPasses(data || [])
            setLoading(false)
        }
        fetchData()
    }, [])

    const filtered = passes.filter(p => {
        const matchSearch = p.pass_number.toLowerCase().includes(search.toLowerCase()) ||
            p.driver_name.toLowerCase().includes(search.toLowerCase()) ||
            p.department.toLowerCase().includes(search.toLowerCase())
        const effectiveStatus = isOverdue(p) ? 'overdue' : p.status
        const matchStatus = statusFilter === 'all' || effectiveStatus === statusFilter
        return matchSearch && matchStatus
    })

    const stats = {
        total: passes.length,
        pending: passes.filter(p => p.status === 'pending').length,
        approved: passes.filter(p => p.status === 'approved').length,
        out: passes.filter(p => p.status === 'exited').length,
        overdue: passes.filter(p => isOverdue(p)).length,
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    if (loading) return (
        <div className="min-h-screen bg-gp-paper flex items-center justify-center">
            <p className="text-gp-steel text-sm uppercase tracking-wide">Loading records…</p>
        </div>
    )

    return (
        <main className="min-h-screen bg-gp-paper flex flex-col">
            <PortalHeader userName={email} roleLabel={ROLE_LABELS[role] || role} onLogout={handleLogout} />

            <div className="flex-1 px-4 sm:px-6 py-6 sm:py-8">
                <div className="max-w-6xl mx-auto">

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-gp-steel mb-1">Records Register</p>
                            <h1 className="text-2xl sm:text-3xl font-heading font-semibold text-gp-ink">Gate Pass Dashboard</h1>
                        </div>
                        <div className="flex gap-3 w-full sm:w-auto">
                            <button
                                onClick={() => router.push('/gate-pass/new')}
                                className="flex-1 sm:flex-none px-4 py-3 sm:py-2 rounded-sm bg-gp-navy hover:bg-gp-navy-deep text-gp-paper font-medium transition text-sm"
                            >
                                + New Gate Pass
                            </button>
                            <button
                                onClick={() => router.push('/security')}
                                className="flex-1 sm:flex-none px-4 py-3 sm:py-2 rounded-sm border border-gp-navy/30 text-gp-navy hover:bg-gp-navy/5 font-medium transition text-sm"
                            >
                                Security Gate
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 mb-6">
                        {[
                            { label: 'Total', value: stats.total, text: 'text-gp-ink', accent: 'bg-gp-steel' },
                            { label: 'Pending', value: stats.pending, text: 'text-gp-amber', accent: 'bg-gp-amber' },
                            { label: 'Approved', value: stats.approved, text: 'text-gp-forest', accent: 'bg-gp-forest' },
                            { label: 'Out (Exited)', value: stats.out, text: 'text-gp-navy', accent: 'bg-gp-navy' },
                            { label: 'Overdue', value: stats.overdue, text: 'text-gp-rust', accent: 'bg-gp-rust' },
                        ].map(stat => (
                            <div key={stat.label} className="bg-card border border-gp-line rounded-sm overflow-hidden">
                                <div className={`h-1 ${stat.accent}`} />
                                <div className="p-3 sm:p-4">
                                    <p className="text-gp-steel text-[11px] uppercase tracking-wide">{stat.label}</p>
                                    <p className={`text-2xl sm:text-3xl font-heading font-semibold mt-1 ${stat.text}`}>{stat.value}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 mb-4">
                        <input
                            type="text"
                            placeholder="Search by pass number, driver, department..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="flex-1 px-4 py-3 sm:py-2 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-navy focus:ring-2 focus:ring-gp-navy/10 transition text-sm"
                        />
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="px-4 py-3 sm:py-2 rounded-sm bg-white border border-gp-line text-gp-ink outline-none focus:border-gp-navy focus:ring-2 focus:ring-gp-navy/10 transition text-sm"
                        >
                            <option value="all">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="exited">Out (Exited)</option>
                            <option value="overdue">Overdue</option>
                            <option value="completed">Completed</option>
                            <option value="rejected">Rejected</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>

                    {filtered.length === 0 ? (
                        <div className="bg-card border border-gp-line rounded-sm text-center py-14 text-gp-steel">
                            <p className="text-sm uppercase tracking-wide">No gate passes found</p>
                            <p className="text-xs mt-2 text-gp-steel/70">Try adjusting your search or filter above.</p>
                        </div>
                    ) : (
                        <>
                            <div className="hidden md:block bg-card border border-gp-line rounded-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-gp-line bg-gp-navy/5">
                                                <th className="text-left text-gp-steel text-[11px] uppercase tracking-wide font-medium px-6 py-3">Pass Number</th>
                                                <th className="text-left text-gp-steel text-[11px] uppercase tracking-wide font-medium px-6 py-3">Type</th>
                                                <th className="text-left text-gp-steel text-[11px] uppercase tracking-wide font-medium px-6 py-3">Department</th>
                                                <th className="text-left text-gp-steel text-[11px] uppercase tracking-wide font-medium px-6 py-3">Driver</th>
                                                <th className="text-left text-gp-steel text-[11px] uppercase tracking-wide font-medium px-6 py-3">Status</th>
                                                <th className="text-left text-gp-steel text-[11px] uppercase tracking-wide font-medium px-6 py-3">Date</th>
                                                <th className="text-left text-gp-steel text-[11px] uppercase tracking-wide font-medium px-6 py-3">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filtered.map(pass => {
                                                const overdue = isOverdue(pass)
                                                const effStatus = overdue ? 'overdue' : pass.status
                                                return (
                                                    <tr key={pass.id} className="border-b border-gp-line/60 hover:bg-gp-navy/[0.03] transition">
                                                        <td className="px-6 py-4 text-gp-ink font-mono text-sm">{pass.pass_number}</td>
                                                        <td className="px-6 py-4">
                                                            <span className={`text-[11px] px-2 py-1 rounded-sm border uppercase tracking-wide font-medium ${PASS_TYPE_COLORS[pass.type] || 'bg-gp-steel/10 text-gp-steel border-gp-steel/30'}`}>
                                                                {PASS_TYPE_LABELS[pass.type] || pass.type}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-gp-steel text-sm">{pass.department}</td>
                                                        <td className="px-6 py-4 text-gp-steel text-sm">{pass.driver_name}</td>
                                                        <td className="px-6 py-4">
                                                            <span className={`text-[11px] px-2 py-1 rounded-sm border uppercase tracking-wide font-medium ${STATUS_COLORS[effStatus]}`}>
                                                                {STATUS_LABELS[effStatus] || effStatus}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-gp-steel text-sm font-mono">
                                                            {formatDate(pass.created_at)}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <button
                                                                onClick={() => router.push(`/gate-pass/${pass.id}`)}
                                                                className="px-3 py-1 rounded-sm bg-gp-navy/5 hover:bg-gp-navy/10 text-gp-navy text-xs font-medium border border-gp-navy/20 transition"
                                                            >
                                                                View
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="md:hidden space-y-3">
                                {filtered.map(pass => {
                                    const overdue = isOverdue(pass)
                                    const effStatus = overdue ? 'overdue' : pass.status
                                    return (
                                        <div
                                            key={pass.id}
                                            onClick={() => router.push(`/gate-pass/${pass.id}`)}
                                            className="bg-card border border-gp-line rounded-sm p-4 active:bg-gp-navy/[0.03] transition cursor-pointer"
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-gp-ink font-mono font-semibold text-sm">{pass.pass_number}</span>
                                                <span className={`text-[11px] px-2 py-1 rounded-sm border uppercase tracking-wide font-medium ${STATUS_COLORS[effStatus]}`}>
                                                    {STATUS_LABELS[effStatus] || effStatus}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`text-[11px] px-2 py-1 rounded-sm border uppercase tracking-wide font-medium ${PASS_TYPE_COLORS[pass.type] || 'bg-gp-steel/10 text-gp-steel border-gp-steel/30'}`}>
                                                    {PASS_TYPE_LABELS[pass.type] || pass.type}
                                                </span>
                                                <span className="text-gp-steel/70 text-xs font-mono">
                                                    {formatDate(pass.created_at)}
                                                </span>
                                            </div>
                                            <div className="text-gp-steel text-sm">
                                                <p>{pass.department} • {pass.driver_name}</p>
                                                <p className="text-gp-steel/70 font-mono text-xs mt-0.5">{pass.vehicle_number}</p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </>
                    )}

                </div>
            </div>
        </main>
    )
}