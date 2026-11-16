package com.zaamtech.polarion.aiassistant.web;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.logging.Level;
import java.util.logging.Logger;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;
import com.zaamtech.polarion.aiassistant.config.AssistantSettings;
import com.zaamtech.polarion.aiassistant.config.SettingsStore;
import com.zaamtech.polarion.aiassistant.security.PolarionSecurity;

/** Polarion Global Administration page and admin-only settings endpoints. */
public final class AdminServlet extends HttpServlet {
    private static final long serialVersionUID = 1L;
    private static final Logger LOG = Logger.getLogger(AdminServlet.class.getName());
    private static final int MAX_FORM_BYTES = 16_384;
    private static final String CSRF_SESSION_KEY = AdminServlet.class.getName() + ".csrf";
    private static final SecureRandom RANDOM = new SecureRandom();

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws IOException, ServletException {
        if (!authorizeAdmin(request, response)) return;

        String servletPath = request.getServletPath();
        if (servletPath != null && servletPath.startsWith("/admin")) {
            renderPage(request, response);
            return;
        }
        if ("/settings".equals(request.getPathInfo())) {
            writeSettings(response);
            return;
        }
        JsonResponse.error(response, HttpServletResponse.SC_NOT_FOUND, "Not found.");
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        if (!authorizeAdmin(request, response)) return;
        if (!validCsrf(request)) {
            JsonResponse.error(response, HttpServletResponse.SC_FORBIDDEN, "The request token is invalid. Reload the administration page and try again.");
            return;
        }

        Map<String, List<String>> form;
        try {
            form = readForm(request);
        } catch (IllegalArgumentException e) {
            JsonResponse.error(response, HttpServletResponse.SC_BAD_REQUEST, e.getMessage());
            return;
        }

        String action = request.getPathInfo();
        if ("/settings".equals(action)) {
            saveSettings(form, response);
        } else if ("/restore".equals(action)) {
            restoreDefaults(response);
        } else if ("/test".equals(action)) {
            testProvider(form, response);
        } else {
            JsonResponse.error(response, HttpServletResponse.SC_NOT_FOUND, "Not found.");
        }
    }

    private boolean authorizeAdmin(HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        response.setHeader("Cache-Control", "no-store");
        if (request.getUserPrincipal() == null) {
            JsonResponse.error(response, HttpServletResponse.SC_UNAUTHORIZED, "Authentication is required.");
            return false;
        }
        if (!PolarionSecurity.isGlobalAdministrator(request)) {
            JsonResponse.error(response, HttpServletResponse.SC_FORBIDDEN, "Global Administrator permission is required.");
            return false;
        }
        return true;
    }

