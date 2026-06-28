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

        // Pass role + company as signup metadata instead of updating
        // `profiles` separately afterwards. If email confirmation is on,
        // there's no session yet right after signUp() — any client write
        // to `profiles` at that point is anonymous and RLS silently blocks
        // it, leaving the account stuck as a default 'user'. The DB
        // trigger (which creates the profile row) runs with elevated
        // privileges and reads this metadata directly, so it sets the
        // correct role no matter what the session state is.
        const { data: authData, error: signupError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: contactPerson,
                    role: 'vendor',
                    company: name,
                },
            },
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

        // Best-effort sync only — the trigger is the source of truth for
        // role/department now. This just makes the profile reflect the
        // latest form values immediately when a session does exist.
        if (authData.session && authData.user) {
            await supabase
                .from('profiles')
                .upsert({
                    id: authData.user.id,
                    email,
                    role: 'vendor',
                    full_name: contactPerson,
                    department: name,
                }, { onConflict: 'id' })
        }

        await supabase.auth.signInWithPassword({ email, password })

        setLoading(false)
        setSuccess('Registration successful! Redirecting...')
        setTimeout(() => router.push('/vendor/dashboard'), 1500)
    }

    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">

                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-gray-900">Vendor Registration</h1>
                        <p className="text-gray-500 mt-2">Register your company for Gate Pass System</p>
                    </div>

                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm text-gray-700 mb-2">Company Name</label>
                            <input
                                type="text"
                                placeholder="e.g. ABC Suppliers"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-700 mb-2">Contact Person</label>
                            <input
                                type="text"
                                placeholder="Full name"
                                value={contactPerson}
                                onChange={e => setContactPerson(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-700 mb-2">Phone Number</label>
                            <input
                                type="text"
                                placeholder="10-digit mobile number"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-700 mb-2">Email Address</label>
                            <input
                                type="email"
                                placeholder="company@example.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-700 mb-2">Password</label>
                            <input
                                type="password"
                                placeholder="At least 6 characters"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 transition"
                            />
                        </div>

                        {error && (
                            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                                {success}
                            </div>
                        )}

                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold transition shadow-sm"
                        >
                            {loading ? 'Registering...' : 'Register'}
                        </button>
                    </div>

                    <p className="text-center text-gray-500 mt-6">
                        Already registered?{' '}
                        <a href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
                            Login
                        </a>
                    </p>

                </div>
            </div>
        </main>
    )
}