# Spec Delta

## MODIFIED Requirements

### Requirement: Admin route protection
`proxy.ts` SHALL redirigir a `/login` (conservando el prefijo de locale) toda ruta admin protegida (`/dashboard`, `/houses`, `/cuotas`, `/pagos`, `/pagos-reportados`, `/reporte`, `/gastos`, `/gastos-pagados`, `/saldo-comunidad`) cuando `getClaims()` no devuelve claims, salvo las peticiones de una Server Action, que SHALL llegar a la acción para que responda `sessionExpired`. El layout `(admin)` SHALL repetir la verificación con `getClaims()` como defensa en profundidad.

#### Scenario: Visitante sin sesión
- **WHEN** una petición sin claims de Supabase llega a `/dashboard`
- **THEN** el proxy redirige a `/login`

#### Scenario: Saldo de la comunidad sin sesión
- **WHEN** una petición sin claims llega a `/saldo-comunidad`
- **THEN** el proxy redirige a `/login`

#### Scenario: Acción tras cerrar sesión en otra pestaña
- **WHEN** un formulario de admin se envía después de cerrar sesión en otra pestaña
- **THEN** la acción responde "Tu sesión expiró" sin escribir nada y la página no se rompe
