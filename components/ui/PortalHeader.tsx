import Link from 'next/link'

interface PortalHeaderProps {
    userName?: string
    roleLabel?: string
    onLogout?: () => void
}

export function PortalHeader({ userName, roleLabel, onLogout }: PortalHeaderProps) {
    return (
        <header className="bg-gp-navy">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                <Link href="/dashboard" className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-9 h-9 rounded-sm border border-gp-amber/50 text-gp-amber font-heading text-sm font-bold">
                        GP
                    </span>
                    <span className="leading-tight">
                        <span className="block text-[10px] uppercase tracking-[0.2em] text-gp-amber/90">
                            BHEL Haridwar
                        </span>
                        <span className="block text-sm sm:text-base font-heading font-semibold text-gp-paper">
                            Material Gate Pass System
                        </span>
                    </span>
                </Link>

                {(userName || onLogout) && (
                    <div className="flex items-center gap-4">
                        {userName && (
                            <span className="hidden sm:flex flex-col items-end leading-tight">
                                <span className="text-sm font-medium text-gp-paper">{userName}</span>
                                {roleLabel && (
                                    <span className="text-[10px] uppercase tracking-wider text-gp-paper/60">
                                        {roleLabel}
                                    </span>
                                )}
                            </span>
                        )}
                        {onLogout && (
                            <button
                                onClick={onLogout}
                                className="px-3 py-1.5 rounded-sm border border-gp-paper/25 text-gp-paper/90 hover:border-gp-amber hover:text-gp-amber transition text-xs uppercase tracking-wider"
                            >
                                Logout
                            </button>
                        )}
                    </div>
                )}
            </div>
            <div className="h-[3px] bg-gradient-to-r from-gp-amber via-gp-amber/60 to-transparent" />
        </header>
    )
}