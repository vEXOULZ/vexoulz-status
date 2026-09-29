// The shared *.vexoulz.net sign-in (vexoulz-auth, through @vexoulz/ui/account).
import { createAccount } from '@vexoulz/ui/account'

/**
 * vexoulz-auth's URL. VITE_AUTH_BASE overrides it; empty turns sign-in off (the menu's "Sign in" is greyed out),
 * which is also the default until the service is live.
 */
export const AUTH_BASE = import.meta.env.VITE_AUTH_BASE ?? ''

export const account = createAccount({ authBase: AUTH_BASE })
