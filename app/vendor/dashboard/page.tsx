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
    completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

export default function VendorDashboardPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [companyName, setCompanyName] = useState('')
    const [passes, setPasses] = useState<GatePass[]>([])

    useEffect(() => {
        const fetchData = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return router.push('/login')

            const { data: profile } = await supabase
                .from('profiles')
                .select('role, department, email')
                .eq('id', session.user.id)
                .single()

            if (profile?.role !== 'vendor') {
                return router.push('/dashboard')
            }

            setCompanyName(profile.department || 'Vendor')

            const { data: vendor } = await supabase
                .from('vendors')
                .select('id')
                .eq('email', profile.email)
                .single()

            if (vendor) {
                const { data: passesData } = await supabase
                    .from('gate_passes')
                    .select('*')
                    .eq('vendor_id', vendor.id)
                    .order('created_at', { ascending: false })

                setPasses(passesData || [])
            }

            setLoading(false)
        }
        fetchData()
    }, [])

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
            <div className="max-w-4xl mx-auto">
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-6 sm:p-8">

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-white">Vendor Dashboard</h1>
                            <p className="text-slate-400 mt-1">{companyName}</p>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition"
                        >
                            Logout
                        </button>
                    </div>

                    <h2 className="text-white font-semibold mb-4">Your Gate Passes ({passes.length})</h2>

                    {passes.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <p className="text-4xl mb-3">📭</p>
                            <p>No gate passes found for your company yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {passes.map(pass => (
                                <div key={pass.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-white font-semibold">{pass.pass_number}</span>
                                        <span className={`text-xs px-2 py-1 rounded-full border capitalize ${STATUS_COLORS[pass.status] || 'bg-slate-500/20 text-slate-400'}`}>
                                            {pass.status}
                                        </span>
                                    </div>
                                    <div className="text-slate-400 text-sm">
                                        {pass.department} • {pass.driver_name} • {pass.vehicle_number}
                                    </div>
                                    <div className="text-slate-500 text-xs mt-1">
                                        {new Date(pass.created_at).toLocaleDateString('en-IN')}
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