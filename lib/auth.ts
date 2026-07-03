import { supabase } from '@/lib/supabase'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// 'approver' and 'vendor' are legacy/separate: 'approver' is no longer
// assignable or used in access checks (approval duties now live entirely
// with 'admin'), kept here only so old rows in the DB still type-check.
// 'vendor' has its own separate portal/login flow.
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

/**
 * Server-side equivalent of getCurrentProfile(), for use inside API routes.
 * The browser sends the user's Supabase access token in the Authorization
 * header; we verify it against Supabase Auth (not just trust it) and then
 * look up the profile/role from the DB.
 *
 * Returns both the profile AND a request-scoped Supabase client that has
 * the caller's access token attached. This matters because the module-level
 * `supabase` client (imported above) has no session in an API route context
 * — every query it makes is RLS-anonymous, i.e. auth.uid() resolves to
 * null. Using that client for any RLS-protected table (profiles,
 * gate_passes, ...) silently returns zero rows even for a legitimate,
 * fully-authorized caller. Route handlers should use the returned `client`
 * for all further queries in that request, not the shared `supabase` import.
 */
export async function getAuthedRequestContext(req: Request): Promise<{ profile: AuthedProfile; client: SupabaseClient } | null> {
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return null

    const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    )

    const { data: userData, error: userErr } = await client.auth.getUser(token)
    if (userErr || !userData?.user) return null

    const { data: profile } = await client
        .from('profiles')
        .select('id, email, full_name, role, department')
        .eq('id', userData.user.id)
        .single()

    if (!profile) return null
    return { profile: profile as AuthedProfile, client }
}

/**
 * Backwards-compatible wrapper — same as before, but now backed by a
 * request-scoped authenticated client internally so the profile lookup
 * itself actually passes RLS.
 */
export async function getAuthedRequestProfile(req: Request): Promise<AuthedProfile | null> {
    const ctx = await getAuthedRequestContext(req)
    return ctx?.profile ?? null
}

/**
 * Decides whether a given profile is allowed to view/act on a given gate pass.
 * Admin and security can see everything (security needs it at the gate).
 * Otherwise, only the person who created the pass or the approver assigned
 * to it can access it.
 */
export function canAccessPass(
    profile: AuthedProfile,
    pass: { created_by: string; approver_id: string | null }
): boolean {
    if (profile.role === 'admin' || profile.role === 'security') return true
    if (pass.created_by === profile.id) return true
    if (pass.approver_id === profile.id) return true
    return false
}