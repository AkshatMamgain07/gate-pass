'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/gatepass'

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
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <p className="text-gray-500 text-lg">Loading...</p>
        </div>
    )

    return (
        <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8">

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Vendor Dashboard</h1>
                            <p className="text-gray-500 mt-1">{companyName}</p>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition"
                        >
                            Logout
                        </button>
                    </div>

                    <h2 className="text-gray-900 font-semibold mb-4">Your Gate Passes ({passes.length})</h2>

                    {passes.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <p className="text-4xl mb-3">📭</p>
                            <p>No gate passes found for your company yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {passes.map(pass => (
                                <div key={pass.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-gray-900 font-semibold">{pass.pass_number}</span>
                                        <span className={`text-xs px-2 py-1 rounded-full border capitalize ${STATUS_COLORS[pass.status] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                            {STATUS_LABELS[pass.status] || pass.status}
                                        </span>
                                    </div>
                                    <div className="text-gray-500 text-sm">
                                        {pass.department} • {pass.driver_name} • {pass.vehicle_number}
                                    </div>
                                    <div className="text-gray-400 text-xs mt-1">
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