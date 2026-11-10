# Mi Contabilidad para iPad

El mismo programa de la Mac, dentro del iPad, **sin internet**. Se anota, se modifica, se ven los estados TIKR,
la caja, el inventario y las cuentas por cobrar y pagar, exactamente igual que en la Mac.

- **Los datos viven solo en el iPad**, cifrados con AES-256-GCM. Sin usuario y contraseña no se pueden leer.
- Esta página (GitHub) solo entrega **el programa vacío**: nunca recibe ni guarda datos.
- Internet solo hace falta **la primera vez**, para instalarla. Las versiones nuevas se descargan solas cuando hay internet.

## Publicarla (una sola vez, en la Mac)

1. Abre **GitHub Desktop** → **File → Add Local Repository…** → elige la carpeta `mi-contabilidad-ipad` → **Add Repository**.
2. Toca **Publish repository**. En **Name** escribe exactamente: `gabriel080812024-del.github.io`.
   **Quita** la marca de "Keep this code private". Luego toca **Publish Repository**.
3. Espera 2 minutos y abre `https://gabriel080812024-del.github.io/` en Safari. Debe salir "Mi Contabilidad".

## Instalarla en el iPad de la contadora (una sola vez, con internet)

1. En el iPad abre **Safari** y entra en `gabriel080812024-del.github.io`.
2. Espera a que cargue (la primera vez tarda un poco).
3. Toca **Compartir** (el cuadrado con la flecha) → **Añadir a pantalla de inicio** → **Añadir**.
4. Desde ahora, ábrela siempre con el icono **Contabilidad** de la pantalla de inicio. Funciona sin internet.

## Pasar los datos de la Mac al iPad (una sola vez)

1. En la Mac: **Más → Copias de seguridad → Descargar una copia**.
2. Manda ese archivo (`….db.cifrado`) al iPad por **AirDrop** y elige **Guardar en Archivos**.
3. En el iPad abre la app → **Restaurar mi copia de seguridad** → elige el archivo → tu usuario y contraseña de la Mac.
4. Ya dentro: **Más → Mi cuenta → Usuarios del programa** → crea el usuario de la contadora y márcalo como **Administrador**.
5. Desde ahí **solo se anota en el iPad**. La Mac queda como respaldo.

## Para mantenerla al día (programador)

Cuando cambie el programa de la Mac (`../mi-contabilidad`):

```
python3 construir.py
```

Luego **Commit** y **Push** en GitHub Desktop. El iPad se actualiza solo la próxima vez que tenga internet.

Piezas: `index.html` (pantalla de arranque), `_ipad/arranque.js` (carga Python en el navegador con Pyodide 0.27.7),
`sw.js` (funciona sin internet y pasa cada pantalla al programa), `puente.py` (conecta con Flask),
`_ipad/programa.zip` (el programa de la Mac y sus librerías, lo arma `construir.py`).
