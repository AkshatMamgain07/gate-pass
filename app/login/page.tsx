'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { PortalHeader } from '@/components/PortalHeader'

type LoginTab = 'user' | 'admin' | 'security'

const TAB_ORDER: LoginTab[] = ['user', 'admin', 'security']

const TAB_LABELS: Record<LoginTab, string> = {
    user: 'User',
    admin: 'Admin',
    security: 'Security',
}

// Which actual profile.role values are allowed to sign in through each tab.
// Keeping this as an explicit allow-list (rather than "everything except
// admin/security") means a stray 'approver' or 'vendor' row in profiles
// can never slip through a tab it doesn't belong to.
const TAB_ALLOWED_ROLES: Record<LoginTab, string[]> = {
    user: ['user'],
    admin: ['admin'],
    security: ['security'],
}

// Where each role lands after a successful, tab-matched login.
const ROLE_HOME: Record<string, string> = {
    user: '/dashboard',
    admin: '/dashboard',
    security: '/security',
}

const ROLE_LABELS: Record<string, string> = {
    user: 'User',
    admin: 'Admin',
    security: 'Security',
    approver: 'Approver',
    vendor: 'Vendor',
}

export default function LoginPage() {
    const [tab, setTab] = useState<LoginTab>('user')
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

        if (!data.user) {
            setLoading(false)
            setError('Sign in failed, please try again.')
            return
        }

        let profile: { id: string; role: string } | null = null

        const { data: existing } = await supabase
            .from('profiles')
            .select('id, role')
            .eq('id', data.user.id)
            .maybeSingle()

        if (existing) {
            profile = existing
        } else {
            // First login right after signup, before the DB trigger has
            // created the profile row yet (or email confirmation was off).
            const { data: created } = await supabase
                .from('profiles')
                .upsert({
                    id: data.user.id,
                    email: data.user.email,
                    full_name: data.user.user_metadata?.full_name || null,
                    role: 'user',
                }, { onConflict: 'id' })
                .select('id, role')
                .single()
            profile = created
        }

        const role = profile?.role || 'user'

        // The tab the person picked has to match their actual DB role.
        // This is what stops an Admin/Security account from ending up on
        // the restricted User home screen, or a plain User from getting
        // anywhere near the Security or Admin views.
        if (!TAB_ALLOWED_ROLES[tab].includes(role)) {
            await supabase.auth.signOut()
            setLoading(false)
            setError(
                `This account is registered as "${ROLE_LABELS[role] || role}", not ${TAB_LABELS[tab]}. ` +
                `Please sign in from the correct tab.`
            )
            return
        }

        setLoading(false)
        router.push(ROLE_HOME[role] || '/dashboard')
    }

    return (
        <main className="min-h-screen bg-gp-paper flex flex-col">
            <PortalHeader />

            <div className="flex-1 flex items-center justify-center px-4 py-10">
                <div className="w-full max-w-md">
                    <div className="bg-card border border-gp-line rounded-md shadow-sm overflow-hidden">
                        <div className="h-1 bg-gp-navy" />
                        <div className="p-8">
                            <div className="mb-6">
                                <p className="text-[11px] uppercase tracking-[0.2em] text-gp-steel mb-1">
                                    Authorized Personnel Login
                                </p>
                                <h1 className="text-2xl font-heading font-semibold text-gp-ink">
                                    Sign in to your account
                                </h1>
                            </div>

                            <div
                                className="grid grid-cols-3 gap-2 mb-6"
                                role="tablist"
                                aria-label="Sign in as"
                            >
                                {TAB_ORDER.map(t => (
                                    <button
                                        key={t}
                                        type="button"
                                        role="tab"
                                        aria-selected={tab === t}
                                        onClick={() => { setTab(t); setError('') }}
                                        className={`py-2.5 rounded-sm text-xs font-semibold uppercase tracking-wide border transition ${tab === t
                                            ? 'bg-gp-navy text-gp-paper border-gp-navy'
                                            : 'bg-white text-gp-steel border-gp-line hover:border-gp-navy/40 hover:text-gp-navy'
                                            }`}
                                    >
                                        {TAB_LABELS[t]}
                                    </button>
                                ))}
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
                                    {loading ? 'Signing in…' : `Sign In as ${TAB_LABELS[tab]}`}
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
                    <p className="text-center text-[11px] text-gp-steel/70 mt-2 tracking-wide">
                        Security Staff?{' '}
                        <Link href="/security/register" className="text-gp-navy hover:text-gp-amber underline underline-offset-2">
                            Register here
                        </Link>
                    </p>
                </div>
            </div>
        </main>
    )
}