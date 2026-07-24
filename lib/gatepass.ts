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

// "Stamp" styling: outline badges for in-progress states, a solid filled
// badge only for "completed" (closed-file feel, like a case being sealed).
export const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-gp-amber/10 text-gp-amber border-gp-amber/40',
    approved: 'bg-gp-forest/10 text-gp-forest border-gp-forest/40',
    rejected: 'bg-gp-rust/10 text-gp-rust border-gp-rust/40',
    cancelled: 'bg-gp-steel/10 text-gp-steel border-gp-steel/30',
    exited: 'bg-gp-navy/10 text-gp-navy border-gp-navy/30',
    overdue: 'bg-gp-rust/15 text-gp-rust border-gp-rust/60',
    completed: 'bg-gp-navy text-gp-paper border-gp-navy',
    // Security flagged/denied the pass at the gate (e.g. validity already
    // expired, mismatched material, etc.) — same visual weight as overdue
    // since both represent a problem state that needs admin attention.
    gate_denied: 'bg-gp-rust/15 text-gp-rust border-gp-rust/60',
}

export const STATUS_LABELS: Record<string, string> = {
    pending: 'Pending Approval',
    approved: 'Approved – Awaiting Gate Exit',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    exited: 'Out – Material Gone',
    overdue: 'Overdue – Not Returned',
    completed: 'Completed',
    gate_denied: 'Denied at Gate',
}

export const PASS_TYPE_COLORS: Record<string, string> = {
    returnable: 'bg-gp-navy/5 text-gp-navy border-gp-navy/30',
    non_returnable: 'bg-gp-steel/10 text-gp-steel border-gp-steel/30',
}

export const PASS_TYPE_LABELS: Record<string, string> = {
    returnable: 'Returnable',
    non_returnable: 'Non-Returnable',
}

export async function generatePassNumber() {
    // Delegates to a SECURITY DEFINER Postgres function that atomically
    // increments a dedicated counter table. This replaces the old
    // approach of reading the highest existing pass_number from
    // gate_passes directly — that approach broke once RLS restricted a
    // plain User's SELECT visibility to only their own passes, since it
    // meant a User computed "next number" based only on rows *they*
    // could see, not the true global maximum, causing constant
    // duplicate-key collisions with passes created by other people.
    const { data, error } = await supabase.rpc('next_gate_pass_number')
    if (error) throw error
    return data as string
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

// True when security has flagged/denied the pass at the gate (left a
// reason) but the pass hasn't actually exited yet — i.e. it's still
// sitting in 'approved' status. Without this, the UI would keep showing
// "Approved – Awaiting Gate Exit" even though the material was turned
// away at the gate.
export function isGateDenied(pass: { status: string; gate_reject_reason?: string | null; exited_at?: string | null }) {
    return !!pass.gate_reject_reason && pass.status === 'approved' && !pass.exited_at
}