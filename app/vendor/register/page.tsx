'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function VendorRegisterPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    const [name, setName] = useState('')
    const [contactPerson, setContactPerson] = useState('')
    const [phone, setPhone] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')

    const handleSubmit = async () => {
        setError('')
        setSuccess('')

        if (!name || name.length < 2) return setError('Company name required')
        if (!contactPerson || contactPerson.length < 2) return setError('Contact person required')
        if (!/^\d{10}$/.test(phone)) return setError('Valid 10-digit phone required')
        if (!email || !email.includes('@')) return setError('Valid email required')
        if (!password || password.length < 6) return setError('Password must be at least 6 characters')

        setLoading(true)

        const { data: authData, error: signupError } = await supabase.auth.signUp({
            email,
            password,
        })

        if (signupError) {
            setLoading(false)
            return setError(signupError.message)
        }

        const { error: vendorError } = await supabase
            .from('vendors')
            .insert({
                name,
                contact_person: contactPerson,
                phone,
                email,
                is_approved: false,
            })

        if (vendorError) {
            setLoading(false)
            return setError(vendorError.message)
        }

        if (authData.user) {
            await supabase
                .from('profiles')
                .update({ role: 'vendor', full_name: contactPerson, department: name })
                .eq('id', authData.user.id)
        }

        await supabase.auth.signInWithPassword({ email, password })

        setLoading(false)
        setSuccess('Registration successful! Redirecting...')
        setTimeout(() => router.push('/vendor/dashboard'), 1500)
    }

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-8">

                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-white">Vendor Registration</h1>
                        <p className="text-slate-400 mt-2">Register your company for Gate Pass System</p>
                    </div>

                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm text-slate-300 mb-2">Company Name</label>
                            <input
                                type="text"
                                placeholder="e.g. ABC Suppliers"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-slate-700 text-white placeholder:text-slate-500 outline-none focus:border-blue-500 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-slate-300 mb-2">Contact Person</label>
                            <input
                                type="text"
                                placeholder="Full name"
                                value={contactPerson}
                                onChange={e => setContactPerson(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-slate-700 text-white placeholder:text-slate-500 outline-none focus:border-blue-500 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-slate-300 mb-2">Phone Number</label>
                            <input
                                type="text"
                                placeholder="10-digit mobile number"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-slate-700 text-white placeholder:text-slate-500 outline-none focus:border-blue-500 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-slate-300 mb-2">Email Address</label>
                            <input
                                type="email"
                                placeholder="company@example.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-slate-700 text-white placeholder:text-slate-500 outline-none focus:border-blue-500 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-slate-300 mb-2">Password</label>
                            <input
                                type="password"
                                placeholder="At least 6 characters"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-slate-700 text-white placeholder:text-slate-500 outline-none focus:border-blue-500 transition"
                            />
                        </div>

                        {error && (
                            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="text-sm text-green-400 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3">
                                {success}
                            </div>
                        )}

                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 text-white font-semibold transition shadow-lg shadow-blue-600/30"
                        >
                            {loading ? 'Registering...' : 'Register'}
                        </button>
                    </div>

                    <p className="text-center text-slate-400 mt-6">
                        Already registered?{' '}
                        <a href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
                            Login
                        </a>
                    </p>

                </div>
            </div>
        </main>
    )
}