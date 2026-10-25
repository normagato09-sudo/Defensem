# Área privada de DEFENSEM: puesta en marcha

La web sigue siendo estática (`public/`). El área privada usa:

- **Supabase**: cuentas (autenticación), base de datos Postgres con RLS y almacenamiento de imágenes.
- **Una función de Vercel** (`api/convidar.js`): solo sirve para que un administrador invite a usuarios nuevos.

La seguridad está en la base de datos (`supabase/schema.sql`: políticas RLS y triggers), no en el JavaScript del navegador. El navegador solo conoce la clave `anon`, que es pública por diseño. La clave `service_role` es secreta: solo va en las variables de entorno de Vercel y **nunca** en el repositorio ni en `public/js/config.js`.

Mientras no hagas estos pasos, la web pública funciona igual que antes (las noticias salen de `public/noticies.json`) y el área privada muestra «L'àrea privada encara no està configurada.».

## Pasos que tienes que hacer tú

1. **Crear el proyecto.** Entra en <https://supabase.com>, crea un proyecto gratuito y elige una región europea (por ejemplo, Frankfurt o Irlanda). Apunta la región: la política de privacidad tiene un hueco para indicarla.

2. **Crear la base de datos.** Ve a *SQL Editor → New query*, pega **todo** el contenido de `supabase/schema.sql` y pulsa *Run*. Se puede volver a ejecutar sin perder datos.

3. **Cerrar el registro público.** Ve a *Authentication → Sign In / Providers*:
   - **Desactiva «Allow new users to sign up»**: solo se entra por invitación.
   - En *Email*, deja activado el proveedor de correo y pon la longitud mínima de contraseña en **10**.
   - Activa la protección de contraseñas filtradas (*Leaked password protection*) si tu plan la ofrece (en el plan gratuito puede no estar disponible).

4. **URLs de redirección.** Ve a *Authentication → URL Configuration*:
   - *Site URL*: la URL de tu web en Vercel (por ejemplo, `https://defensem.vercel.app` o tu dominio propio).
   - *Redirect URLs*: añade `https://MI-DOMINIO/area-privada/contrasenya.html`. Si usas dos dominios (el de Vercel y uno propio), añade los dos.

5. **Crear el PRIMER administrador.**
   - *Authentication → Users → Add user → Create new user*: pon tu correo y una contraseña larga y marca **Auto Confirm User**.
   - En *SQL Editor*, ejecuta (con tu correo):
     ```sql
     update public.profiles set rol = 'admin' where email = 'MI-CORREO';
     ```
   - Los demás usuarios los invitarás desde el propio panel (*Usuaris → Convida un usuari*).

6. **Conectar la web.** En *Project Settings → API Keys*, copia el **Project URL** y la clave **`anon` `public`**. Si la pantalla muestra claves nuevas `sb_publishable_…`/`sb_secret_…`, usa la pestaña de claves *Legacy* (`anon` y `service_role`): son las que se han probado. Pégalas en `public/js/config.js`:
   ```js
   supabaseUrl: "https://XXXXXXXX.supabase.co",
   supabaseAnonKey: "eyJ…",
   ```
   Haz commit y push. **No subas nunca la `service_role`.**

7. **Variables de entorno en Vercel.** *Project Settings → Environment Variables* (entorno *Production*, y *Preview* si quieres probar ahí):
   - `SUPABASE_URL` = el Project URL.
   - `SUPABASE_SERVICE_ROLE_KEY` = la clave `service_role` (**solo aquí**).
   - `SITE_URL` = la URL pública de la web, sin barra final (la usan los enlaces de los correos de invitación).

   Después haz *Redeploy* para que la función las lea.

8. **Probar de punta a punta.**
   1. Abre `https://MI-DOMINIO/area-privada/` e inicia sesión como admin.
   2. *Usuaris → Convida un usuari*: invita a una cuenta tuya de prueba con el rol «Col·laborador de notícies».
   3. Comprueba que llega el correo, que el enlace abre «Tria la contrasenya» y que puedes entrar.
   4. Como colaborador, crea una noticia y pulsa «Envia a revisió»: debe quedar «Pendent de revisió» y ya no se puede editar.
   5. Como admin (o editor), en *Revisió* pulsa «Publica»: debe aparecer en la portada y en `/noticia.html?id=…`.
   6. Prueba también «Retorna» con una nota y comprueba que el colaborador la ve.

