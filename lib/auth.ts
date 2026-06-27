import { supabase } from '@/lib/supabase'

export type Role = 'user' | 'approver' | 'security' | 'admin' | 'vendor'

export interface AuthedProfile {
    id: string
    email: string
    full_name: string | null
    role: Role
    department: string | null
}

/**
 * Returns the logged-in user's session + profile (role, department, etc.)
 * or null if nobody is logged in.
 */
export async function getCurrentProfile(): Promise<AuthedProfile | null> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, department')
        .eq('id', session.user.id)
        .single()

    if (!profile) return null
    return profile as AuthedProfile
}

/**
 * Call this at the top of a page's useEffect to enforce role-based access.
 *
 *   useEffect(() => {
 *     (async () => {
 *       const profile = await requireRole(['security', 'admin'], router)
 *       if (!profile) return // already redirected
 *       // ...load page data using profile
 *     })()
 *   }, [])
 *
 * - Not logged in            -> redirect to /login
 * - Logged in, wrong role    -> redirect to `fallback` (default /dashboard)
 * - Logged in, allowed role  -> returns the profile
 *
 * NOTE: this only guards the UI. It does not replace Supabase Row Level
 * Security (RLS) policies — those are what actually stop someone from
 * reading/writing data they shouldn't, even if they bypass the page.
 */
export async function requireRole(
    allowedRoles: Role[],
    router: { push: (path: string) => void },
    fallback: string = '/dashboard'
): Promise<AuthedProfile | null> {
    const profile = await getCurrentProfile()

    if (!profile) {
        router.push('/login')
        return null
    }

    if (!allowedRoles.includes(profile.role)) {
        router.push(fallback)
        return null
    }

    return profile
}
