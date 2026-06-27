'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const router = useRouter()

    const handleLogin = async () => {
        setError('')
        setLoading(true)

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (error) {
            setLoading(false)
            setError(error.message)
            return
        }

        // Safety net: at this point we have a real, authenticated session,
        // so auth.uid() will match — RLS will allow this write. If the
        // database trigger that's supposed to create the profile row on
        // signup never ran (or ran before it existed), this backfills it
        // instead of leaving the user stuck with no profile.
        if (data.user) {
            const { data: existing } = await supabase
                .from('profiles')
                .select('id')
                .eq('id', data.user.id)
                .maybeSingle()

            if (!existing) {
                await supabase.from('profiles').upsert({
                    id: data.user.id,
                    email: data.user.email,
                    full_name: data.user.user_metadata?.full_name || null,
                    role: 'user',
                }, { onConflict: 'id' })
            }
        }

        setLoading(false)
        router.push('/dashboard')
    }

    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">

                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-gray-900">
                            Welcome Back
                        </h1>
                        <p className="text-gray-500 mt-2">
                            Login to your Material Gate Pass account
                        </p>
                    </div>

                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm text-gray-700 mb-2">
                                Email Address
                            </label>
                            <input
                                type="email"
                                placeholder="Enter your email"
                                value={email}
                                maxLength={100}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-700 mb-2">
                                Password
                            </label>
                            <input
                                type="password"
                                placeholder="Enter your password"
                                value={password}
                                maxLength={64}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                            />
                        </div>

                        {error && (
                            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                {error}
                            </p>
                        )}

                        <button
                            onClick={handleLogin}
                            disabled={loading}
                            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold transition shadow-sm"
                        >
                            {loading ? 'Logging in...' : 'Login'}
                        </button>
                    </div>

                    <p className="text-center text-gray-500 mt-6">
                        Account nahi hai?{' '}
                        <Link href="/signup" className="text-blue-600 hover:text-blue-700 font-medium">
                            Signup karo
                        </Link>
                    </p>
                </div>
            </div>
        </main>
    )
}