*(Opcional)* Para enviar invitaciones a mucha gente con fiabilidad, configura un SMTP propio en *Project Settings → Authentication → SMTP Settings*. El correo por defecto de Supabase tiene límites muy bajos (unos pocos correos por hora) y está pensado solo para pruebas.

## Entitats (octubre 2026)

`schema.sql` añade dos tablas. **Vuelve a ejecutar `schema.sql` entero** en *SQL Editor* (es idempotente) para crearlas:

- `entitats`: el índice público de `/recursos.html#entitats`. Lectura pública **solo** de las filas con `publicada = true` (RLS). Solo Administrador y Editor crean, editan, publican y eliminan (panel → *Entitats*). El logo se sube al bucket `portades`.
- `sollicituds_entitats`: las solicitudes del antiguo formulario «La teva entitat vol adherir-s'hi?». **Formulario retirado (octubre 2026)**: las entitats solo se añaden desde la app. La tabla y sus datos se conservan por si se recupera, pero nadie puede insertar desde la web (sin permiso de inserción y con la política restrictiva `sol_tancades`). Si ya tenías la base de datos en marcha, ejecuta `supabase/sollicituds-tancades.sql` (no borra nada y se puede ejecutar varias veces). Las que ya hay solo las ven Administrador y Editor en *Table Editor*.

- `eines`: los visores de `/recursos.html#eines` (nombre, organismo, descripción, URL `https://`, categoría, orden y publicada). Lectura pública **solo** de las publicadas; solo Administrador y Editor crean, editan, ordenan, publican y eliminan (panel → *Eines*).

**Si ya tienes la base de datos en marcha**, en lugar de volver a ejecutar `schema.sql` entero puedes ejecutar solo `supabase/entitats-i-eines.sql`: crea o completa Entitats, la tabla (cerrada) de solicitudes de adhesión y Eines (tablas, permisos, políticas RLS y validaciones), corrige las validaciones de web, correo y URL, y añade el contenido inicial publicado (OBERCat, Xarxa Catalana per a una Transició Energètica Justa y Vissir) si no existe. Se puede ejecutar varias veces sin errores ni duplicados. Los logos de esas dos entidades apuntan provisionalmente a sus webs: para sustituirlos, súbelos desde el panel (*Entitats → Edita → Canvia el logo*).

**Formulario de contacto: retirado (octubre 2026).** La página Contacte ya no tiene formulario ni la zona privada la sección de mensajes. La tabla `missatges_contacte` (si la creaste con `supabase/contacte.sql`) se conserva con lo que haya; se puede consultar en *Table Editor* y, cuando ya no haga falta, vaciarla o eliminarla a mano.

Mientras no ejecutes el esquema nuevo, `/recursos.html#entitats` muestra «Aviat hi trobareu les entitats adherides».

## Todo lo pendiente en un solo SQL (octubre 2026)

Si tu base de datos tiene `schema.sql` y `entitats-i-eines.sql` pero **ninguno de los SQL posteriores**, ejecuta solo **`supabase/pendent-complet.sql`**. Contiene, en orden, `sollicituds-tancades.sql`, `app.sql` (tabla `actes`) y `web-i-app.sql`. Se puede ejecutar varias veces, no borra datos y no sobrescribe lo editado. Si ejecutas `web-i-app.sql` sin `app.sql` antes, da `ERROR 42P01: relation "public.actes" does not exist`.

## Web por secciones (octubre 2026)

Ejecuta **`supabase/web-i-app.sql`** en *SQL Editor* (después de los demás SQL: también fija los permisos de la app por rol) (se puede ejecutar varias veces; no borra nada ni sobrescribe lo que se haya editado). Añade:

