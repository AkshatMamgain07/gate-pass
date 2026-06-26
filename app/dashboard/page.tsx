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
}

export default function DashboardPage() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(true)
    const [passes, setPasses] = useState<GatePass[]>([])
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const router = useRouter()

    useEffect(() => {
        const fetchData = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return router.push('/login')
            setEmail(session.user.email || '')

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
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <p className="text-gray-500 text-lg">Loading...</p>
        </div>
    )

    return (
        <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
            <div className="max-w-6xl mx-auto">

                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
                        <p className="text-gray-500 mt-1 text-sm sm:text-base break-all">Welcome, {email}</p>
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button
                            onClick={() => router.push('/gate-pass/new')}
                            className="flex-1 sm:flex-none px-4 py-3 sm:py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition text-sm sm:text-base"
                        >
                            + New Gate Pass
                        </button>
                        <button
                            onClick={() => router.push('/security')}
                            className="flex-1 sm:flex-none px-4 py-3 sm:py-2 rounded-xl bg-gray-900 hover:bg-gray-700 text-white font-medium transition text-sm sm:text-base"
                        >
                            Security Gate
                        </button>
                        <button
                            onClick={handleLogout}
                            className="flex-1 sm:flex-none px-4 py-3 sm:py-2 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium transition text-sm sm:text-base"
                        >
                            Logout
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 mb-6">
                    {[
                        { label: 'Total', value: stats.total, color: 'border-gray-200 bg-white', text: 'text-gray-700' },
                        { label: 'Pending', value: stats.pending, color: 'border-amber-200 bg-amber-50', text: 'text-amber-600' },
                        { label: 'Approved', value: stats.approved, color: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-600' },
                        { label: 'Out (Exited)', value: stats.out, color: 'border-blue-200 bg-blue-50', text: 'text-blue-600' },
                        { label: 'Overdue', value: stats.overdue, color: 'border-orange-200 bg-orange-50', text: 'text-orange-600' },
                    ].map(stat => (
                        <div key={stat.label} className={`border rounded-xl p-3 sm:p-4 ${stat.color}`}>
                            <p className="text-gray-500 text-xs sm:text-sm">{stat.label}</p>
                            <p className={`text-2xl sm:text-3xl font-bold mt-1 ${stat.text}`}>{stat.value}</p>
                        </div>
                    ))}
                </div>

                {/* Search & Filter */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <input
                        type="text"
                        placeholder="Search by pass number, driver, department..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="flex-1 px-4 py-3 sm:py-2 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition text-sm sm:text-base"
                    />
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="px-4 py-3 sm:py-2 rounded-xl bg-white border border-gray-300 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition text-sm sm:text-base"
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
                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm text-center py-12 text-gray-400">
                        <p className="text-4xl mb-3">📭</p>
                        <p>No gate passes found</p>
                    </div>
                ) : (
                    <>
                        {/* Desktop Table */}
                        <div className="hidden md:block bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-200 bg-gray-50">
                                            <th className="text-left text-gray-500 text-sm font-medium px-6 py-4">Pass Number</th>
                                            <th className="text-left text-gray-500 text-sm font-medium px-6 py-4">Type</th>
                                            <th className="text-left text-gray-500 text-sm font-medium px-6 py-4">Department</th>
                                            <th className="text-left text-gray-500 text-sm font-medium px-6 py-4">Driver</th>
                                            <th className="text-left text-gray-500 text-sm font-medium px-6 py-4">Status</th>
                                            <th className="text-left text-gray-500 text-sm font-medium px-6 py-4">Date</th>
                                            <th className="text-left text-gray-500 text-sm font-medium px-6 py-4">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map(pass => {
                                            const overdue = isOverdue(pass)
                                            const effStatus = overdue ? 'overdue' : pass.status
                                            return (
                                                <tr key={pass.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                                                    <td className="px-6 py-4 text-gray-900 font-medium">{pass.pass_number}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`text-xs px-2 py-1 rounded-full border font-medium ${PASS_TYPE_COLORS[pass.type] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                                            {PASS_TYPE_LABELS[pass.type] || pass.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-600">{pass.department}</td>
                                                    <td className="px-6 py-4 text-gray-600">{pass.driver_name}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_COLORS[effStatus]}`}>
                                                            {STATUS_LABELS[effStatus] || effStatus}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-500 text-sm">
                                                        {formatDate(pass.created_at)}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <button
                                                            onClick={() => router.push(`/gate-pass/${pass.id}`)}
                                                            className="px-3 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-sm border border-blue-200 transition"
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

                        {/* Mobile Cards */}
                        <div className="md:hidden space-y-3">
                            {filtered.map(pass => {
                                const overdue = isOverdue(pass)
                                const effStatus = overdue ? 'overdue' : pass.status
                                return (
                                    <div
                                        key={pass.id}
                                        onClick={() => router.push(`/gate-pass/${pass.id}`)}
                                        className="bg-white border border-gray-200 rounded-xl p-4 active:bg-gray-50 transition cursor-pointer shadow-sm"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-gray-900 font-semibold text-base">{pass.pass_number}</span>
                                            <span className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_COLORS[effStatus]}`}>
                                                {STATUS_LABELS[effStatus] || effStatus}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`text-xs px-2 py-1 rounded-full border font-medium ${PASS_TYPE_COLORS[pass.type] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                                {PASS_TYPE_LABELS[pass.type] || pass.type}
                                            </span>
                                            <span className="text-gray-400 text-xs">
                                                {formatDate(pass.created_at)}
                                            </span>
                                        </div>
                                        <div className="text-gray-600 text-sm">
                                            <p>{pass.department} • {pass.driver_name}</p>
                                            <p className="text-gray-400">{pass.vehicle_number}</p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </>
                )}

            </div>
        </main>
    )
}
