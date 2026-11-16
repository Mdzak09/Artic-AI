package com.zaamtech.polarion.aiassistant.config;

import java.net.URI;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Properties;
import java.util.Set;
import java.util.regex.Pattern;

/** Validated, global Arctic AI settings. Secrets are intentionally not stored here. */
public final class AssistantSettings {
    public static final String CONFIG_ID = "com.zaamtech.polarion.aiassistant.arctic";
    public static final String DEFAULT_NAME = "AI";
    public static final String DEFAULT_ACCENT = "#1280A6";
    public static final int DEFAULT_WIDTH = 420;
    public static final int MIN_WIDTH = 360;
    public static final int MAX_WIDTH = 600;

    private static final Pattern NAME = Pattern.compile("[\\p{L}\\p{N}][\\p{L}\\p{N} ._-]{0,39}");
    private static final Pattern COLOR = Pattern.compile("#[0-9a-fA-F]{6}");
    private static final Pattern MODEL = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}");

    private final boolean enabled;
    private final boolean showHeaderButton;
    private final String name;
    private final String accessMode;
    private final List<String> accessRoles;
    private final String theme;
    private final String accentColor;
    private final int sidebarWidth;
    private final String headerPlacement;
    private final boolean mockMode;
    private final String endpoint;
    private final String model;
    private final int timeoutSeconds;

    private AssistantSettings(
            boolean enabled,
            boolean showHeaderButton,
            String name,
            String accessMode,
            Collection<String> accessRoles,
            String theme,
            String accentColor,
            int sidebarWidth,
            String headerPlacement,
            boolean mockMode,
            String endpoint,
            String model,
            int timeoutSeconds) {
        this.enabled = enabled;
        this.showHeaderButton = showHeaderButton;
        this.name = name;
        this.accessMode = accessMode;
        this.accessRoles = List.copyOf(accessRoles);
        this.theme = theme;
        this.accentColor = accentColor.toUpperCase();
        this.sidebarWidth = sidebarWidth;
        this.headerPlacement = headerPlacement;
        this.mockMode = mockMode;
        this.endpoint = endpoint;
        this.model = model;
        this.timeoutSeconds = timeoutSeconds;
    }

    public static AssistantSettings defaults() {
        String endpoint = System.getProperty("zaamtech.ai.endpoint", "").trim();
        if (!endpoint.isEmpty() && !isValidEndpoint(endpoint)) {
            endpoint = "";
        }
        String model = System.getProperty("zaamtech.ai.model", "").trim();
        if (!model.isEmpty() && !MODEL.matcher(model).matches()) {
            model = "";
        }
        return new AssistantSettings(
                true,
                true,
                DEFAULT_NAME,
                "all",
                List.of(),
                "system",
                DEFAULT_ACCENT,
                DEFAULT_WIDTH,
                "right",
                Boolean.parseBoolean(System.getProperty("zaamtech.ai.mock", "true")),
                endpoint,
                model,
                boundedTimeout(Integer.getInteger("zaamtech.ai.timeoutSeconds", 45)));
    }

    public static AssistantSettings fromProperties(Properties properties) {
        AssistantSettings defaults = defaults();
        if (properties == null || properties.isEmpty()) {
            return defaults;
        }

        String mode = properties.getProperty("access.mode", "all");
        if (!mode.equals("all") && !mode.equals("roles")) {
            mode = "roles";
        }

        List<String> roles = new ArrayList<>();
        String roleValue = properties.getProperty("access.roles", "");
        for (String role : roleValue.split(",")) {
            String value = role.trim();
            if (validRoleId(value)) {
                roles.add(value);
            }
        }

        String theme = properties.getProperty("appearance.theme", defaults.theme);
        if (!Set.of("system", "light", "dark").contains(theme)) {
            theme = "system";
        }

        String accent = properties.getProperty("appearance.accent", defaults.accentColor);
        if (!COLOR.matcher(accent).matches()) {
            accent = DEFAULT_ACCENT;
        }

        String placement = properties.getProperty("appearance.headerPlacement", "right");
        if (!Set.of("right", "branding").contains(placement)) {
            placement = "right";
        }

        int width = parseInteger(properties.getProperty("appearance.sidebarWidth"), DEFAULT_WIDTH);
        if (width < MIN_WIDTH || width > MAX_WIDTH) {
            width = DEFAULT_WIDTH;
        }

        String name = properties.getProperty("assistant.name", DEFAULT_NAME).trim();
        if (!isValidName(name)) {
            name = DEFAULT_NAME;
        }

        String endpoint = properties.getProperty("provider.endpoint", defaults.endpoint).trim();
        if (!endpoint.isEmpty() && !isValidEndpoint(endpoint)) {
            endpoint = "";
        }

        String model = properties.getProperty("provider.model", defaults.model).trim();
        if (!model.isEmpty() && !MODEL.matcher(model).matches()) {
            model = "";
        }

        int timeout = parseInteger(
                properties.getProperty("provider.timeoutSeconds"),
                defaults.timeoutSeconds);
        timeout = boundedTimeout(timeout);

        String enabledValue = properties.getProperty("assistant.enabled", "true");
        boolean enabled = enabledValue.equalsIgnoreCase("true");
        String showButtonValue = properties.getProperty("appearance.showHeaderButton", "true");
        boolean showHeaderButton = !showButtonValue.equalsIgnoreCase("false");
        boolean mock = properties.getProperty(
                "provider.mock",
                Boolean.toString(defaults.mockMode)).equalsIgnoreCase("true");

        return new AssistantSettings(
                enabled, showHeaderButton, name, mode, roles, theme, accent, width, placement,
                mock, endpoint, model, timeout);
    }

    public static AssistantSettings fromForm(
            boolean enabled,
            boolean showHeaderButton,
            String nameValue,
            String accessModeValue,
            Collection<String> requestedRoles,
            String themeValue,
            String accentValue,
            String widthValue,
            String placementValue,
            boolean mockMode,
            String endpointValue,
            String modelValue,
            String timeoutValue,
            Collection<String> availableRoles) {
        String name = nameValue == null ? "" : nameValue.trim();
        if (!isValidName(name)) {
            throw new IllegalArgumentException("Name must be 1–40 letters, numbers, spaces, dots, underscores, or hyphens.");
        }

        if (!"all".equals(accessModeValue) && !"roles".equals(accessModeValue)) {
            throw new IllegalArgumentException("Choose a valid access mode.");
        }

        Set<String> validRoles = new LinkedHashSet<>();
        for (String role : requestedRoles) {
            String id = role == null ? "" : role.trim();
            if (!validRoleId(id) || !availableRoles.contains(id)) {
                throw new IllegalArgumentException("An access role is no longer available. Reload the page and try again.");
            }
            validRoles.add(id);
        }
        if ("roles".equals(accessModeValue) && validRoles.isEmpty()) {
            throw new IllegalArgumentException("Select at least one global role, or choose all authorized users.");
        }

        if (!Set.of("system", "light", "dark").contains(themeValue)) {
            throw new IllegalArgumentException("Choose a valid theme.");
        }
        if (accentValue == null || !COLOR.matcher(accentValue).matches()) {
            throw new IllegalArgumentException("Accent color must be a six-digit hexadecimal color.");
        }
        if (!hasWhiteTextContrast(accentValue)) {
            throw new IllegalArgumentException("Choose a darker accent color so white button text remains readable (4.5:1 contrast minimum).");
        }

        int width = parseRequiredInteger(widthValue, "Sidebar width");
        if (width < MIN_WIDTH || width > MAX_WIDTH) {
            throw new IllegalArgumentException("Sidebar width must be between 360 and 600 pixels.");
        }

        if (!Set.of("right", "branding").contains(placementValue)) {
            throw new IllegalArgumentException("Choose a supported header placement.");
        }

        String endpoint = endpointValue == null ? "" : endpointValue.trim();
        if (!endpoint.isEmpty() && !isValidEndpoint(endpoint)) {
            throw new IllegalArgumentException("Endpoint must be an HTTPS URL (or HTTP on localhost) without embedded credentials.");
        }

        String model = modelValue == null ? "" : modelValue.trim();
        if (!model.isEmpty() && !MODEL.matcher(model).matches()) {
            throw new IllegalArgumentException("Model identifier contains unsupported characters.");
        }
        if (!mockMode && (endpoint.isEmpty() || model.isEmpty())) {
            throw new IllegalArgumentException("Real-provider mode requires an endpoint and model identifier.");
        }

        int timeout = parseRequiredInteger(timeoutValue, "Request timeout");
        if (timeout < 5 || timeout > 120) {
            throw new IllegalArgumentException("Request timeout must be between 5 and 120 seconds.");
        }

        return new AssistantSettings(
                enabled, showHeaderButton, name, accessModeValue, validRoles, themeValue,
                accentValue, width, placementValue, mockMode,
                endpoint, model, timeout);
    }

    public Properties toProperties() {
        Properties properties = new Properties();
        properties.setProperty("version", "1");
        properties.setProperty("assistant.enabled", Boolean.toString(enabled));
        properties.setProperty("appearance.showHeaderButton", Boolean.toString(showHeaderButton));
        properties.setProperty("assistant.name", name);
        properties.setProperty("access.mode", accessMode);
        properties.setProperty("access.roles", String.join(",", accessRoles));
        properties.setProperty("appearance.theme", theme);
        properties.setProperty("appearance.accent", accentColor);
        properties.setProperty("appearance.sidebarWidth", Integer.toString(sidebarWidth));
        properties.setProperty("appearance.headerPlacement", headerPlacement);
        properties.setProperty("provider.mock", Boolean.toString(mockMode));
        properties.setProperty("provider.endpoint", endpoint);
        properties.setProperty("provider.model", model);
        properties.setProperty("provider.timeoutSeconds", Integer.toString(timeoutSeconds));
        return properties;
    }

    public static boolean isValidName(String value) {
        return value != null && NAME.matcher(value).matches();
    }

    private static boolean hasWhiteTextContrast(String color) {
        int red = Integer.parseInt(color.substring(1, 3), 16);
        int green = Integer.parseInt(color.substring(3, 5), 16);
        int blue = Integer.parseInt(color.substring(5, 7), 16);
        double luminance = 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
        return 1.05 / (luminance + 0.05) >= 4.5;
    }

    private static double linear(int channel) {
        double value = channel / 255.0;
        return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    }

    public static boolean validRoleId(String value) {
        return value != null && value.length() <= 100
                && value.matches("[A-Za-z0-9][A-Za-z0-9_.-]*");
    }

    public static boolean isValidEndpoint(String value) {
        try {
            URI uri = URI.create(value);
            if (uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getFragment() != null || uri.getQuery() != null) {
                return false;
            }
            if ("https".equalsIgnoreCase(uri.getScheme())) {
                return true;
            }
            String host = uri.getHost().toLowerCase();
            return "http".equalsIgnoreCase(uri.getScheme())
                    && (host.equals("localhost") || host.equals("127.0.0.1") || host.equals("::1"));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static int parseRequiredInteger(String value, String label) {
        try {
            return Integer.parseInt(value);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException(label + " must be a whole number.");
        }
    }

    private static int parseInteger(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (RuntimeException e) {
            return fallback;
        }
    }

    private static int boundedTimeout(int value) {
        return Math.max(5, Math.min(120, value));
    }

    public boolean isEnabled() { return enabled; }
    public boolean isShowHeaderButton() { return showHeaderButton; }
    public String getName() { return name; }
    public String getAccessMode() { return accessMode; }
    public List<String> getAccessRoles() { return accessRoles; }
    public String getTheme() { return theme; }
    public String getAccentColor() { return accentColor; }
    public int getSidebarWidth() { return sidebarWidth; }
    public String getHeaderPlacement() { return headerPlacement; }
    public boolean isMockMode() { return mockMode; }
    public String getEndpoint() { return endpoint; }
    public String getModel() { return model; }
    public int getTimeoutSeconds() { return timeoutSeconds; }
}
