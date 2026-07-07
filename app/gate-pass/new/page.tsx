'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { requireRole, type AuthedProfile } from '@/lib/auth'
import { assignApprover, APPROVER_MATRIX } from '@/lib/approvers'
import { sendNotification } from '@/lib/notifications'
import { UNITS, PassType, generatePassNumber, buildMaterialsWithIds } from '@/lib/gatepass'
import { PortalHeader } from '@/components/PortalHeader'

const ROLE_LABELS: Record<string, string> = {
    user: 'Department User',
    security: 'Security Gate',
    admin: 'Administrator',
}

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

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    if (checkingAccess) {
        return (
            <main className="min-h-screen bg-gp-paper flex items-center justify-center">
                <p className="text-gp-steel text-sm">Loading...</p>
            </main>
        )
    }

    const inputClass = "w-full px-4 py-3 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-navy focus:ring-2 focus:ring-gp-navy/10 transition"
    const labelClass = "block text-xs uppercase tracking-wide text-gp-steel mb-2"

    return (
        <main className="min-h-screen bg-gp-paper flex flex-col">
            <PortalHeader
                userName={profile?.full_name || profile?.email}
                roleLabel={profile ? (ROLE_LABELS[profile.role] || profile.role) : undefined}
                onLogout={handleLogout}
            />

            {/* Split-screen: left = identity/pass-type/summary/submit (always visible,
                no scrolling needed to submit), right = the scrollable field set. */}
            <div className="flex-1 lg:grid lg:grid-cols-[380px_1fr] lg:h-[calc(100dvh-67px)]">

                {/* LEFT PANEL */}
                <div className="lg:h-full lg:overflow-y-auto bg-white border-b lg:border-b-0 lg:border-r border-gp-line">
                    <div className="p-6 lg:p-8 flex flex-col lg:min-h-full">
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="text-gp-steel hover:text-gp-navy transition text-sm font-medium mb-6 self-start"
                        >
                            ← Back to Dashboard
                        </button>

                        <p className="text-[11px] uppercase tracking-[0.2em] text-gp-steel mb-1">
                            New Submission
                        </p>
                        <h1 className="text-2xl font-heading font-semibold text-gp-ink mb-1">
                            New Gate Pass
                        </h1>
                        {profile && (
                            <p className="text-sm text-gp-steel mb-8">
                                Creating as {profile.full_name || profile.email}
                            </p>
                        )}

                        {/* Returnable / Non-returnable */}
                        <div className="mb-8">
                            <label className="block text-sm font-medium text-gp-ink mb-3">
                                Is the material coming back?
                            </label>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => setPassType('returnable')}
                                    className={`text-left px-4 py-3 rounded-sm font-medium transition border ${passType === 'returnable'
                                        ? 'bg-gp-navy text-gp-paper border-gp-navy'
                                        : 'bg-white text-gp-ink border-gp-line hover:border-gp-navy/40'
                                        }`}
                                >
                                    Returnable
                                    <span className="block text-xs opacity-80 font-normal mt-0.5">comes back, expires after a set time</span>
                                </button>
                                <button
                                    onClick={() => setPassType('non_returnable')}
                                    className={`text-left px-4 py-3 rounded-sm font-medium transition border ${passType === 'non_returnable'
                                        ? 'bg-gp-navy text-gp-paper border-gp-navy'
                                        : 'bg-white text-gp-ink border-gp-line hover:border-gp-navy/40'
                                        }`}
                                >
                                    Non-Returnable
                                    <span className="block text-xs opacity-80 font-normal mt-0.5">goes out for good</span>
                                </button>
                            </div>
                            {passType === 'returnable' && (
                                <p className="text-xs text-gp-amber mt-3">
                                    The approver will set the validity period (expiry date) when approving this pass.
                                </p>
                            )}
                        </div>

                        {/* Quick summary — reflects the right-hand form as it's filled in */}
                        <div className="mb-8 rounded-sm border border-gp-line bg-gp-paper/60 p-4 space-y-2">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-gp-steel mb-1">At a Glance</p>
                            <div className="flex justify-between text-sm">
                                <span className="text-gp-steel">Route</span>
                                <span className="text-gp-ink font-medium text-right">
                                    {fromLocation || '—'} → {toLocation || '—'}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gp-steel">Department</span>
                                <span className="text-gp-ink font-medium">{department || '—'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gp-steel">Vehicle</span>
                                <span className="text-gp-ink font-medium">{vehicleNumber || '—'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gp-steel">Driver</span>
                                <span className="text-gp-ink font-medium">{driverName || '—'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gp-steel">Materials</span>
                                <span className="text-gp-ink font-medium">{materials.filter(m => m.name).length || 0} item(s)</span>
                            </div>
                        </div>

                        <div className="mt-auto space-y-3">
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

                            {/* Desktop/tablet: always-visible submit, no scrolling required.
                                Hidden on mobile in favor of the sticky bar below. */}
                            <button
                                onClick={handleSubmit}
                                disabled={loading}
                                className="hidden lg:block w-full py-3 rounded-sm bg-gp-navy hover:bg-gp-navy-deep disabled:bg-gp-navy/40 text-gp-paper font-semibold transition tracking-wide"
                            >
                                {loading ? 'Creating…' : 'Create Gate Pass'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* RIGHT PANEL — scrollable field set */}
                <div className="lg:h-full lg:overflow-y-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10 pb-28 lg:pb-10">
                    <div className="max-w-2xl mx-auto space-y-6">

                        {/* From / To location */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>From (location)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Stores, Shop No. 2"
                                    value={fromLocation}
                                    onChange={e => setFromLocation(e.target.value)}
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>To (location)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Vendor workshop, Site X"
                                    value={toLocation}
                                    onChange={e => setToLocation(e.target.value)}
                                    className={inputClass}
                                />
                            </div>
                        </div>

                        <div>
                            <label className={labelClass}>Vendor (optional)</label>
                            <select
                                value={vendorId}
                                onChange={e => setVendorId(e.target.value)}
                                className={inputClass}
                            >
                                <option value="">Select vendor (optional)</option>
                                {vendors.map(v => (
                                    <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className={labelClass}>Department</label>
                            <select
                                value={department}
                                onChange={e => setDepartment(e.target.value)}
                                className={inputClass}
                            >
                                <option value="">Select department</option>
                                {departmentOptions.map(dep => (
                                    <option key={dep} value={dep}>{dep}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gp-steel/70 mt-1.5">
                                Determines who approves this pass — pulled from your profile if set
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Vehicle Number</label>
                                <input
                                    type="text"
                                    placeholder="e.g. UP32AB1234"
                                    value={vehicleNumber}
                                    maxLength={15}
                                    onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Driver Name</label>
                                <input
                                    type="text"
                                    placeholder="Driver full name"
                                    value={driverName}
                                    onChange={e => setDriverName(e.target.value)}
                                    className={inputClass}
                                />
                            </div>
                        </div>

                        <div>
                            <label className={labelClass}>Driver Phone</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                placeholder="10-digit mobile number"
                                value={driverPhone}
                                maxLength={10}
                                onChange={e => setDriverPhone(e.target.value.replace(/\D/g, ''))}
                                className={inputClass}
                            />
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-sm font-medium text-gp-ink">Materials</label>
                                <button
                                    onClick={addMaterial}
                                    className="text-sm text-gp-navy hover:text-gp-amber font-medium transition"
                                >
                                    + Add Material
                                </button>
                            </div>
                            <p className="text-xs text-gp-steel/70 mb-3">
                                A unique Material ID and the issue date will be generated automatically for each item when you submit.
                            </p>
                            <div className="space-y-3">
                                {materials.map((material, index) => (
                                    <div key={index} className="bg-gp-paper/60 border border-gp-line rounded-sm p-4">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div className="col-span-2 md:col-span-1">
                                                <input
                                                    type="text"
                                                    placeholder="Material name"
                                                    value={material.name}
                                                    onChange={e => updateMaterial(index, 'name', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-navy text-sm transition"
                                                />
                                            </div>
                                            <div>
                                                <input
                                                    type="number"
                                                    placeholder="Qty"
                                                    value={material.quantity || ''}
                                                    onChange={e => updateMaterial(index, 'quantity', parseFloat(e.target.value))}
                                                    className="w-full px-3 py-2 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-navy text-sm transition"
                                                />
                                            </div>
                                            <div>
                                                <select
                                                    value={material.unit}
                                                    onChange={e => updateMaterial(index, 'unit', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-sm bg-white border border-gp-line text-gp-ink outline-none focus:border-gp-navy text-sm transition"
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
                                                    className="w-full px-3 py-2 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-navy text-sm transition"
                                                />
                                                {materials.length > 1 && (
                                                    <button
                                                        onClick={() => removeMaterial(index)}
                                                        className="text-gp-rust hover:text-gp-rust/80 px-2 transition"
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
                                <label className={labelClass}>Invoice Number (optional)</label>
                                <input
                                    type="text"
                                    placeholder="INV-001"
                                    value={invoiceNumber}
                                    onChange={e => setInvoiceNumber(e.target.value)}
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Invoice Date (optional)</label>
                                <input
                                    type="date"
                                    value={invoiceDate}
                                    onChange={e => setInvoiceDate(e.target.value)}
                                    className={inputClass}
                                />
                            </div>
                        </div>

                        <div>
                            <label className={labelClass}>Invoice File (optional)</label>
                            <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={e => setInvoiceFile(e.target.files?.[0] || null)}
                                className="w-full px-4 py-3 rounded-sm bg-white border border-gp-line text-gp-steel outline-none focus:border-gp-navy transition file:mr-4 file:py-1 file:px-3 file:rounded-sm file:border-0 file:bg-gp-navy file:text-gp-paper file:text-sm"
                            />
                        </div>

                    </div>
                </div>
            </div>

            {/* Mobile: fixed bottom action bar, like a native app's primary CTA.
                Also carries the error/success state so it's visible without
                having to scroll back up to the left panel. */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gp-line p-4 z-10 space-y-2">
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
                    onClick={handleSubmit}
                    disabled={loading}
                    className="w-full py-3.5 rounded-sm bg-gp-navy active:bg-gp-navy-deep disabled:bg-gp-navy/40 text-gp-paper font-semibold transition tracking-wide"
                >
                    {loading ? 'Creating…' : 'Create Gate Pass'}
                </button>
            </div>
        </main>
    )
}