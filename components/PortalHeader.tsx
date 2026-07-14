interface PortalHeaderProps {
    userName?: string
    roleLabel?: string
    onLogout?: () => void
    greeting?: string
}

export function PortalHeader({ userName, roleLabel, onLogout, greeting }: PortalHeaderProps) {
    return (
        <header className="bg-gp-navy">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
                {greeting ? (
                    <span className="text-[11px] uppercase tracking-[0.2em] text-gp-paper/80">
                        {greeting}
                    </span>
                ) : (
                    <span />
                )}

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
            <div className="h-[3px] bg-gradient-to-r from-gp-amber/60 via-gp-amber/40 to-transparent" />
        </header>
    )
}
