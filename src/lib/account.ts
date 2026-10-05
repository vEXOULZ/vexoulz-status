// The shared *.vexoul.net sign-in (vexoulz-auth, through @vexoulz/ui/account).
import { createAccount } from '@vexoulz/ui/account'

/**
 * vexoulz-auth's URL. VITE_AUTH_BASE overrides it (a copy hosted elsewhere points it at its own, or sets it empty:
 * that turns sign-in off, and the menu's "Sign in" is greyed out).
 */
export const AUTH_BASE = import.meta.env.VITE_AUTH_BASE ?? 'https://auth.vexoul.net'

export const account = createAccount({ authBase: AUTH_BASE })
