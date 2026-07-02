'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { PortalHeader } from '@/components/PortalHeader'

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

    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-gp-rust' }
    if (score <= 3) return { score: 2, label: 'Medium', color: 'bg-gp-amber' }
    return { score: 3, label: 'Strong', color: 'bg-gp-forest' }
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
                data: { full_name: fullName.trim(), role: 'user' },
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

        if (authData.session) {
            await supabase
                .from('profiles')
                .upsert({
                    id: authData.user.id,
                    email,
                    full_name: fullName.trim(),
                    role: 'user',
                }, { onConflict: 'id' })
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
        <main className="min-h-screen bg-gp-paper flex flex-col">
            <PortalHeader />

            <div className="flex-1 flex items-center justify-center px-4 py-10">
                <div className="w-full max-w-md">
                    <div className="bg-card border border-gp-line rounded-md shadow-sm overflow-hidden">
                        <div className="h-1 bg-gp-navy" />
                        <div className="p-8">
                            <div className="mb-8">
                                <p className="text-[11px] uppercase tracking-[0.2em] text-gp-steel mb-1">
                                    New Registration
                                </p>
                                <h1 className="text-2xl font-heading font-semibold text-gp-ink">
                                    Create your account
                                </h1>
                            </div>

                            <div className="space-y-5">
                                <div>
                                    <label className="block text-xs uppercase tracking-wide text-gp-steel mb-2">
                                        Full Name
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Akshat Mamgain"
                                        value={fullName}
                                        maxLength={NAME_MAX}
                                        onChange={(e) => setFullName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-navy focus:ring-2 focus:ring-gp-navy/10 transition"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs uppercase tracking-wide text-gp-steel mb-2">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        placeholder="you@gmail.com"
                                        value={email}
                                        maxLength={EMAIL_MAX}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full px-4 py-3 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-navy focus:ring-2 focus:ring-gp-navy/10 transition"
                                    />
                                    <p className="text-xs text-gp-steel/70 mt-1.5">
                                        Only Gmail or Outlook addresses are accepted
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs uppercase tracking-wide text-gp-steel mb-2">
                                        Password
                                    </label>
                                    <input
                                        type="password"
                                        placeholder="Enter your password"
                                        value={password}
                                        maxLength={PASSWORD_MAX}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full px-4 py-3 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-navy focus:ring-2 focus:ring-gp-navy/10 transition"
                                    />
                                    {password && (
                                        <div className="mt-2">
                                            <div className="flex gap-1.5">
                                                {[1, 2, 3].map(i => (
                                                    <div
                                                        key={i}
                                                        className={`h-1.5 flex-1 rounded-full transition ${i <= strength.score ? strength.color : 'bg-gp-line'
                                                            }`}
                                                    />
                                                ))}
                                            </div>
                                            <p className={`text-xs mt-1 ${strength.score === 1 ? 'text-gp-rust' :
                                                strength.score === 2 ? 'text-gp-amber' : 'text-gp-forest'
                                                }`}>
                                                {strength.label}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs uppercase tracking-wide text-gp-steel mb-2">
                                        Confirm Password
                                    </label>
                                    <input
                                        type="password"
                                        placeholder="Re-enter your password"
                                        value={confirmPassword}
                                        maxLength={PASSWORD_MAX}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
                                        className="w-full px-4 py-3 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-navy focus:ring-2 focus:ring-gp-navy/10 transition"
                                    />
                                </div>

                                {error && (
                                    <p className="text-sm text-gp-rust bg-gp-rust/5 border border-gp-rust/30 rounded-sm px-3 py-2">
                                        {error}
                                    </p>
                                )}

                                {success && (
                                    <p className="text-sm text-gp-forest bg-gp-forest/5 border border-gp-forest/30 rounded-sm px-3 py-2">
                                        {success}
                                    </p>
                                )}

                                <button
                                    onClick={handleSignup}
                                    disabled={loading}
                                    className="w-full py-3 rounded-sm bg-gp-navy hover:bg-gp-navy-deep disabled:bg-gp-navy/40 text-gp-paper font-semibold transition tracking-wide"
                                >
                                    {loading ? 'Creating account…' : 'Create Account'}
                                </button>
                            </div>

                            <p className="text-center text-sm text-gp-steel mt-6">
                                Already have an account?{' '}
                                <Link href="/login" className="text-gp-navy hover:text-gp-amber font-medium underline-offset-2 hover:underline">
                                    Sign in
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