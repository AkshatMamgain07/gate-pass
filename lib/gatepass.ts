import { supabase } from '@/lib/supabase'

export const UNITS = ['kg', 'pieces', 'liters', 'bags', 'boxes', 'meters']

export interface Material {
    material_id: string
    name: string
    quantity: number
    unit: string
    value: number
    date_issued: string
}

// Pass type is now always "outward" at BHEL — the only choice is whether
// the material is expected to come back (returnable) or not.
export type PassType = 'returnable' | 'non_returnable'

export const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
    cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
    exited: 'bg-blue-50 text-blue-700 border-blue-200',
    overdue: 'bg-orange-50 text-orange-700 border-orange-300',
    completed: 'bg-violet-50 text-violet-700 border-violet-200',
}

export const STATUS_LABELS: Record<string, string> = {
    pending: 'Pending Approval',
    approved: 'Approved – Awaiting Gate Exit',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    exited: 'Out – Material Gone',
    overdue: 'Overdue – Not Returned',
    completed: 'Completed',
}

export const PASS_TYPE_COLORS: Record<string, string> = {
    returnable: 'bg-sky-50 text-sky-700 border-sky-200',
    non_returnable: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
}

export const PASS_TYPE_LABELS: Record<string, string> = {
    returnable: 'Returnable',
    non_returnable: 'Non-Returnable',
}

export async function generatePassNumber() {
    const year = new Date().getFullYear()
    const { data } = await supabase
        .from('gate_passes')
        .select('pass_number')
        .like('pass_number', `GP/${year}/%`)
        .order('created_at', { ascending: false })
        .limit(1)

    const lastNum = data?.[0]?.pass_number?.split('/')[2] || '0'
    const nextNum = (parseInt(lastNum) + 1).toString().padStart(6, '0')
    return `GP/${year}/${nextNum}`
}

// Each material line item gets its own Material ID, tied to the parent
// pass number, plus the date it was issued (taken out of the gate).
export function buildMaterialsWithIds(
    materials: { name: string; quantity: number; unit: string; value: number }[],
    passNumber: string
): Material[] {
    const todayISO = new Date().toISOString().slice(0, 10)
    const shortPass = passNumber.replace(/\//g, '-')
    return materials.map((m, i) => ({
        ...m,
        material_id: `${shortPass}-M${i + 1}`,
        date_issued: todayISO,
    }))
}

export function formatDate(d?: string | null) {
    if (!d) return 'N/A'
    return new Date(d).toLocaleDateString('en-IN')
}

export function formatDateTime(d?: string | null) {
    if (!d) return 'N/A'
    return new Date(d).toLocaleString('en-IN')
}

export function isOverdue(pass: { type: string; status: string; expiry_date?: string | null }) {
    if (pass.type !== 'returnable') return false
    if (pass.status !== 'exited') return false
    if (!pass.expiry_date) return false
    return new Date(pass.expiry_date).getTime() < Date.now()
}
