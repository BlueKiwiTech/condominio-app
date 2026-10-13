---
name: commit
description: Genera un commit a partir de los cambios staged siguiendo el estilo del repo (español, descriptivo). Usar al cerrar una tarea.
---
# Commit

1. Ejecuta `git branch --show-current`. Si es `main`, detente y avisa: primero hay que crear una rama (`git checkout -b <tipo>/<slug>`).
2. Ejecuta `git status --short` y `git diff --staged`. Si no hay nada staged, muestra qué hay sin stage y pregunta qué incluir; nunca uses `git add -A`. Deja fuera archivos ajenos a la tarea (p. ej. cambios previos sin relación, `.env`).
3. Mira `git log --oneline -10` para igualar el estilo: **español, una línea descriptiva en imperativo o pasado corto, sin prefijos `feat:`/`fix:`**, ≤ 72 caracteres, que diga el *qué y el porqué* (p. ej. "Abono que no cubre ninguna cuota se guarda como saldo a favor en vez de rechazarse").
4. Si el cambio tiene motivo o decisiones no obvias, añade un cuerpo breve tras una línea en blanco. Si es un change de OpenSpec, menciónalo.
5. Commitea con ese mensaje. Termina el mensaje con el trailer de atribución que indique el entorno (`Co-Authored-By: ...`).
6. No hagas `git push` ni amendes commits existentes. Responde con el hash y el mensaje.
