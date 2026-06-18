import { supabase } from '@/lib/supabase'

export const APPROVER_MATRIX: Record<string, string> = {
    'Purchase': 'purchase-manager@company.com',
    'Stores': 'stores-manager@company.com',
    'Production': 'akshatmamgain413@gmail.com',
    'Admin': 'akshatmamgain413@gmail.com',
}

export async function assignApprover(department: string): Promise<string | null> {
    const email = APPROVER_MATRIX[department]
    if (!email) return null

    const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single()

    return data?.id || null
}