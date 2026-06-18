'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { supabase } from '@/lib/supabase'

const UNITS = ['kg', 'pieces', 'liters', 'bags', 'boxes', 'meters']

interface Material {
    name: string
    quantity: number
    unit: string
    value: number
}

export default function EditGatePassPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const [type, setType] = useState<'inward' | 'outward'>('inward')
    const [department, setDepartment] = useState('')
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

            const { data } = await supabase
                .from('gate_passes')
                .select('*')
                .eq('id', id)
                .single()

            if (!data) return router.push('/dashboard')

            if (data.status !== 'pending') {
                alert('Only pending passes can be edited!')
                return router.push(`/gate-pass/${id}`)
            }

            setType(data.type)
            setDepartment(data.department)
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
        setMaterials([...materials, { name: '', quantity: 0, unit: 'kg', value: 0 }])
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
        if (!vehicleNumber || vehicleNumber.length < 4) return setError('Valid vehicle number required')
        if (!driverName || driverName.length < 2) return setError('Driver name required')
        if (!/^\d{10}$/.test(driverPhone)) return setError('Valid 10-digit phone required')
        if (materials.some(m => !m.name || m.quantity <= 0)) return setError('Fill all material details')

        setSaving(true)
        const { data: { session } } = await supabase.auth.getSession()

        const { error: updateError } = await supabase
            .from('gate_passes')
            .update({
                type,
                department,
                vehicle_number: vehicleNumber,
                driver_name: driverName,
                driver_phone: driverPhone,
                invoice_number: invoiceNumber || null,
                invoice_date: invoiceDate || null,
                materials,
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
            action: 'edited',
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
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
            <p className="text-white text-xl">Loading...</p>
        </div>
    )

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
            <div className="max-w-3xl mx-auto">
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-8">

                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h1 className="text-2xl font-bold text-white">Edit Gate Pass</h1>
                            <p className="text-slate-400 mt-1">{passNumber}</p>
                        </div>
                        <button onClick={() => router.push(`/gate-pass/${id}`)} className="text-slate-400 hover:text-white transition">
                            ← Back
                        </button>
                    </div>

                    <div className="space-y-6">

                        {/* Type */}
                        <div>
                            <label className="block text-sm text-slate-300 mb-3">Pass Type</label>
                            <div className="flex gap-4">
                                {(['inward', 'outward'] as const).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setType(t)}
                                        className={`flex-1 py-3 rounded-xl font-medium transition capitalize ${type === t ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Department */}
                        <div>
                            <label className="block text-sm text-slate-300 mb-2">Department</label>
                            <input
                                type="text"
                                value={department}
                                onChange={e => setDepartment(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-slate-700 text-white outline-none focus:border-blue-500 transition"
                            />
                        </div>

                        {/* Vehicle & Driver */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-slate-300 mb-2">Vehicle Number</label>
                                <input
                                    type="text"
                                    value={vehicleNumber}
                                    onChange={e => setVehicleNumber(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-slate-700 text-white outline-none focus:border-blue-500 transition"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-300 mb-2">Driver Name</label>
                                <input
                                    type="text"
                                    value={driverName}
                                    onChange={e => setDriverName(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-slate-700 text-white outline-none focus:border-blue-500 transition"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm text-slate-300 mb-2">Driver Phone</label>
                            <input
                                type="text"
                                value={driverPhone}
                                onChange={e => setDriverPhone(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-slate-700 text-white outline-none focus:border-blue-500 transition"
                            />
                        </div>

                        {/* Materials */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-sm text-slate-300">Materials</label>
                                <button onClick={addMaterial} className="text-sm text-blue-400 hover:text-blue-300 transition">
                                    + Add Material
                                </button>
                            </div>
                            <div className="space-y-3">
                                {materials.map((material, index) => (
                                    <div key={index} className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div className="col-span-2 md:col-span-1">
                                                <input
                                                    type="text"
                                                    placeholder="Material name"
                                                    value={material.name}
                                                    onChange={e => updateMaterial(index, 'name', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder:text-slate-500 outline-none focus:border-blue-500 text-sm transition"
                                                />
                                            </div>
                                            <div>
                                                <input
                                                    type="number"
                                                    placeholder="Qty"
                                                    value={material.quantity || ''}
                                                    onChange={e => updateMaterial(index, 'quantity', parseFloat(e.target.value))}
                                                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder:text-slate-500 outline-none focus:border-blue-500 text-sm transition"
                                                />
                                            </div>
                                            <div>
                                                <select
                                                    value={material.unit}
                                                    onChange={e => updateMaterial(index, 'unit', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white outline-none focus:border-blue-500 text-sm transition"
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
                                                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder:text-slate-500 outline-none focus:border-blue-500 text-sm transition"
                                                />
                                                {materials.length > 1 && (
                                                    <button onClick={() => removeMaterial(index)} className="text-red-400 hover:text-red-300 px-2 transition">
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
                                <label className="block text-sm text-slate-300 mb-2">Invoice Number (optional)</label>
                                <input
                                    type="text"
                                    value={invoiceNumber}
                                    onChange={e => setInvoiceNumber(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-slate-700 text-white outline-none focus:border-blue-500 transition"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-300 mb-2">Invoice Date (optional)</label>
                                <input
                                    type="date"
                                    value={invoiceDate}
                                    onChange={e => setInvoiceDate(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-slate-700 text-white outline-none focus:border-blue-500 transition"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                                {error}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 text-white font-semibold transition"
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button
                                onClick={handleCancel}
                                className="px-6 py-3 rounded-xl bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 font-semibold transition"
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