    private void renderPage(HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        HttpSession session = request.getSession(true);
        String token = (String) session.getAttribute(CSRF_SESSION_KEY);
        if (token == null) {
            byte[] bytes = new byte[32];
            RANDOM.nextBytes(bytes);
            token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            session.setAttribute(CSRF_SESSION_KEY, token);
        }

        try (InputStream input = getServletContext().getResourceAsStream("/WEB-INF/admin.html")) {
            if (input == null) {
                response.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
                return;
            }
            String page = new String(input.readAllBytes(), StandardCharsets.UTF_8)
                    .replace("{{CSRF_TOKEN}}", html(token));
            response.setContentType("text/html;charset=UTF-8");
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader("X-Frame-Options", "SAMEORIGIN");
            response.setHeader("Content-Security-Policy",
                    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
            response.getWriter().write(page);
        }
    }

    private static void writeSettings(HttpServletResponse response) throws IOException {
        AssistantSettings settings;
        try {
            settings = SettingsStore.load();
        } catch (RuntimeException e) {
            LOG.log(Level.SEVERE, "Unable to load Arctic AI settings", e);
            JsonResponse.error(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE,
                    storageFailure("read", e));
            return;
        }

        List<String> roles = List.of();
        boolean rolesAvailable = true;
        String rolesError = null;
        try {
            roles = PolarionSecurity.globalRoles();
            if (roles.isEmpty() || !roles.containsAll(settings.getAccessRoles())) {
                rolesAvailable = false;
                rolesError = "Polarion's global role service returned no usable roles or omitted a saved role. The saved access policy is preserved and locked.";
                roles = settings.getAccessRoles();
            }
        } catch (RuntimeException e) {
            rolesAvailable = false;
            rolesError = "Polarion's global role service is unavailable. The saved access policy is preserved and locked.";
            roles = settings.getAccessRoles();
            LOG.log(Level.WARNING, "Polarion settings loaded, but global role lookup failed", e);
        }

        JsonResponse.begin(response);
        response.getWriter().write("{");
        property(response, "enabled", Boolean.toString(settings.isEnabled()), false);
        property(response, "showHeaderButton", Boolean.toString(settings.isShowHeaderButton()), true);
        property(response, "name", JsonResponse.quote(settings.getName()), true);
        property(response, "accessMode", JsonResponse.quote(settings.getAccessMode()), true);
        property(response, "accessRoles", JsonResponse.strings(settings.getAccessRoles()), true);
        property(response, "globalRoles", JsonResponse.strings(roles), true);
        property(response, "globalRolesAvailable", Boolean.toString(rolesAvailable), true);
        property(response, "globalRolesError", rolesAvailable ? "null" : JsonResponse.quote(rolesError), true);
        property(response, "theme", JsonResponse.quote(settings.getTheme()), true);
        property(response, "accentColor", JsonResponse.quote(settings.getAccentColor()), true);
        property(response, "sidebarWidth", Integer.toString(settings.getSidebarWidth()), true);
        property(response, "headerPlacement", JsonResponse.quote(settings.getHeaderPlacement()), true);
        property(response, "mockMode", Boolean.toString(settings.isMockMode()), true);
        property(response, "endpoint", JsonResponse.quote(settings.getEndpoint()), true);
        property(response, "model", JsonResponse.quote(settings.getModel()), true);
        property(response, "timeoutSeconds", Integer.toString(settings.getTimeoutSeconds()), true);
        property(response, "apiKeyConfigured",
                Boolean.toString(System.getenv("ZAAMTECH_AI_API_KEY") != null
                        && !System.getenv("ZAAMTECH_AI_API_KEY").isBlank()), true);
        response.getWriter().write("}");
    }

    private static void property(HttpServletResponse response, String name, String value, boolean comma)
            throws IOException {
        if (comma) response.getWriter().write(",");
        response.getWriter().write(JsonResponse.quote(name));
        response.getWriter().write(":");
        response.getWriter().write(value);
    }

    private static void saveSettings(Map<String, List<String>> form, HttpServletResponse response)
            throws IOException {
        try {
            AssistantSettings current = SettingsStore.load();
            List<String> availableRoles = availableRolesForForm(form, current);
            AssistantSettings settings = settingsFromForm(form, availableRoles);
            SettingsStore.save(settings);
            JsonResponse.begin(response);
            response.getWriter().write("{\"ok\":true,\"message\":\"Arctic AI settings saved.\"}");
        } catch (IllegalArgumentException e) {
            JsonResponse.error(response, HttpServletResponse.SC_BAD_REQUEST, e.getMessage());
        } catch (RuntimeException e) {
            LOG.log(Level.SEVERE, "Unable to save Arctic AI settings", e);
            JsonResponse.error(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE,
                    storageFailure("save", e));
        }
    }

    private static void restoreDefaults(HttpServletResponse response) throws IOException {
        try {
            SettingsStore.save(AssistantSettings.defaults());
            JsonResponse.begin(response);
            response.getWriter().write("{\"ok\":true,\"message\":\"Default settings restored.\"}");
        } catch (RuntimeException e) {
            LOG.log(Level.SEVERE, "Unable to restore Arctic AI defaults", e);
            JsonResponse.error(response, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "Defaults could not be saved.");
        }
    }

    private static void testProvider(Map<String, List<String>> form, HttpServletResponse response)
            throws IOException {
        try {
            AssistantSettings current = SettingsStore.load();
            AssistantSettings settings = settingsFromForm(form, availableRolesForForm(form, current));
            String message = AiProvider.testConnection(settings);
            JsonResponse.begin(response);
            response.getWriter().write("{\"ok\":true,\"message\":" + JsonResponse.quote(message) + "}");
        } catch (IllegalArgumentException e) {
            JsonResponse.error(response, HttpServletResponse.SC_BAD_REQUEST, e.getMessage());
        } catch (AiProvider.ProviderException e) {
            JsonResponse.begin(response);
            response.setStatus(HttpServletResponse.SC_BAD_GATEWAY);
            response.getWriter().write("{\"ok\":false,\"message\":" + JsonResponse.quote(e.getMessage()) + "}");
        } catch (RuntimeException e) {
            LOG.log(Level.WARNING, "Provider test could not be prepared", e);
            JsonResponse.error(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE,
                    "Settings storage or provider configuration is unavailable. No provider request was made.");
        }
    }

    /** Keeps non-access settings editable during a role-service outage without widening access. */
    private static List<String> availableRolesForForm(
            Map<String, List<String>> form,
            AssistantSettings current) {
        try {
            List<String> roles = PolarionSecurity.globalRoles();
            if (current.getAccessRoles().isEmpty() || roles.containsAll(current.getAccessRoles())) {
                return roles;
            }
        } catch (RuntimeException e) {
            LOG.log(Level.WARNING, "Global roles unavailable while saving settings", e);
        }

        List<String> requestedRoles = form.getOrDefault("accessRoles", List.of());
        if (!current.getAccessMode().equals(single(form, "accessMode"))
                || !new LinkedHashSet<>(current.getAccessRoles()).equals(new LinkedHashSet<>(requestedRoles))) {
            throw new IllegalArgumentException(
                    "Polarion's role service is unavailable. Access policy changes were rejected; the saved policy is unchanged.");
        }
        return current.getAccessRoles();
    }

    private static AssistantSettings settingsFromForm(
            Map<String, List<String>> form,
            Collection<String> availableRoles) {
        return AssistantSettings.fromForm(
                "true".equals(single(form, "enabled")),
                !"false".equals(single(form, "showHeaderButton")),
                single(form, "name"),
                single(form, "accessMode"),
                form.getOrDefault("accessRoles", List.of()),
                single(form, "theme"),
                single(form, "accentColor"),
                single(form, "sidebarWidth"),
                single(form, "headerPlacement"),
                "true".equals(single(form, "mockMode")),
                single(form, "endpoint"),
                single(form, "model"),
                single(form, "timeoutSeconds"),
                availableRoles);
    }

    private boolean validCsrf(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) return false;
        String expected = (String) session.getAttribute(CSRF_SESSION_KEY);
        String received = request.getHeader("X-CSRF-Token");
        if (expected == null || received == null) return false;
        return java.security.MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                received.getBytes(StandardCharsets.UTF_8));
    }

    private static Map<String, List<String>> readForm(HttpServletRequest request) throws IOException {
        String type = request.getContentType();
        if (type == null || !type.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
            throw new IllegalArgumentException("Submit settings as a form.");
        }
        int contentLength = request.getContentLength();
        if (contentLength > MAX_FORM_BYTES) {
            throw new IllegalArgumentException("Settings request is too large.");
        }

        Map<String, List<String>> values = new LinkedHashMap<>();
        request.setCharacterEncoding(StandardCharsets.UTF_8.name());
        Map<String, String[]> parameters = request.getParameterMap();
        int approximateEncodedSize = 0;
        int parameterCount = 0;
        for (Map.Entry<String, String[]> entry : parameters.entrySet()) {
            String key = entry.getKey();
            if (key == null || key.length() > 64) {
                throw new IllegalArgumentException("A settings field name is invalid or too long.");
            }
            String[] submitted = entry.getValue();
            if (submitted == null) continue;
            for (String value : submitted) {
                parameterCount++;
                if (parameterCount > 64) {
                    throw new IllegalArgumentException("Too many settings fields were submitted.");
                }
                String fieldValue = value == null ? "" : value;
                if (fieldValue.length() > 2048) {
                    throw new IllegalArgumentException("A settings field is too long.");
                }
                approximateEncodedSize += URLEncoder.encode(key, StandardCharsets.UTF_8).length()
                        + URLEncoder.encode(fieldValue, StandardCharsets.UTF_8).length() + 2;
                if (approximateEncodedSize > MAX_FORM_BYTES) {
                    throw new IllegalArgumentException("Settings request is too large.");
                }
                values.computeIfAbsent(key, ignored -> new ArrayList<>()).add(fieldValue);
            }
        }
        return values;
    }

    private static String single(Map<String, List<String>> form, String name) {
        List<String> values = form.get(name);
        if (values == null || values.isEmpty()) return "";
        if (values.size() != 1) {
            throw new IllegalArgumentException("A settings field was submitted more than once.");
        }
        return values.get(0);
    }

    private static String html(String value) {
        return value.replace("&", "&amp;")
                .replace("\"", "&quot;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }

    /** Returns a concise cause to administrators without returning a stack trace. */
    private static String storageFailure(String operation, RuntimeException error) {
        Throwable cause = error;
        while (cause.getCause() != null && cause.getCause() != cause) {
            cause = cause.getCause();
        }
        String detail = cause.getMessage();
        if (detail == null || detail.isBlank()) {
            detail = cause.getClass().getSimpleName();
        } else {
            detail = detail.replaceAll("[\\r\\n\\p{Cntrl}]", " ").trim();
        }
        if (detail.length() > 240) {
            detail = detail.substring(0, 240);
        }
        return "Arctic AI settings " + operation + " failed: " + detail;
    }
}
