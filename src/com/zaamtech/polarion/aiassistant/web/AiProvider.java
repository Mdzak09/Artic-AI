package com.zaamtech.polarion.aiassistant.web;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import com.zaamtech.polarion.aiassistant.config.AssistantSettings;

/** Server-side OpenAI-compatible provider adapter. API keys never leave the server. */
final class AiProvider {
    private static final String JSON_STRING = "\\\"((?:\\\\.|[^\\\"\\\\])*)\\\"";

    private AiProvider() { }

    static String mode(AssistantSettings settings) {
        if (settings.isMockMode()) return "mock";
        if (settings.getEndpoint().isBlank() || settings.getModel().isBlank()) return "unconfigured";
        return "configured";
    }

    static String complete(AssistantSettings settings, String prompt) throws ProviderException {
        if (settings.isMockMode()) {
            if (prompt.toLowerCase().contains("mock error")) {
                throw new ProviderException("The development mock was asked to fail.");
            }
            return "**Development mock response**\n\nYour message reached the Polarion AI Assistant backend. The real AI provider is not configured.\n\nYou asked: \""
                    + prompt
                    + "\"\n\nConfigure the endpoint and model in Arctic AI administration, then disable mock mode to enable a real provider.";
        }
        return request(settings, prompt);
    }

    static String testConnection(AssistantSettings settings) throws ProviderException {
        if (settings.isMockMode()) {
            return "Mock mode is enabled; no external connection was attempted.";
        }
        request(settings, "Reply with the single word OK.");
        return "Connection successful. The configured model returned a response.";
    }

    private static String request(AssistantSettings settings, String prompt) throws ProviderException {
        if (settings.getEndpoint().isBlank() || settings.getModel().isBlank()) {
            throw new ProviderException("Configure an endpoint and model before testing the provider.");
        }
        if (!AssistantSettings.isValidEndpoint(settings.getEndpoint())) {
            throw new ProviderException("The configured endpoint is invalid.");
        }

        String payload = "{\"model\":\"" + escape(settings.getModel())
                + "\",\"messages\":[{\"role\":\"user\",\"content\":\""
                + escape(prompt) + "\"}]";
        if (prompt.startsWith("Reply with the single word OK.")) {
            payload += ",\"max_tokens\":12";
        }
        payload += "}";

        int timeout = settings.getTimeoutSeconds();
        HttpRequest.Builder builder;
        try {
            builder = HttpRequest.newBuilder(URI.create(settings.getEndpoint()))
                    .timeout(Duration.ofSeconds(timeout))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8));
        } catch (IllegalArgumentException e) {
            throw new ProviderException("The configured endpoint is invalid.");
        }

        String key = System.getenv("ZAAMTECH_AI_API_KEY");
        if (key != null && !key.isBlank()) {
            builder.header("Authorization", "Bearer " + key);
        }

        try {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(timeout))
                    .followRedirects(HttpClient.Redirect.NEVER)
                    .build();
            HttpResponse<String> response = client.send(
                    builder.build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ProviderException("The provider returned HTTP " + response.statusCode() + ".");
            }
            String content = field(response.body(), "content");
            if (content == null || content.isBlank()) {
                throw new ProviderException("The provider response did not contain a chat reply.");
            }
            return content;
        } catch (ProviderException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ProviderException("The provider request was interrupted.");
        } catch (IOException | RuntimeException e) {
            throw new ProviderException("Could not connect to the configured provider. Check the endpoint and server network access.");
        }
    }

    private static String field(String json, String name) {
        Matcher matcher = Pattern.compile("\\\"" + Pattern.quote(name)
                + "\\\"\\s*:\\s*" + JSON_STRING).matcher(json);
        return matcher.find() ? unescape(matcher.group(1)) : null;
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    private static String unescape(String value) {
        return value.replace("\\n", "\n")
                .replace("\\r", "\r")
                .replace("\\t", "\t")
                .replace("\\\"", "\"")
                .replace("\\\\", "\\");
    }

    static final class ProviderException extends Exception {
        private static final long serialVersionUID = 1L;

        ProviderException(String message) {
            super(message);
        }
    }
}
