# Reglas de trabajo

## 1. Piensa antes de hacer
- Antes de escribir codigo, di en pocas lineas que vas a cambiar y por que.
- Si algo no esta claro, pregunta una sola vez. No adivines.

## 2. Hazlo simple
- Elige la solucion mas corta que funcione. Sin opciones ni codigo "por si acaso".

## 3. No dupliques
- Antes de crear una funcion, componente, estilo o ruta, busca si ya existe algo parecido.
- Si existe, reutilizalo. Crea algo nuevo solo si no hay nada que sirva y di por que.

## 4. Toca solo lo que pido
- Cambia solo lo necesario para la peticion. Si ves otro problema, avisame sin arreglarlo.
- No cambies diseno, textos ni formato de lo que no se menciono.

## 5. Prueba antes de hacer commit
- Corre pruebas y compilacion antes de cada commit. Si algo falla, arreglalo o dime que fallo.
- Si el cambio se ve en pantalla, revisalo en pantalla.

## 6. Sincroniza y fusiona despues de que funcione
- `git fetch` antes de modificar y otra vez antes de fusionar. Si otro participante subio cambios, mezclalos sin perder trabajo de nadie y vuelve a probar.
- No subas a `main` sin que yo lo diga.

## Conocimiento del proyecto (vault)
El conocimiento vive en `.claude/vault/` (local, no se versiona).
- Antes de empezar una tarea lee `.claude/vault/AGENTS.md` y `.claude/vault/MiTiendita/MiTiendita.md`.
- Al terminar una sesion con cambios relevantes, agrega una nota con `Plantillas/Sesion.md` en `MiTiendita/Sesiones/` y enlazala desde `MiTiendita.md`.
- Decisiones importantes: `Plantillas/Decision.md` en `MiTiendita/Decisiones/`.
- Si una nota contradice el codigo, manda el codigo: deja la contradiccion visible.
