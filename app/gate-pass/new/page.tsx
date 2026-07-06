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

const STEPS = [
    { id: 1, label: 'Pass Type & Route' },
    { id: 2, label: 'Assignment' },
    { id: 3, label: 'Materials & Invoice' },
    { id: 4, label: 'Review & Submit' },
]

export default function NewGatePassPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [vendors, setVendors] = useState<Vendor[]>([])
    const [profile, setProfile] = useState<AuthedProfile | null>(null)
    const [checkingAccess, setCheckingAccess] = useState(true)
    const [step, setStep] = useState(1)

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
            const p = await requireRole(['user', 'admin'], router)
            if (!p) return
            setProfile(p)

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

    // Lightweight per-step checks so the user gets pointed at the right
    // screen instead of a wall of errors at the very end. handleSubmit
    // below still re-validates everything as the real safety net.
    const validateStep = (s: number): string => {
        if (s === 1) {
            if (!fromLocation || fromLocation.length < 2) return 'From location required'
            if (!toLocation || toLocation.length < 2) return 'To location required'
        }
        if (s === 2) {
            if (!department || department.length < 2) return 'Department required'
            if (!vehicleNumber || vehicleNumber.length < 4) return 'Valid vehicle number required'
            if (!driverName || driverName.length < 2) return 'Driver name required'
            if (!/^\d{10}$/.test(driverPhone)) return 'Valid 10-digit phone required'
        }
        if (s === 3) {
            if (materials.some(m => !m.name || m.quantity <= 0)) return 'Fill all material details'
        }
        return ''
    }

    const goNext = () => {
        const err = validateStep(step)
        if (err) { setError(err); return }
        setError('')
        setStep(s => Math.min(s + 1, STEPS.length))
    }

    const goBack = () => {
        setError('')
        setStep(s => Math.max(s - 1, 1))
    }

    const handleSubmit = async () => {
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
            <main className="min-h-screen bg-gp-paper flex items-center justify-center">
                <p className="text-gp-steel text-sm uppercase tracking-wide">Loading…</p>
            </main>
        )
    }

    const inputClass = "w-full px-4 py-3 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-navy focus:ring-2 focus:ring-gp-navy/10 transition text-sm"
    const labelClass = "block text-sm font-medium text-gp-ink mb-2"

    return (
        <main className="min-h-screen bg-gp-paper flex flex-col pb-28 sm:pb-10">
            {/* Top bar */}
            <div className="sticky top-0 z-10 bg-white border-b border-gp-line px-4 sm:px-6 py-4">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-gp-steel mb-1">
                            Step {step} of {STEPS.length}
                        </p>
                        <h1 className="text-xl sm:text-2xl font-heading font-semibold text-gp-ink">
                            {STEPS[step - 1].label}
                        </h1>
                    </div>
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="text-gp-steel hover:text-gp-ink transition text-sm font-medium shrink-0"
                    >
                        Exit
                    </button>
                </div>

                {/* Progress bar */}
                <div className="max-w-3xl mx-auto mt-4 flex gap-1.5">
                    {STEPS.map(s => (
                        <div
                            key={s.id}
                            className={`h-1 flex-1 rounded-sm transition ${s.id <= step ? 'bg-gp-navy' : 'bg-gp-line'}`}
                        />
                    ))}
                </div>
            </div>

            <div className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 pt-6">
                <div className="bg-card border border-gp-line sm:rounded-sm p-4 sm:p-8 -mx-4 sm:mx-0">

                    {profile && (
                        <p className="text-xs text-gp-steel mb-6">
                            Creating as {profile.full_name || profile.email}
                        </p>
                    )}

                    {/* STEP 1 — Pass Type & Route */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <div>
                                <label className={labelClass}>Is the material coming back?</label>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setPassType('returnable')}
                                        className={`flex-1 py-3 rounded-sm font-medium transition border ${passType === 'returnable'
                                            ? 'bg-gp-navy text-gp-paper border-gp-navy'
                                            : 'bg-white text-gp-steel border-gp-line hover:bg-gp-navy/5'
                                            }`}
                                    >
                                        Returnable <span className="block text-xs opacity-80 font-normal">comes back, expires after a set time</span>
                                    </button>
                                    <button
                                        onClick={() => setPassType('non_returnable')}
                                        className={`flex-1 py-3 rounded-sm font-medium transition border ${passType === 'non_returnable'
                                            ? 'bg-gp-navy text-gp-paper border-gp-navy'
                                            : 'bg-white text-gp-steel border-gp-line hover:bg-gp-navy/5'
                                            }`}
                                    >
                                        Non-Returnable <span className="block text-xs opacity-80 font-normal">goes out for good</span>
                                    </button>
                                </div>
                                {passType === 'returnable' && (
                                    <p className="text-xs text-gp-navy mt-2">
                                        The approver will set the validity period (expiry date) when approving this pass.
                                    </p>
                                )}
                            </div>

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
                        </div>
                    )}

                    {/* STEP 2 — Assignment */}
                    {step === 2 && (
                        <div className="space-y-6">
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
                                        className={`${inputClass} font-mono`}
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
                                    className={`${inputClass} font-mono`}
                                />
                            </div>
                        </div>
                    )}

                    {/* STEP 3 — Materials & Invoice */}
                    {step === 3 && (
                        <div className="space-y-6">
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="text-sm font-medium text-gp-ink">Materials</label>
                                    <button
                                        onClick={addMaterial}
                                        className="text-sm text-gp-navy hover:text-gp-navy-deep font-medium transition"
                                    >
                                        + Add Material
                                    </button>
                                </div>
                                <p className="text-xs text-gp-steel/70 mb-3">
                                    A unique Material ID and the issue date will be generated automatically for each item when you submit.
                                </p>
                                <div className="space-y-3">
                                    {materials.map((material, index) => (
                                        <div key={index} className="bg-gp-paper border border-gp-line rounded-sm p-4">
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
                                                        className="w-full px-3 py-2 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-navy text-sm transition font-mono"
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
                                                        className="w-full px-3 py-2 rounded-sm bg-white border border-gp-line text-gp-ink placeholder:text-gp-steel/60 outline-none focus:border-gp-navy text-sm transition font-mono"
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
                                        className={`${inputClass} font-mono`}
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
                    )}

                    {/* STEP 4 — Review & Submit */}
                    {step === 4 && (
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <div className="border border-gp-line rounded-sm p-4">
                                    <p className="text-[11px] uppercase tracking-wide text-gp-steel mb-3">Pass Type & Route</p>
                                    <dl className="grid grid-cols-2 gap-y-2 text-sm">
                                        <dt className="text-gp-steel">Type</dt>
                                        <dd className="text-gp-ink text-right">{passType === 'returnable' ? 'Returnable' : 'Non-Returnable'}</dd>
                                        <dt className="text-gp-steel">From</dt>
                                        <dd className="text-gp-ink text-right">{fromLocation}</dd>
                                        <dt className="text-gp-steel">To</dt>
                                        <dd className="text-gp-ink text-right">{toLocation}</dd>
                                    </dl>
                                </div>

                                <div className="border border-gp-line rounded-sm p-4">
                                    <p className="text-[11px] uppercase tracking-wide text-gp-steel mb-3">Assignment</p>
                                    <dl className="grid grid-cols-2 gap-y-2 text-sm">
                                        <dt className="text-gp-steel">Department</dt>
                                        <dd className="text-gp-ink text-right">{department}</dd>
                                        <dt className="text-gp-steel">Vendor</dt>
                                        <dd className="text-gp-ink text-right">{vendors.find(v => v.id === vendorId)?.name || '—'}</dd>
                                        <dt className="text-gp-steel">Vehicle</dt>
                                        <dd className="text-gp-ink text-right font-mono">{vehicleNumber}</dd>
                                        <dt className="text-gp-steel">Driver</dt>
                                        <dd className="text-gp-ink text-right">{driverName}</dd>
                                        <dt className="text-gp-steel">Phone</dt>
                                        <dd className="text-gp-ink text-right font-mono">{driverPhone}</dd>
                                    </dl>
                                </div>

                                <div className="border border-gp-line rounded-sm p-4">
                                    <p className="text-[11px] uppercase tracking-wide text-gp-steel mb-3">
                                        Materials ({materials.length})
                                    </p>
                                    <div className="space-y-1.5">
                                        {materials.map((m, i) => (
                                            <div key={i} className="flex justify-between text-sm">
                                                <span className="text-gp-ink">{m.name || '—'}</span>
                                                <span className="text-gp-steel font-mono">{m.quantity} {m.unit} · ₹{m.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {(invoiceNumber || invoiceDate || invoiceFile) && (
                                        <div className="mt-3 pt-3 border-t border-gp-line text-xs text-gp-steel">
                                            {invoiceNumber && <p>Invoice #: {invoiceNumber}</p>}
                                            {invoiceDate && <p>Invoice Date: {invoiceDate}</p>}
                                            {invoiceFile && <p>Attached: {invoiceFile.name}</p>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="mt-6 text-sm text-gp-rust bg-gp-rust/5 border border-gp-rust/30 rounded-sm px-4 py-3">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="mt-6 text-sm text-gp-forest bg-gp-forest/5 border border-gp-forest/30 rounded-sm px-4 py-3">
                            {success}
                        </div>
                    )}

                    {/* Desktop nav buttons */}
                    <div className="hidden sm:flex gap-3 mt-8">
                        {step > 1 && (
                            <button
                                onClick={goBack}
                                className="px-6 py-3 rounded-sm border border-gp-line text-gp-steel hover:bg-gp-navy/5 font-medium transition"
                            >
                                Back
                            </button>
                        )}
                        {step < STEPS.length ? (
                            <button
                                onClick={goNext}
                                className="flex-1 py-3 rounded-sm bg-gp-navy hover:bg-gp-navy-deep text-gp-paper font-semibold transition"
                            >
                                Next
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmit}
                                disabled={loading}
                                className="flex-1 py-3 rounded-sm bg-gp-navy hover:bg-gp-navy-deep disabled:opacity-50 text-gp-paper font-semibold transition"
                            >
                                {loading ? 'Creating...' : 'Create Gate Pass'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Mobile sticky nav */}
            <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gp-line p-4 z-10 flex gap-3">
                {step > 1 && (
                    <button
                        onClick={goBack}
                        className="px-5 py-3.5 rounded-sm border border-gp-line text-gp-steel active:bg-gp-navy/5 font-medium transition"
                    >
                        Back
                    </button>
                )}
                {step < STEPS.length ? (
                    <button
                        onClick={goNext}
                        className="flex-1 py-3.5 rounded-sm bg-gp-navy active:bg-gp-navy-deep text-gp-paper font-semibold transition"
                    >
                        Next
                    </button>
                ) : (
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex-1 py-3.5 rounded-sm bg-gp-navy active:bg-gp-navy-deep disabled:opacity-50 text-gp-paper font-semibold transition"
                    >
                        {loading ? 'Creating...' : 'Create Gate Pass'}
                    </button>
                )}
            </div>
        </main>
    )
}