- `publicacions`: columnas `seccio` (`defensem` · `renovables`), `mitja`, `font_url` (https, obligatoria para publicar una de renovables), `data` y `projecte` (`la-tallada` · `albons`). La vista pública `publicacions_publiques` las incluye.
- `projectes`: las dos páginas de proyecto (descripción, mapa, enlace al mapa, situación actual, publicada). Se crean con el texto que ya había en *Qui som → El projecte*.
- `informacio` + bucket público `informacio` (solo PDF, 20 MB): los documentos de `/documents.html` (título, categoría, fecha, tamaño, proyecto relacionado). Se añade el folleto del molino de Albons que ya estaba en `/docs`.
- `pagines`: los textos de *Qui som* y el lema del pie, editables desde la app. Se crean con el texto actual.

Mientras no lo ejecutes, las páginas nuevas muestran la tarjeta «Pròximament» y la web sigue funcionando.

## App de la zona privada (`/app`, octubre 2026)

La zona privada también es una app instalable (PWA) en `https://MI-DOMINIO/app`: inicio con bloques según el rol (Notícies, Agenda, Projectes, Informació, Entitats, Eines, Pàgines, Usuaris —solo admin—, Documents y El meu perfil), listas por estado (y en Notícies, filtro Totes · Defensem · Renovables), formularios con fotos de la cámara o la galería (se reducen a 1600 px antes de subirlas) y borrador automático en el dispositivo. Usa la misma sesión y las mismas reglas (RLS) que `/area-privada/`, que sigue funcionando (Documents se abre ahí).

Todo el contenido de la web se gestiona desde aquí. **Notícies**: el primer campo, «On es publica?», decide los campos (Defensem: título, fecha, imagen, resumen y texto completo; renovables: título, medio, fecha, resumen propio y URL de la fuente); «Projecte relacionat» la muestra también en la página del proyecto. **Informació** sube PDF (máx. 20 MB) con categoría y proyecto. **Pàgines** cambia los textos de Qui som y el lema del pie. Los bloques vacíos dicen «Encara no hi ha res. Toca + Nou… per començar».

Para la **Agenda** hay que ejecutar `supabase/app.sql` (crea la tabla `actes` y copia en ella los tres actos que había en la web; se puede repetir). Mientras no exista la tabla, la web sigue mostrando la agenda escrita en el HTML.

## Roles

| Rol | Puede |
|---|---|
| Administrador | Todo: usuarios y roles, activar/desactivar cuentas, publicar, archivar, eliminar, documentos y permisos. No puede quitarse a sí mismo el rol de admin ni desactivarse, y nunca puede quedar el sistema sin un admin activo. |
| Editor | Todo el contenido de la web: publicaciones (también eliminarlas), agenda, proyectos, documentos PDF (Informació), entitats, eines y textos de las páginas. No gestiona usuarios ni los documentos internos. Ve el nombre de los autores, no su correo. |
| Col·laborador de notícies | Crear borradores propios y enviarlos a revisión. Solo edita sus textos en estado «Esborrany» o «Retornat». No puede publicar. |
| Usuari de consulta | Ver todo el contenido de la app (también lo que aún no es público), sin poder cambiar nada, y los documentos internos a los que el admin le dé acceso. |

Una cuenta desactivada no puede ver ni hacer nada, pero sus publicaciones se conservan.

## Pruebas automáticas

```bash
# Base de datos (Postgres real en memoria, sin Supabase): 202 comprobaciones
npm i --no-save @electric-sql/pglite
node supabase/prova-permisos.mjs

# Función de invitación (fetch simulado)
node proves/prova-convidar.mjs

# Web en un navegador real (Chromium), con un Supabase simulado
npm i --no-save playwright && npx playwright install chromium
node proves/prova-web.mjs
```

## Cambio respecto al esquema original

Se ha añadido **una** política (`portades_select`) en `storage.objects`: cada persona solo ve los archivos de su carpeta, y el admin todos. Sin ella, Postgres (y la API de Storage, que pide permiso *select + delete*) no deja borrar ni sustituir ninguna portada, ni siquiera al admin: los borrados fallaban sin dar error y dejaban archivos huérfanos. La lectura pública de las imágenes no cambia: se hace por la URL pública del bucket. Todas las pruebas se han vuelto a pasar con el cambio.
