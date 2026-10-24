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

## Entitats y formulario de adhesión (octubre 2026)

`schema.sql` añade dos tablas. **Vuelve a ejecutar `schema.sql` entero** en *SQL Editor* (es idempotente) para crearlas:

- `entitats`: el índice público de `/entitats.html`. Lectura pública **solo** de las filas con `publicada = true` (RLS). Solo Administrador y Editor crean, editan y publican (panel → *Entitats*); solo Administrador elimina. El logo se sube al bucket `portades`.
- `sollicituds_entitats`: el formulario «La teva entitat vol adherir-s'hi?». Cualquiera puede insertar (sin poder leer nada); solo Administrador y Editor las ven y cambian su estado (panel → *Sol·licituds d'adhesió*), y desde ahí se puede crear la entidad con los datos ya rellenados. Antispam: casilla de consentimiento obligatoria, campo trampa y tiempo mínimo en el navegador, y en la base de datos un máximo de 3 solicitudes por correo y día y de 20 por hora en total.

Mientras no ejecutes el esquema nuevo, `/entitats.html` muestra «Aviat hi trobareu les entitats adherides» y el formulario devuelve un error al enviar.

## Roles

| Rol | Puede |
|---|---|
| Administrador | Todo (también eliminar entitats y sol·licituds d'adhesió): usuarios y roles, activar/desactivar cuentas, publicar, archivar, eliminar, documentos y permisos. No puede quitarse a sí mismo el rol de admin ni desactivarse, y nunca puede quedar el sistema sin un admin activo. |
| Editor | Ver todas las publicaciones, editarlas, publicarlas, devolverlas con nota y archivarlas. Crear, editar, publicar y despublicar **entitats** y gestionar las **sol·licituds d'adhesió** (no las elimina). No elimina ni gestiona usuarios ni documentos. Ve el nombre de los autores, no su correo. |
| Col·laborador de notícies | Crear borradores propios y enviarlos a revisión. Solo edita sus textos en estado «Esborrany» o «Retornat». No puede publicar. |
| Usuari de consulta | Ver los documentos internos a los que el admin le dé acceso. |

Una cuenta desactivada no puede ver ni hacer nada, pero sus publicaciones se conservan.

## Pruebas automáticas

```bash
# Base de datos (Postgres real en memoria, sin Supabase): 184 comprobaciones
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
