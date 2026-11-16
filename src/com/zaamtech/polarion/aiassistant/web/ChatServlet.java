package com.zaamtech.polarion.aiassistant.web;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import com.zaamtech.polarion.aiassistant.config.AssistantSettings;
import com.zaamtech.polarion.aiassistant.config.SettingsStore;
import com.zaamtech.polarion.aiassistant.security.PolarionSecurity;

/** Authenticated same-origin chat and public-to-authorized-users display configuration APIs. */
public final class ChatServlet extends HttpServlet {
    private static final long serialVersionUID = 1L;
    private static final int MAX_BODY = 16_384;
    private static final String JSON_STRING = "\\\"((?:\\\\.|[^\\\"\\\\])*)\\\"";

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {
        response.setHeader("Cache-Control", "no-store");
        if (request.getUserPrincipal() == null) {
            JsonResponse.error(response, HttpServletResponse.SC_UNAUTHORIZED, "Authentication is required.");
            return;
        }
        AssistantSettings settings;
        try {
            settings = SettingsStore.load();
        } catch (RuntimeException e) {
            JsonResponse.error(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE,
                    "Assistant configuration is unavailable.");
            return;
        }
        boolean visible = settings.isEnabled() && settings.isShowHeaderButton()
                && PolarionSecurity.canUseAssistant(request, settings);

        JsonResponse.begin(response);
        response.getWriter().write("{");
        write(response, "visible", Boolean.toString(visible), false);
        if (!visible) {
            response.getWriter().write("}");
            return;
        }
        write(response, "enabled", Boolean.toString(settings.isEnabled()), true);
        write(response, "showHeaderButton", Boolean.toString(settings.isShowHeaderButton()), true);
        write(response, "mode", JsonResponse.quote(AiProvider.mode(settings)), true);
        write(response, "name", JsonResponse.quote(settings.getName()), true);
        write(response, "theme", JsonResponse.quote(settings.getTheme()), true);
        write(response, "accentColor", JsonResponse.quote(settings.getAccentColor()), true);
        write(response, "sidebarWidth", Integer.toString(settings.getSidebarWidth()), true);
        write(response, "headerPlacement", JsonResponse.quote(settings.getHeaderPlacement()), true);
        response.getWriter().write("}");
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws IOException {
        AssistantSettings settings = authorize(request, response);
        if (settings == null) return;
        request.setCharacterEncoding("UTF-8");
        JsonResponse.begin(response);
        if (request.getContentType() == null
                || !request.getContentType().toLowerCase().startsWith("application/json")) {
            JsonResponse.error(response, HttpServletResponse.SC_UNSUPPORTED_MEDIA_TYPE, "Send a JSON request.");
            return;
        }

        byte[] body = request.getInputStream().readNBytes(MAX_BODY + 1);
        if (body.length > MAX_BODY) {
            JsonResponse.error(response, HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE,
                    "Request exceeds 16 KB.");
            return;
        }
        String message = jsonField(new String(body, StandardCharsets.UTF_8), "message");
        if (message == null || message.isBlank() || message.length() > 12_000) {
            JsonResponse.error(response, HttpServletResponse.SC_BAD_REQUEST,
                    "Enter a message of up to 12,000 characters.");
            return;
        }

        try {
            String reply = AiProvider.complete(settings, message);
            response.getWriter().write("{\"mode\":" + JsonResponse.quote(AiProvider.mode(settings))
                    + ",\"reply\":" + JsonResponse.quote(reply) + "}");
        } catch (AiProvider.ProviderException e) {
            JsonResponse.error(response, HttpServletResponse.SC_BAD_GATEWAY, e.getMessage());
        }
    }

    private static AssistantSettings authorize(
            HttpServletRequest request,
            HttpServletResponse response) throws IOException {
        response.setHeader("Cache-Control", "no-store");
        if (request.getUserPrincipal() == null) {
            JsonResponse.error(response, HttpServletResponse.SC_UNAUTHORIZED, "Authentication is required.");
            return null;
        }

        AssistantSettings settings;
        try {
            settings = SettingsStore.load();
        } catch (RuntimeException e) {
            JsonResponse.error(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE,
                    "Assistant configuration is unavailable.");
            return null;
        }
        if (!settings.isEnabled() || !PolarionSecurity.canUseAssistant(request, settings)) {
            JsonResponse.error(response, HttpServletResponse.SC_FORBIDDEN,
                    "You are not authorized to use the AI Assistant.");
            return null;
        }
        return settings;
    }

    private static String jsonField(String json, String name) {
        Matcher matcher = Pattern.compile("\\\"" + Pattern.quote(name)
                + "\\\"\\s*:\\s*" + JSON_STRING).matcher(json);
        return matcher.find() ? unescape(matcher.group(1)) : null;
    }

    private static String unescape(String value) {
        return value.replace("\\n", "\n")
                .replace("\\r", "\r")
                .replace("\\t", "\t")
                .replace("\\\"", "\"")
                .replace("\\\\", "\\");
    }

    private static void write(HttpServletResponse response, String name, String value, boolean comma)
            throws IOException {
        if (comma) response.getWriter().write(",");
        response.getWriter().write(JsonResponse.quote(name) + ":" + value);
    }
}
