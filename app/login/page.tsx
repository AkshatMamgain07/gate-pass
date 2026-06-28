'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { PortalHeader } from '@/components/PortalHeader'

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
        <main className="min-h-screen bg-gp-paper flex flex-col">
            <PortalHeader />

            <div className="flex-1 flex items-center justify-center px-4 py-10">
                <div className="w-full max-w-md">
                    <div className="bg-card border border-gp-line rounded-md shadow-sm overflow-hidden">
                        <div className="h-1 bg-gp-navy" />
                        <div className="p-8">
                            <div className="mb-8">
                                <p className="text-[11px] uppercase tracking-[0.2em] text-gp-steel mb-1">
                                    Authorized Personnel Login
                                </p>
                                <h1 className="text-2xl font-heading font-semibold text-gp-ink">
                                    Sign in to your account
                                </h1>
                            </div>

                            <div className="space-y-5">
                                <div>
                                    <label className="block text-xs uppercase tracking-wide text-gp-steel mb-2">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        placeholder="you@bhel.in"
                                        value={email}
                                        maxLength={100}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full px-4 py-3 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-navy focus:ring-2 focus:ring-gp-navy/10 transition"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs uppercase tracking-wide text-gp-steel mb-2">
                                        Password
                                    </label>
                                    <input
                                        type="password"
                                        placeholder="Enter your password"
                                        value={password}
                                        maxLength={64}
                                        onChange={(e) => setPassword(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                                        className="w-full px-4 py-3 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-navy focus:ring-2 focus:ring-gp-navy/10 transition"
                                    />
                                </div>

                                {error && (
                                    <p className="text-sm text-gp-rust bg-gp-rust/5 border border-gp-rust/30 rounded-sm px-3 py-2">
                                        {error}
                                    </p>
                                )}

                                <button
                                    onClick={handleLogin}
                                    disabled={loading}
                                    className="w-full py-3 rounded-sm bg-gp-navy hover:bg-gp-navy-deep disabled:bg-gp-navy/40 text-gp-paper font-semibold transition tracking-wide"
                                >
                                    {loading ? 'Signing in…' : 'Sign In'}
                                </button>
                            </div>

                            <p className="text-center text-sm text-gp-steel mt-6">
                                Don't have an account?{' '}
                                <Link href="/signup" className="text-gp-navy hover:text-gp-amber font-medium underline-offset-2 hover:underline">
                                    Register here
                                </Link>
                            </p>
                        </div>
                    </div>

                    <p className="text-center text-[11px] text-gp-steel/70 mt-6 tracking-wide">
                        Material Gate Pass System — Internal Use Only
                    </p>
                </div>
            </div>
        </main>
    )
}