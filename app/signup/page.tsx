'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function SignupPage() {
    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [department, setDepartment] = useState('')
    const [phone, setPhone] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [loading, setLoading] = useState(false)

    const router = useRouter()

    const handleSignup = async () => {
        setError('')
        setSuccess('')

        if (password !== confirmPassword) {
            setError("Passwords don't match")
            return
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters')
            return
        }

        setLoading(true)

        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
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

        const { error: profileError } = await supabase.from('profiles').insert({
            id: authData.user.id,
            email,
            full_name: fullName,
            department,
            phone,
            role: 'user',
        })

        setLoading(false)

        if (profileError) {
            setError(profileError.message)
            return
        }

        setSuccess('Account created! Check your email to verify, then log in.')
        setTimeout(() => router.push('/login'), 1500)
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
                                placeholder="you@bhelhwr.co.in"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-700 mb-2">
                                Department
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Stores, Maintenance"
                                value={department}
                                onChange={(e) => setDepartment(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-700 mb-2">
                                Phone Number
                            </label>
                            <input
                                type="tel"
                                placeholder="9876543210"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
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
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-700 mb-2">
                                Confirm Password
                            </label>
                            <input
                                type="password"
                                placeholder="Re-enter your password"
                                value={confirmPassword}
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