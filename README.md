# Polarion AI Assistant

Independent Eclipse PDE/OSGi extension for Polarion. The installed local SDK exposes the `com.polarion.portal.tomcat.webapps` extension used here to serve static assets and an authenticated servlet. No project/work-item page content is collected or sent automatically.

## Environment verified

- Polarion SDK API bundle version: `3.25.6` (SDK `changes.txt`); installed Tomcat bundle: `9.0.84.202505302230`.
- Polarion launcher uses `C:\Program Files\Java\jdk-17\bin\java.exe`; use Java 17 for this bundle.
- The installed Polarion 3.25.6 `portal.tomcat` bundle does not provide `DoAsFilter` to extension webapps, although some shipped descriptors still reference it. This app omits that unavailable filter and protects its `/api/*` endpoint with the Polarion `user` role; the endpoint does not access Polarion APIs or data.
- The SDK does not document a global-header action extension. Siemens' documented HTML snippet injector is `scriptInjection.mainHead` (also `com.siemens.polarion.scriptInjection.mainHead` in `polarion.properties`). The AI button is fixed to the top ribbon with a 12vw right offset, placing it roughly 10–15% in from the right edge. Polarion does not expose a stable global-header action API, so ribbon height may vary by theme.

## Import and build

1. In Eclipse, choose **File > Import > Existing Projects into Workspace**.
2. Select `C:\Corbinsoft\eclipse-workspace\exercise`, choose `com.zaamtech.polarion.aiassistant`, and finish.
3. In PDE **Preferences > Plug-in Development > Target Platform**, create/select a target from the installed Polarion bundles under `C:\Polarion\polarion\plugins` (the SDK at `C:\Polarion\polarion\SDK` supplies docs/examples). Confirm `com.polarion.portal.tomcat` resolves; JavaSE-17 is required.
4. Add the JDK 17 `bin` folder to `PATH` (and set `POLARION_HOME` if Polarion is not in `C:\Polarion`), then run `powershell -ExecutionPolicy Bypass -File .\build.ps1`. It compiles against the installed Servlet API and creates `dist\com.zaamtech.polarion.aiassistant_1.0.0.jar`. PDE **Export > Deployable plug-ins and fragments** is also available after configuring the target platform. Do not copy the source project into the server.

## Deploy

