'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'outlook.com']
const NAME_MAX = 60
const EMAIL_MAX = 100
const PASSWORD_MAX = 64

function getPasswordStrength(password: string) {
    if (!password) return { score: 0, label: '', color: '' }

    let score = 0
    if (password.length >= 8) score++
    if (password.length >= 12) score++
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
    if (/\d/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++

    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-red-500' }
    if (score <= 3) return { score: 2, label: 'Medium', color: 'bg-amber-500' }
    return { score: 3, label: 'Strong', color: 'bg-emerald-500' }
}

function isAllowedEmail(email: string) {
    const domain = email.split('@')[1]?.toLowerCase()
    return !!domain && ALLOWED_EMAIL_DOMAINS.includes(domain)
}

export default function SignupPage() {
    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [loading, setLoading] = useState(false)

    const router = useRouter()
    const strength = useMemo(() => getPasswordStrength(password), [password])

    const handleSignup = async () => {
        setError('')
        setSuccess('')

        if (!fullName.trim() || fullName.trim().length < 2) {
            return setError('Please enter your full name')
        }

        if (!isAllowedEmail(email)) {
            return setError('Please use a Gmail or Outlook email address')
        }

        if (password.length < 8) {
            return setError('Password must be at least 8 characters')
        }

        if (strength.score < 2) {
            return setError('Please choose a stronger password (mix letters, numbers, symbols)')
        }

        if (password !== confirmPassword) {
            return setError("Passwords don't match")
        }

        setLoading(true)

        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: fullName.trim() },
            },
        })

        if (authError) {
            setError(authError.message)
            setLoading(false)
            return
        }

        if (!authData.user) {
            setError('Signup failed, please try again.')
            setLoading(false)
            return
        }

        // IMPORTANT: if email confirmation is enabled in Supabase Auth
        // settings (the default), signUp() does NOT return an active
        // session — the user isn't actually authenticated yet. Any write
        // to `profiles` at this point runs as an anonymous request, so it
        // will always fail your RLS policy ("new row violates row-level
        // security policy"), no matter what we insert.
        //
        // The profile row itself should be created by a Postgres trigger
        // on auth.users (see supabase_migration_v3_auth_trigger.sql) —
        // that trigger runs with elevated privileges and bypasses RLS
        // entirely, so it works regardless of session state.
        //
        // We only attempt a client-side write here as a *bonus* sync when
        // we do have a session (i.e. email confirmation is OFF), so the
        // profile reflects the name immediately without waiting on the
        // trigger.
        if (authData.session) {
            await supabase
                .from('profiles')
                .upsert({
                    id: authData.user.id,
                    email,
                    full_name: fullName.trim(),
                    role: 'user',
                }, { onConflict: 'id' })
            // Not blocking on error here — the trigger is the source of
            // truth for profile creation; this is just a same-second sync.
        }

        setLoading(false)
        setSuccess(
            authData.session
                ? 'Account created!'
                : 'Account created! Check your email to verify, then log in.'
        )
        setTimeout(() => router.push(authData.session ? '/dashboard' : '/login'), 1500)
    }

    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">

                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-gray-900">
                            Create an Account
                        </h1>
                        <p className="text-gray-500 mt-2">
                            Sign up to create and track material gate passes
                        </p>
                    </div>

                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm text-gray-700 mb-2">
                                Full Name
                            </label>
                            <input
                                type="text"
                                placeholder="Akshat Mamgain"
                                value={fullName}
                                maxLength={NAME_MAX}
                                onChange={(e) => setFullName(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-700 mb-2">
                                Email Address
                            </label>
                            <input
                                type="email"
                                placeholder="you@gmail.com"
                                value={email}
                                maxLength={EMAIL_MAX}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                            />
                            <p className="text-xs text-gray-400 mt-1.5">
                                Only Gmail or Outlook addresses are accepted
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm text-gray-700 mb-2">
                                Password
                            </label>
                            <input
                                type="password"
                                placeholder="Enter your password"
                                value={password}
                                maxLength={PASSWORD_MAX}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                            />
                            {password && (
                                <div className="mt-2">
                                    <div className="flex gap-1.5">
                                        {[1, 2, 3].map(i => (
                                            <div
                                                key={i}
                                                className={`h-1.5 flex-1 rounded-full transition ${i <= strength.score ? strength.color : 'bg-gray-200'
                                                    }`}
                                            />
                                        ))}
                                    </div>
                                    <p className={`text-xs mt-1 ${strength.score === 1 ? 'text-red-600' :
                                        strength.score === 2 ? 'text-amber-600' : 'text-emerald-600'
                                        }`}>
                                        {strength.label}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm text-gray-700 mb-2">
                                Confirm Password
                            </label>
                            <input
                                type="password"
                                placeholder="Re-enter your password"
                                value={confirmPassword}
                                maxLength={PASSWORD_MAX}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                            />
                        </div>

                        {error && (
                            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                {error}
                            </p>
                        )}

                        {success && (
                            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                                {success}
                            </p>
                        )}

                        <button
                            onClick={handleSignup}
                            disabled={loading}
                            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold transition shadow-sm"
                        >
                            {loading ? 'Creating account...' : 'Sign Up'}
                        </button>
                    </div>

                    <p className="text-center text-gray-500 mt-6">
                        Already have an account?{' '}
                        <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
                            Login karo
                        </Link>
                    </p>
                </div>
            </div>
        </main>
    )
}