'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { requireRole, type AuthedProfile } from '@/lib/auth'
import { assignApprover, APPROVER_MATRIX } from '@/lib/approvers'
import { sendNotification } from '@/lib/notifications'
import { UNITS, PassType, generatePassNumber, buildMaterialsWithIds } from '@/lib/gatepass'

interface MaterialInput {
    name: string
    quantity: number
    unit: string
    value: number
}

interface Vendor {
    id: string
    name: string
}

export default function NewGatePassPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [vendors, setVendors] = useState<Vendor[]>([])
    const [profile, setProfile] = useState<AuthedProfile | null>(null)
    const [checkingAccess, setCheckingAccess] = useState(true)

    const [passType, setPassType] = useState<PassType>('non_returnable')
    const [vendorId, setVendorId] = useState('')
    const [department, setDepartment] = useState('')
    const [fromLocation, setFromLocation] = useState('')
    const [toLocation, setToLocation] = useState('')
    const [vehicleNumber, setVehicleNumber] = useState('')
    const [driverName, setDriverName] = useState('')
    const [driverPhone, setDriverPhone] = useState('')
    const [invoiceNumber, setInvoiceNumber] = useState('')
    const [invoiceDate, setInvoiceDate] = useState('')
    const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
    const [materials, setMaterials] = useState<MaterialInput[]>([
        { name: '', quantity: 0, unit: 'kg', value: 0 }
    ])

    const departmentOptions = Object.keys(APPROVER_MATRIX)

    useEffect(() => {
        const init = async () => {
            // Vendors and security staff don't raise gate passes — only
            // internal staff (user/admin) should reach this form.
            const p = await requireRole(['user', 'admin'], router)
            if (!p) return
            setProfile(p)

            // Auto-fill department from the user's profile if it matches
            // one of the valid departments, saving them a step.
            if (p.department && departmentOptions.includes(p.department)) {
                setDepartment(p.department)
            }

            const { data } = await supabase
                .from('vendors')
                .select('id, name')
                .eq('is_approved', true)
            setVendors(data || [])

            setCheckingAccess(false)
        }
        init()
    }, [])

    const addMaterial = () => {
        setMaterials([...materials, { name: '', quantity: 0, unit: 'kg', value: 0 }])
    }

    const removeMaterial = (index: number) => {
        setMaterials(materials.filter((_, i) => i !== index))
    }

    const updateMaterial = (index: number, field: keyof MaterialInput, value: string | number) => {
        const updated = [...materials]
        updated[index] = { ...updated[index], [field]: value }
        setMaterials(updated)
    }

    const handleSubmit = async () => {
        // Guard against a fast double-click/double-tap firing this twice
        // before React re-renders the disabled button — without this, two
        // near-simultaneous submissions can both read the same "last pass
        // number" and collide on insert.
        if (loading) return

        setError('')
        setLoading(true)

        if (!department || department.length < 2) return setError('Department required'), setLoading(false)
        if (!fromLocation || fromLocation.length < 2) return setError('From location required'), setLoading(false)
        if (!toLocation || toLocation.length < 2) return setError('To location required'), setLoading(false)
        if (!vehicleNumber || vehicleNumber.length < 4) return setError('Valid vehicle number required'), setLoading(false)
        if (!driverName || driverName.length < 2) return setError('Driver name required'), setLoading(false)
        if (!/^\d{10}$/.test(driverPhone)) return setError('Valid 10-digit phone required'), setLoading(false)
        if (materials.some(m => !m.name || m.quantity <= 0)) return setError('Fill all material details'), setLoading(false)

        try {
            if (!profile) return setError('Session expired, please log in again.'), setLoading(false)

            let invoiceUrl = ''
            if (invoiceFile) {
                const fileName = `${Date.now()}_${invoiceFile.name}`
                const { error: uploadError } = await supabase.storage
                    .from('invoices')
                    .upload(fileName, invoiceFile)
                if (uploadError) throw uploadError

                const { data: { publicUrl } } = supabase.storage
                    .from('invoices')
                    .getPublicUrl(fileName)
                invoiceUrl = publicUrl
            }

            const approverId = await assignApprover(department)

            // Retry a few times if two people (or two near-simultaneous
            // clicks) happen to land on the same generated pass number —
            // the DB's unique constraint on pass_number is the real source
            // of truth here; this loop just re-asks for a fresh number and
            // tries again rather than surfacing a confusing DB error.
            let gatePass: any = null
            let insertError: any = null
            for (let attempt = 0; attempt < 3; attempt++) {
                const passNumber = await generatePassNumber()
                const materialsWithIds = buildMaterialsWithIds(materials, passNumber)

                const result = await supabase
                    .from('gate_passes')
                    .insert({
                        pass_number: passNumber,
                        type: passType,
                        status: 'pending',
                        created_by: profile.id,
                        department,
                        from_location: fromLocation,
                        to_location: toLocation,
                        vendor_id: vendorId || null,
                        vehicle_number: vehicleNumber,
                        driver_name: driverName,
                        driver_phone: driverPhone,
                        materials: materialsWithIds,
                        invoice_number: invoiceNumber || null,
                        invoice_date: invoiceDate || null,
                        invoice_url: invoiceUrl || null,
                        approver_id: approverId,
                    })
                    .select()
                    .single()

                if (!result.error) {
                    gatePass = result.data
                    insertError = null
                    break
                }

                insertError = result.error
                // Postgres unique_violation — retry with a fresh number.
                // Any other error (validation, RLS, network) should not be
                // retried, since retrying won't fix it.
                if (result.error.code !== '23505') break
            }

            if (insertError) throw insertError

            await supabase.from('activity_logs').insert({
                gate_pass_id: gatePass.id,
                user_id: profile.id,
                action: 'created',
            })

            await sendNotification('created', gatePass.id)

            setSuccess(`Gate Pass ${gatePass.pass_number} created successfully!`)
            setTimeout(() => router.push('/dashboard'), 2000)

        } catch (err: any) {
            setError(err.message || 'Something went wrong')
        } finally {
            setLoading(false)
        }
    }

    if (checkingAccess) {
        return (
            <main className="min-h-screen bg-gray-50 flex items-center justify-center">
                <p className="text-gray-400 text-sm">Loading...</p>
            </main>
        )
    }

    return (
        <main className="min-h-screen bg-gray-50 pb-28 sm:pb-10">
            {/* Sticky top bar — full-bleed, app-like on mobile, stays put on desktop too */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">New Gate Pass</h1>
                        {profile && (
                            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                                Creating as {profile.full_name || profile.email}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="text-gray-500 hover:text-gray-900 transition text-sm font-medium shrink-0"
                    >
                        ← Back
                    </button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
                <div className="bg-white border border-gray-200 sm:rounded-2xl shadow-sm p-4 sm:p-8 -mx-4 sm:mx-0">

                    <div className="space-y-6">

                        {/* Returnable / Non-returnable */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-3">
                                Is the material coming back?
                            </label>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setPassType('returnable')}
                                    className={`flex-1 py-3 rounded-xl font-medium transition border ${passType === 'returnable'
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    Returnable <span className="block text-xs opacity-80 font-normal">comes back, expires after a set time</span>
                                </button>
                                <button
                                    onClick={() => setPassType('non_returnable')}
                                    className={`flex-1 py-3 rounded-xl font-medium transition border ${passType === 'non_returnable'
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    Non-Returnable <span className="block text-xs opacity-80 font-normal">goes out for good</span>
                                </button>
                            </div>
                            {passType === 'returnable' && (
                                <p className="text-xs text-blue-600 mt-2">
                                    The approver will set the validity period (expiry date) when approving this pass.
                                </p>
                            )}
                        </div>

                        {/* From / To location */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">From (location)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Stores, Shop No. 2"
                                    value={fromLocation}
                                    onChange={e => setFromLocation(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">To (location)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Vendor workshop, Site X"
                                    value={toLocation}
                                    onChange={e => setToLocation(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Vendor (optional)</label>
                            <select
                                value={vendorId}
                                onChange={e => setVendorId(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                            >
                                <option value="">Select vendor (optional)</option>
                                {vendors.map(v => (
                                    <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                            <select
                                value={department}
                                onChange={e => setDepartment(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                            >
                                <option value="">Select department</option>
                                {departmentOptions.map(dep => (
                                    <option key={dep} value={dep}>{dep}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-400 mt-1.5">
                                Determines who approves this pass — pulled from your profile if set
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle Number</label>
                                <input
                                    type="text"
                                    placeholder="e.g. UP32AB1234"
                                    value={vehicleNumber}
                                    maxLength={15}
                                    onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
                                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Driver Name</label>
                                <input
                                    type="text"
                                    placeholder="Driver full name"
                                    value={driverName}
                                    onChange={e => setDriverName(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Driver Phone</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                placeholder="10-digit mobile number"
                                value={driverPhone}
                                maxLength={10}
                                onChange={e => setDriverPhone(e.target.value.replace(/\D/g, ''))}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                            />
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-sm font-medium text-gray-700">Materials</label>
                                <button
                                    onClick={addMaterial}
                                    className="text-sm text-blue-600 hover:text-blue-700 font-medium transition"
                                >
                                    + Add Material
                                </button>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">
                                A unique Material ID and the issue date will be generated automatically for each item when you submit.
                            </p>
                            <div className="space-y-3">
                                {materials.map((material, index) => (
                                    <div key={index} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div className="col-span-2 md:col-span-1">
                                                <input
                                                    type="text"
                                                    placeholder="Material name"
                                                    value={material.name}
                                                    onChange={e => updateMaterial(index, 'name', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 text-sm transition"
                                                />
                                            </div>
                                            <div>
                                                <input
                                                    type="number"
                                                    placeholder="Qty"
                                                    value={material.quantity || ''}
                                                    onChange={e => updateMaterial(index, 'quantity', parseFloat(e.target.value))}
                                                    className="w-full px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 text-sm transition"
                                                />
                                            </div>
                                            <div>
                                                <select
                                                    value={material.unit}
                                                    onChange={e => updateMaterial(index, 'unit', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-900 outline-none focus:border-blue-500 text-sm transition"
                                                >
                                                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                                </select>
                                            </div>
                                            <div className="flex gap-2">
                                                <input
                                                    type="number"
                                                    placeholder="Value ₹"
                                                    value={material.value || ''}
                                                    onChange={e => updateMaterial(index, 'value', parseFloat(e.target.value))}
                                                    className="w-full px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 text-sm transition"
                                                />
                                                {materials.length > 1 && (
                                                    <button
                                                        onClick={() => removeMaterial(index)}
                                                        className="text-red-500 hover:text-red-600 px-2 transition"
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Invoice Number (optional)</label>
                                <input
                                    type="text"
                                    placeholder="INV-001"
                                    value={invoiceNumber}
                                    onChange={e => setInvoiceNumber(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Invoice Date (optional)</label>
                                <input
                                    type="date"
                                    value={invoiceDate}
                                    onChange={e => setInvoiceDate(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Invoice File (optional)</label>
                            <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={e => setInvoiceFile(e.target.files?.[0] || null)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-500 outline-none focus:border-blue-500 transition file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-sm"
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

                        {/* Desktop: normal inline button. Hidden on mobile in favor of the sticky bar below. */}
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="hidden sm:block w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold transition shadow-sm"
                        >
                            {loading ? 'Creating...' : 'Create Gate Pass'}
                        </button>

                    </div>
                </div>
            </div>

            {/* Mobile: fixed bottom action bar, like a native app's primary CTA */}
            <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-10">
                <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="w-full py-3.5 rounded-xl bg-blue-600 active:bg-blue-700 disabled:bg-blue-300 text-white font-semibold transition shadow-sm"
                >
                    {loading ? 'Creating...' : 'Create Gate Pass'}
                </button>
            </div>
        </main>
    )
}