1. Back up the Polarion configuration and stop the local instance during plugin installation.
2. Create `C:\Polarion\polarion\extensions\zaamtech-ai\eclipse\plugins\` and copy `com.zaamtech.polarion.aiassistant_1.0.0.jar` there. The installed `extensions\README.txt` specifies this nested extension layout.
3. Remove `C:\Polarion\data\workspace\.config` while the server is stopped so OSGi rediscovers the extension, then start Polarion. Check startup logs for bundle resolution errors.
4. In **Global Administration > System > Configuration Properties**, set `scriptInjection.mainHead` to the one-line value from `config/scriptInjection.mainHead.html`. This is an administrator-managed configuration change. It injects only a same-origin script reference; the script and UI assets are served by this bundle.
5. Apply/reload the configuration and restart Polarion only if that Polarion version's configuration UI requests it. The `polarion.properties` alternative is `com.siemens.polarion.scriptInjection.mainHead=<script src="/polarion/aiassistant/assets/assistant.js" defer></script>`; back up the file before editing. Neither setting is changed by this project.
6. Browse to Polarion and reload. The **AI** button should appear on the top ribbon about 12% in from the right edge. Click it, send a prompt, use **New chat**, close and reopen. Prompt `mock error` to exercise Retry.

## Provider configuration

Default server property `zaamtech.ai.mock=true` yields an explicitly labelled development response and uses no key. To enable a real OpenAI-compatible chat-completions endpoint, set server JVM properties:

```
-Dzaamtech.ai.mock=false
-Dzaamtech.ai.endpoint=https://YOUR-SERVICE/v1/chat/completions
-Dzaamtech.ai.model=YOUR_MODEL_ID
-Dzaamtech.ai.timeoutSeconds=45
```

If the service requires a bearer key, place it in the Polarion service environment as `ZAAMTECH_AI_API_KEY`; never place it in Polarion page configuration or this project. Restart Polarion after changing JVM properties/environment. The endpoint is administrator-trusted configuration. A real reply requires an OpenAI-compatible response containing `choices[0].message.content`.

## Rollback

Remove the injected `scriptInjection.mainHead` property (or restore the backed-up prior value), then stop Polarion and remove the `extensions\zaamtech-ai` directory. Delete `data\workspace\.config` and restart so OSGi drops the bundle. Confirm normal Polarion pages load. This does not touch the example servlet, `PolarionAI`, or Polarion product JAR/WAR files.

## Limits and follow-on work

This is a first UI/backend milestone; it does not query Polarion data. The chat panel opens at 25% of viewport width and can be resized by dragging its left edge up to a 50% maximum. It is inset from the viewport edges. Its top offset is 56px; adjust it in `webapp/assets/assistant.css` if a Polarion theme uses a different ribbon height. Provider adapter currently supports a simple OpenAI-compatible chat-completions shape and sends only the user's message. Add authorized REST API/MCP context by explicit opt-in, verify each operation under the logged-in user's permissions, and require confirmation for any data-changing action.

## Validation status

The source has not been installed into or exercised against the running Polarion server. The Arctic AI addition is validated locally with the build and checks recorded below. Validate PDE bundle resolution and the actual global injector/header markup during a controlled deployment.

## Startup log diagnosis

- `Local log4j configuration ... was not found` is followed by `log4j has been configured from ...`; Polarion found its bundled logging configuration and continued startup.
- `Exception starting filter [DoAsFilter]` is a real failure for this webapp. In the installed Polarion 3.25.6 setup, that class is not available to the extension webapp through its declared bundles. This assistant does not use Polarion APIs or data, so `web.xml` omits that filter and keeps `/api/*` restricted to the Polarion `user` role.
- `Cannot run program "wmic"` affects Polarion's chart, formula, and notification helper processes on this Windows host. It is separate from the assistant webapp failure; the Polarion log shown still reports overall startup complete. If those features are needed, resolve the missing Windows `wmic` dependency according to the server's Windows image and Polarion deployment policy.

After rebuilding, install the updated JAR following **Deploy** and restart Polarion during an approved maintenance window. The source change alone does not update an already running or previously deployed bundle.

## Arctic AI Global Administration

This build adds an **Arctic AI** parent group with a **Settings** page beneath it in Polarion Global Administration. It uses the installed 3.25.6 `com.polarion.xray.webui.administrationPageExtenders` contribution with repository/global scope and links to the plugin's protected `/polarion/aiassistant/admin` page. The page and `/api/admin/*` endpoints require the Polarion `admin` web role; the assistant API requires an authenticated `user` or `admin` session. This implementation deliberately does not add `DoAsFilter`, which failed to load in the supplied Polarion 3.25.6 startup log.

### Settings and authorization

General Settings includes the separate **Show AI Button in Polarion Header** option. It defaults to enabled, persists in the global configuration, and is applied by frontend configuration refresh without reinstalling the plugin. It controls button visibility only; chat requests continue to require server-side authentication, global enablement, and the saved access policy.

Settings are stored persistently in Polarion's repository configuration service, in the non-inheritable global configuration `com.zaamtech.polarion.aiassistant.arctic` (versioned properties, version `1`). The service contribution uses Polarion's `PropertiesDataHandler`. Admin API responses never include credential values. Existing JVM defaults `zaamtech.ai.mock`, `zaamtech.ai.endpoint`, `zaamtech.ai.model`, and `zaamtech.ai.timeoutSeconds` are used until settings are saved; the bearer key remains in server environment variable `ZAAMTECH_AI_API_KEY`.

In **Access Control**, administrators may select all authenticated users or selected Polarion global roles. Selected roles use **OR** behavior: membership in any selected global role permits use. The logged-in user's roles are queried from Polarion's `ISecurityService` on the server for chat requests. Global Administrators have a recovery bypass when the assistant is enabled; disabling the assistant blocks everyone, including administrators, from chat. Project administrators do not receive global administration rights by virtue of project roles.

The installed documented security API exposes global roles and a user's role assignments, but the documented `IUserGroup` API does not expose group membership. Therefore this version does not offer group or individual-user pickers. It does not fabricate group membership or alter Polarion core permission files. Any Polarion resource operations added later must independently check the current user's native Polarion permissions.

### Administration and use

1. Build with Java 17 using `powershell -ExecutionPolicy Bypass -File .\build.ps1` (set `POLARION_HOME` if needed). The script checks the installed Servlet, Polarion platform, repository, tracker, subterra, and portal-tomcat bundles, compiles against the APIs used by the implementation, runs the local settings/access checks, and packages the bundle. It does not deploy the JAR.
2. For a controlled installation, stop Polarion and copy the generated JAR into the existing Polarion extension plug-in directory described under **Deploy**. Do not copy it into the product's `plugins` directory. The new `META-INF/hivemodule.xml` is inside the JAR and registers the administration extender and config data handler.
3. Clear the OSGi extension discovery cache as documented under **Deploy**, restart Polarion, and verify there are no bundle/hivemodule errors in the server log.
4. Open **Global Administration > Arctic AI**. Only Global Administrators can open the page. Configure general settings, role access, appearance, and provider settings; save. `scriptInjection.mainHead` remains necessary for injecting the existing AI header/chat script. Use the same-origin script snippet documented under **Deploy**; it is separate from the administration extender and is not changed by this project.
5. The button renders from safe defaults immediately, then applies `/api/config` when available; configuration refreshes apply administrator changes on open pages. A successful configuration response hides the button when it is disabled, hidden, or the current user is unauthorized. Every chat POST independently re-loads configuration and enforces authentication, global enabled state, and the saved role policy on the server. Chat input is limited to 12,000 characters and request bodies to 16 KB. The plugin does not read page content automatically.

Appearance settings include System/Light/Dark, validated accent color, initial width (360–600 px, clamped to half the viewport), and right-side or branding-based header placement. Branding placement uses theme-sensitive DOM detection and falls back to a fixed right-side position when the logo cannot be identified. A user's drag resize remains temporary and capped at half the viewport.

### Build validation and limits

Validated locally on the installed Polarion 3.25.6 API and JDK 17:

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build.ps1` — compiled the plugin, ran `AssistantSettingsTest` successfully, and created `dist\com.zaamtech.polarion.aiassistant_1.0.0.jar`.
- `node --check` on `assistant.js` — passed.
- Parsed `web.xml` and `src/META-INF/hivemodule.xml` as XML — passed.
- Inspected the built JAR and confirmed it contains the hivemodule registration, admin servlet, admin page, and assistant script.

No browser-based Polarion integration test or live-server deployment was performed. In particular, confirm the extender is visible in the exact deployed Global Administration navigation and verify theme-specific header placement after installation. Group-based rules are unsupported with the installed documented APIs as explained above.

### Rollback

Restore/remove the injected `scriptInjection.mainHead` property if it was added, stop Polarion, remove only this extension JAR from the extension directory, clear the OSGi extension discovery cache, and restart. This build does not modify the live server or global configuration. The saved Arctic AI repository configuration is inert after the extension is removed and can be removed through the Polarion repository configuration administration mechanism if desired.
