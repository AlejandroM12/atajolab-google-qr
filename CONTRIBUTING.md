# Contribución

Los cambios entran por pull request. No se pushea directo a `main` ni a `develop`.

## Ramas

| Rama | Uso |
| --- | --- |
| `main` | Producción. Es la rama que se despliega. |
| `develop` | Integración y pruebas. Se abre desde `main` para que ambas partan de la misma revisión. |
| `feature/*` | Funcionalidades nuevas. Salen de `develop` y vuelven a `develop`. |
| `fix/*` | Correcciones. Salen de `develop` y vuelven a `develop`. |
| `hotfix/*` | Correcciones urgentes de producción. Salen de `main` y vuelven a `main` y a `develop`. |
| `refactor/*` | Mejoras internas, sin cambio de comportamiento. Salen de `develop`. |
| `chore/*` | Mantenimiento. Salen de `develop`. |

## Pull requests

- Una rama, un propósito.
- El pull request de una `feature`, `fix`, `refactor` o `chore` apunta a `develop`.
- El de un `hotfix` apunta a `main`. Después se integra el mismo cambio en `develop`.
- No se mergea si el workflow `ci` está en rojo.
- No se usa `git push --force` sobre `main` ni `develop`.

## Commits

Se usa Conventional Commits. El asunto va en infinitivo, en español, y dice para qué es el cambio:

- `feat:` funcionalidad
- `fix:` corrección
- `hotfix:` corrección urgente de producción
- `refactor:` cambio interno sin alterar el comportamiento
- `chore:` mantenimiento

El autor es la identidad Git local. No agregues un tráiler `Co-authored-by`.

## Secretos

No commitees `.env`, claves, tokens ni la URL real de la base. `.env.example` solo lleva marcadores. Si un secreto llegó al repositorio, se rota: no alcanza con borrarlo en un commit nuevo.
