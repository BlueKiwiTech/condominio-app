---
name: pr
description: Prepara la descripción de un Pull Request con la plantilla del repo (.github/pull_request_template.md), enlaza el change de OpenSpec y revisa el diff con el revisor adversarial. No usa git push ni gh: solo muestra en el chat el título y el cuerpo para que el usuario los pegue en GitHub Desktop/GitHub. Usar al terminar una tarea ya commiteada.
---
# Preparar Pull Request

Este skill **no publica nada**: no ejecuta `git push` ni `gh`. El usuario publica la rama con GitHub Desktop y crea el PR desde ahí; tú solo preparas el contenido.

1. **Rama:** `git branch --show-current`. Si es `main`, detente y avisa (se trabaja en rama propia).
2. **Estado:** `git status --short`. Si hay cambios de la tarea sin commitear, pide usar `/commit` primero.
3. **Contexto:** `git log --oneline main..HEAD` y `git diff main...HEAD` (completo). Si hay un change activo relacionado en `openspec/changes/`, léelo (proposal/tasks) y enlázalo.
4. **Verificación:** ejecuta `npm run build` y `npx eslint .` y anota el resultado real. Si fallan, dilo claramente antes de entregar nada.
5. **Revisión:** lanza el subagente `adversarial-reviewer` sobre el diff de la rama contra `main` (no hace falta que exista un PR). Incorpora sus hallazgos Crítico/Alto en la sección "Riesgos y revisión sugerida" del cuerpo y cuéntaselos al usuario sin suavizarlos.
6. **Redacta** siguiendo `.github/pull_request_template.md` sección por sección, en español, con datos reales del diff. Las secciones que no apliquen llevan "N/A" con motivo; no dejes el texto de ejemplo. Título: una línea descriptiva en español, como los commits.
7. **Entrega en el chat**, en este orden:
   - Título (una línea).
   - Cuerpo completo en un bloque de código Markdown, listo para copiar.
   - Una línea con el siguiente paso: "Publica la rama en GitHub Desktop y crea el PR pegando esto".
   - Si el revisor halló algo Crítico/Alto, díselo antes del bloque.
