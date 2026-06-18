'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Profile {
    id: string
    email: string
    full_name: string | null
    role: string
    department: string | null
}

interface Vendor {
    id: string
    name: string
    contact_person: string | null
    phone: string | null
    is_approved: boolean
}

const ROLES = ['user', 'approver', 'security', 'admin']

export default function AdminPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [isAdmin, setIsAdmin] = useState(false)
    const [tab, setTab] = useState<'users' | 'vendors'>('users')
    const [users, setUsers] = useState<Profile[]>([])
    const [vendors, setVendors] = useState<Vendor[]>([])
    const [editingUserId, setEditingUserId] = useState<string | null>(null)

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return router.push('/login')

            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', session.user.id)
                .single()

            if (profile?.role !== 'admin') {
                alert('Access denied. Admins only.')
                return router.push('/dashboard')
            }

            setIsAdmin(true)
            await fetchUsers()
            await fetchVendors()
            setLoading(false)
        }
        init()
    }, [])

    const fetchUsers = async () => {
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false })
        setUsers(data || [])
    }

    const fetchVendors = async () => {
        const { data } = await supabase
            .from('vendors')
            .select('*')
            .order('created_at', { ascending: false })
        setVendors(data || [])
    }

    const updateUserRole = async (userId: string, newRole: string) => {
        await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId)

        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
        setEditingUserId(null)
    }

    const approveVendor = async (vendorId: string) => {
        await supabase
            .from('vendors')
            .update({ is_approved: true })
            .eq('id', vendorId)

        setVendors(prev => prev.map(v => v.id === vendorId ? { ...v, is_approved: true } : v))
    }

    if (loading) return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
            <p className="text-white text-xl">Loading...</p>
        </div>
    )

    if (!isAdmin) return null

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
            <div className="max-w-5xl mx-auto">
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-6 sm:p-8">

                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
                            <p className="text-slate-400 mt-1">Manage users and vendors</p>
                        </div>
                        <button onClick={() => router.push('/dashboard')} className="text-slate-400 hover:text-white transition">
                            ← Back
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 mb-6">
                        <button
                            onClick={() => setTab('users')}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === 'users' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                        >
                            Users ({users.length})
                        </button>
                        <button
                            onClick={() => setTab('vendors')}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === 'vendors' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                        >
                            Vendors ({vendors.length})
                        </button>
                    </div>

                    {/* Users Tab */}
                    {tab === 'users' && (
                        <div className="space-y-3">
                            {users.map(user => (
                                <div key={user.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <p className="text-white font-medium">{user.full_name || user.email}</p>
                                        <p className="text-slate-400 text-sm">{user.email}</p>
                                        {user.department && <p className="text-slate-500 text-xs">{user.department}</p>}
                                    </div>
                                    <div>
                                        {editingUserId === user.id ? (
                                            <select
                                                value={user.role}
                                                onChange={e => updateUserRole(user.id, e.target.value)}
                                                onBlur={() => setEditingUserId(null)}
                                                autoFocus
                                                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm outline-none focus:border-blue-500"
                                            >
                                                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        ) : (
                                            <button
                                                onClick={() => setEditingUserId(user.id)}
                                                className="px-3 py-1 rounded-full border bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs capitalize hover:bg-blue-500/30 transition"
                                            >
                                                {user.role} ✏️
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Vendors Tab */}
                    {tab === 'vendors' && (
                        <div className="space-y-3">
                            {vendors.map(vendor => (
                                <div key={vendor.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <p className="text-white font-medium">{vendor.name}</p>
                                        <p className="text-slate-400 text-sm">{vendor.contact_person} • {vendor.phone}</p>
                                    </div>
                                    <div>
                                        {vendor.is_approved ? (
                                            <span className="px-3 py-1 rounded-full border bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                                                Approved
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => approveVendor(vendor.id)}
                                                className="px-3 py-1 rounded-full border bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs hover:bg-yellow-500/30 transition"
                                            >
                                                Approve
                                            </button>
                                        )}
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