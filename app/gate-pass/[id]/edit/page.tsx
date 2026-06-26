'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { supabase } from '@/lib/supabase'
import { UNITS, PassType, Material } from '@/lib/gatepass'

// Edit is allowed for 'pending' (anyone who can see it) and 'approved'
// (admin/approver only, since it has already gone through approval).
const EDITABLE_STATUSES = ['pending', 'approved']

export default function EditGatePassPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [userRole, setUserRole] = useState('')
    const [originalStatus, setOriginalStatus] = useState('')

    const [passType, setPassType] = useState<PassType>('non_returnable')
    const [department, setDepartment] = useState('')
    const [fromLocation, setFromLocation] = useState('')
    const [toLocation, setToLocation] = useState('')
    const [vehicleNumber, setVehicleNumber] = useState('')
    const [driverName, setDriverName] = useState('')
    const [driverPhone, setDriverPhone] = useState('')
    const [invoiceNumber, setInvoiceNumber] = useState('')
    const [invoiceDate, setInvoiceDate] = useState('')
    const [materials, setMaterials] = useState<Material[]>([])
    const [passNumber, setPassNumber] = useState('')

    useEffect(() => {
        const fetchPass = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return router.push('/login')

            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', session.user.id)
                .single()
            setUserRole(profile?.role || 'user')

            const { data } = await supabase
                .from('gate_passes')
                .select('*')
                .eq('id', id)
                .single()

            if (!data) return router.push('/dashboard')

            if (!EDITABLE_STATUSES.includes(data.status)) {
                alert('This gate pass can no longer be edited (it has moved past approval/exit).')
                return router.push(`/gate-pass/${id}`)
            }

            if (data.status === 'approved' && (profile?.role || 'user') !== 'admin') {
                alert('Only an admin/approver can edit a gate pass that is already approved.')
                return router.push(`/gate-pass/${id}`)
            }

            setOriginalStatus(data.status)
            setPassType(data.type)
            setDepartment(data.department)
            setFromLocation(data.from_location || '')
            setToLocation(data.to_location || '')
            setVehicleNumber(data.vehicle_number)
            setDriverName(data.driver_name)
            setDriverPhone(data.driver_phone)
            setInvoiceNumber(data.invoice_number || '')
            setInvoiceDate(data.invoice_date || '')
            setMaterials(data.materials || [])
            setPassNumber(data.pass_number)
            setLoading(false)
        }
        fetchPass()
    }, [id])

    const addMaterial = () => {
        const shortPass = passNumber.replace(/\//g, '-')
        setMaterials([...materials, {
            material_id: `${shortPass}-M${materials.length + 1}`,
            name: '',
            quantity: 0,
            unit: 'kg',
            value: 0,
            date_issued: new Date().toISOString().slice(0, 10),
        }])
    }

    const removeMaterial = (index: number) => {
        setMaterials(materials.filter((_, i) => i !== index))
    }

    const updateMaterial = (index: number, field: keyof Material, value: string | number) => {
        const updated = [...materials]
        updated[index] = { ...updated[index], [field]: value }
        setMaterials(updated)
    }

    const handleSave = async () => {
        setError('')
        if (!department || department.length < 2) return setError('Department required')
        if (!fromLocation || fromLocation.length < 2) return setError('From location required')
        if (!toLocation || toLocation.length < 2) return setError('To location required')
        if (!vehicleNumber || vehicleNumber.length < 4) return setError('Valid vehicle number required')
        if (!driverName || driverName.length < 2) return setError('Driver name required')
        if (!/^\d{10}$/.test(driverPhone)) return setError('Valid 10-digit phone required')
        if (materials.some(m => !m.name || m.quantity <= 0)) return setError('Fill all material details')

        setSaving(true)
        const { data: { session } } = await supabase.auth.getSession()

        const { error: updateError } = await supabase
            .from('gate_passes')
            .update({
                type: passType,
                department,
                from_location: fromLocation,
                to_location: toLocation,
                vehicle_number: vehicleNumber,
                driver_name: driverName,
                driver_phone: driverPhone,
                invoice_number: invoiceNumber || null,
                invoice_date: invoiceDate || null,
                materials,
                last_edited_at: new Date().toISOString(),
                last_edited_by: session?.user.id,
            })
            .eq('id', id)

        if (updateError) {
            setError(updateError.message)
            setSaving(false)
            return
        }

        await supabase.from('activity_logs').insert({
            gate_pass_id: id,
            user_id: session?.user.id,
            action: originalStatus === 'approved' ? 'edited_after_approval' : 'edited',
        })

        router.push(`/gate-pass/${id}`)
    }

    const handleCancel = async () => {
        if (!confirm('Are you sure you want to cancel this gate pass?')) return

        const { data: { session } } = await supabase.auth.getSession()

        await supabase
            .from('gate_passes')
            .update({ status: 'cancelled' })
            .eq('id', id)

        await supabase.from('activity_logs').insert({
            gate_pass_id: id,
            user_id: session?.user.id,
            action: 'cancelled',
        })

        router.push('/dashboard')
    }

    if (loading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <p className="text-gray-500 text-lg">Loading...</p>
        </div>
    )

    return (
        <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
            <div className="max-w-3xl mx-auto">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8">

                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Edit Gate Pass</h1>
                            <p className="text-gray-500 mt-1">{passNumber}</p>
                        </div>
                        <button onClick={() => router.push(`/gate-pass/${id}`)} className="text-gray-500 hover:text-gray-900 transition text-sm font-medium">
                            ← Back
                        </button>
                    </div>

                    {originalStatus === 'approved' && (
                        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                            This pass is already approved. Editing it will not reset the approval, but the change will be recorded in the activity log.
                        </div>
                    )}

                    <div className="space-y-6">

                        {/* Returnable / Non-returnable */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-3">Is the material coming back?</label>
                            <div className="flex gap-4">
                                {(['returnable', 'non_returnable'] as const).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setPassType(t)}
                                        className={`flex-1 py-3 rounded-xl font-medium transition border capitalize ${passType === t
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                            }`}
                                    >
                                        {t === 'returnable' ? 'Returnable' : 'Non-Returnable'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* From / To */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">From (location)</label>
                                <input
                                    type="text"
                                    value={fromLocation}
                                    onChange={e => setFromLocation(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">To (location)</label>
                                <input
                                    type="text"
                                    value={toLocation}
                                    onChange={e => setToLocation(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                />
                            </div>
                        </div>

                        {/* Department */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                            <input
                                type="text"
                                value={department}
                                onChange={e => setDepartment(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                            />
                        </div>

                        {/* Vehicle & Driver */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle Number</label>
                                <input
                                    type="text"
                                    value={vehicleNumber}
                                    onChange={e => setVehicleNumber(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Driver Name</label>
                                <input
                                    type="text"
                                    value={driverName}
                                    onChange={e => setDriverName(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Driver Phone</label>
                            <input
                                type="text"
                                value={driverPhone}
                                onChange={e => setDriverPhone(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                            />
                        </div>

                        {/* Materials */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-sm font-medium text-gray-700">Materials</label>
                                <button onClick={addMaterial} className="text-sm text-blue-600 hover:text-blue-700 font-medium transition">
                                    + Add Material
                                </button>
                            </div>
                            <div className="space-y-3">
                                {materials.map((material, index) => (
                                    <div key={index} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs text-gray-400 font-mono">{material.material_id}</span>
                                            <span className="text-xs text-gray-400">Issued: {material.date_issued}</span>
                                        </div>
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
                                                    <button onClick={() => removeMaterial(index)} className="text-red-500 hover:text-red-600 px-2 transition">
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Invoice */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Invoice Number (optional)</label>
                                <input
                                    type="text"
                                    value={invoiceNumber}
                                    onChange={e => setInvoiceNumber(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
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

                        {error && (
                            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                                {error}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold transition"
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button
                                onClick={handleCancel}
                                className="px-6 py-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-semibold transition"
                            >
                                Cancel Pass
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        </main>
    )
}
