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
}

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    approved: 'bg-green-500/20 text-green-400 border-green-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    verified: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
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
        const matchStatus = statusFilter === 'all' || p.status === statusFilter
        return matchSearch && matchStatus
    })

    const stats = {
        total: passes.length,
        pending: passes.filter(p => p.status === 'pending').length,
        approved: passes.filter(p => p.status === 'approved').length,
        rejected: passes.filter(p => p.status === 'rejected').length,
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    if (loading) return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
            <p className="text-white text-xl">Loading...</p>
        </div>
    )

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
            <div className="max-w-6xl mx-auto">

                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white">Dashboard</h1>
                        <p className="text-slate-400 mt-1 text-sm sm:text-base break-all">Welcome, {email}</p>
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button
                            onClick={() => router.push('/gate-pass/new')}
                            className="flex-1 sm:flex-none px-4 py-3 sm:py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition text-sm sm:text-base"
                        >
                            + New Gate Pass
                        </button>
                        <button
                            onClick={handleLogout}
                            className="flex-1 sm:flex-none px-4 py-3 sm:py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium transition text-sm sm:text-base"
                        >
                            Logout
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
                    {[
                        { label: 'Total', value: stats.total, color: 'border-slate-500/30 bg-slate-500/10', text: 'text-slate-300' },
                        { label: 'Pending', value: stats.pending, color: 'border-yellow-500/30 bg-yellow-500/10', text: 'text-yellow-400' },
                        { label: 'Approved', value: stats.approved, color: 'border-green-500/30 bg-green-500/10', text: 'text-green-400' },
                        { label: 'Rejected', value: stats.rejected, color: 'border-red-500/30 bg-red-500/10', text: 'text-red-400' },
                    ].map(stat => (
                        <div key={stat.label} className={`border rounded-xl p-3 sm:p-4 ${stat.color}`}>
                            <p className="text-slate-400 text-xs sm:text-sm">{stat.label}</p>
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
                        className="flex-1 px-4 py-3 sm:py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 outline-none focus:border-blue-500 transition text-sm sm:text-base"
                    />
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="px-4 py-3 sm:py-2 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none focus:border-blue-500 transition text-sm sm:text-base"
                    >
                        <option value="all">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="completed">Completed</option>
                    </select>
                </div>

                {filtered.length === 0 ? (
                    <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl text-center py-12 text-slate-500">
                        <p className="text-4xl mb-3">📭</p>
                        <p>No gate passes found</p>
                    </div>
                ) : (
                    <>
                        {/* Desktop Table */}
                        <div className="hidden md:block bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-white/10">
                                            <th className="text-left text-slate-400 text-sm font-medium px-6 py-4">Pass Number</th>
                                            <th className="text-left text-slate-400 text-sm font-medium px-6 py-4">Type</th>
                                            <th className="text-left text-slate-400 text-sm font-medium px-6 py-4">Department</th>
                                            <th className="text-left text-slate-400 text-sm font-medium px-6 py-4">Driver</th>
                                            <th className="text-left text-slate-400 text-sm font-medium px-6 py-4">Status</th>
                                            <th className="text-left text-slate-400 text-sm font-medium px-6 py-4">Date</th>
                                            <th className="text-left text-slate-400 text-sm font-medium px-6 py-4">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map(pass => (
                                            <tr key={pass.id} className="border-b border-white/5 hover:bg-white/5 transition">
                                                <td className="px-6 py-4 text-white font-medium">{pass.pass_number}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`text-xs px-2 py-1 rounded-full border capitalize ${pass.type === 'inward' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-purple-500/20 text-purple-400 border-purple-500/30'}`}>
                                                        {pass.type}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-slate-300">{pass.department}</td>
                                                <td className="px-6 py-4 text-slate-300">{pass.driver_name}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`text-xs px-2 py-1 rounded-full border capitalize ${STATUS_COLORS[pass.status]}`}>
                                                        {pass.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-slate-400 text-sm">
                                                    {new Date(pass.created_at).toLocaleDateString('en-IN')}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <button
                                                        onClick={() => router.push(`/gate-pass/${pass.id}`)}
                                                        className="px-3 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-sm border border-blue-500/30 transition"
                                                    >
                                                        View
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Mobile Cards */}
                        <div className="md:hidden space-y-3">
                            {filtered.map(pass => (
                                <div
                                    key={pass.id}
                                    onClick={() => router.push(`/gate-pass/${pass.id}`)}
                                    className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl p-4 active:bg-white/15 transition cursor-pointer"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-white font-semibold text-base">{pass.pass_number}</span>
                                        <span className={`text-xs px-2 py-1 rounded-full border capitalize ${STATUS_COLORS[pass.status]}`}>
                                            {pass.status}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`text-xs px-2 py-1 rounded-full border capitalize ${pass.type === 'inward' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-purple-500/20 text-purple-400 border-purple-500/30'}`}>
                                            {pass.type}
                                        </span>
                                        <span className="text-slate-400 text-xs">
                                            {new Date(pass.created_at).toLocaleDateString('en-IN')}
                                        </span>
                                    </div>
                                    <div className="text-slate-300 text-sm">
                                        <p>{pass.department} • {pass.driver_name}</p>
                                        <p className="text-slate-500">{pass.vehicle_number}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

            </div>
        </main>
    )
}