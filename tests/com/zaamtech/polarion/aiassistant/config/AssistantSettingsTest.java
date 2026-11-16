package com.zaamtech.polarion.aiassistant.config;

import java.util.List;
import java.util.Properties;
import com.zaamtech.polarion.aiassistant.security.AccessPolicy;

/** Small executable regression checks that need no third-party test framework. */
public final class AssistantSettingsTest {
    private AssistantSettingsTest() { }

    public static void main(String[] args) {
        defaultsAndPersistenceRoundTrip();
        validatesUserSuppliedValues();
        enforcesRolePolicyAndDisabledState();
        System.out.println("AssistantSettingsTest: all checks passed.");
    }

    private static void defaultsAndPersistenceRoundTrip() {
        AssistantSettings defaults = AssistantSettings.defaults();
        check("AI".equals(defaults.getName()), "default assistant name");
        check("Baxter".equals(settings("Baxter", "#1280A6", "420", true).getName()),
                "valid assistant name Baxter is accepted");
        check("Baxter".equals(AssistantSettings.fromProperties(
                settings("Baxter", "#1280A6", "420", true).toProperties()).getName()),
                "custom assistant name survives settings persistence round trip");
        check(40 == settings("A".repeat(40), "#1280A6", "420", true).getName().length(),
                "40-character assistant name is accepted");
        check("#1280A6".equals(defaults.getAccentColor()), "default accent");
        check(defaults.isShowHeaderButton(), "header button enabled by default");
        check(AssistantSettings.fromProperties(new Properties()).isShowHeaderButton(), "missing button setting defaults enabled");
        Properties invalidVisibility = new Properties();
        invalidVisibility.setProperty("appearance.showHeaderButton", "invalid");
        check(AssistantSettings.fromProperties(invalidVisibility).isShowHeaderButton(), "invalid button setting defaults enabled");
        invalidVisibility.setProperty("appearance.showHeaderButton", "false");
        check(!AssistantSettings.fromProperties(invalidVisibility).isShowHeaderButton(), "disabled button setting persists");
        check(defaults.getSidebarWidth() >= 360 && defaults.getSidebarWidth() <= 600,
                "default sidebar width");
        check("AI".equals(AssistantSettings.fromProperties(defaults.toProperties()).getName()),
                "properties round trip");
    }

    private static void validatesUserSuppliedValues() {
        expectInvalid(() -> settings("", "#1280A6", "420", true));
        expectInvalid(() -> settings("A".repeat(41), "#1280A6", "420", true));
        expectInvalid(() -> settings("<script>alert(1)</script>", "#1280A6", "420", true));
        expectInvalid(() -> settings("Arctic AI", "red", "420", true));
        expectInvalid(() -> settings("Arctic AI", "#FFFFFF", "420", true));
        expectInvalid(() -> settings("Arctic AI", "#1280A6", "601", true));
        expectInvalid(() -> settings("Arctic AI", "#1280A6", "420", false));
    }

    private static void enforcesRolePolicyAndDisabledState() {
        AssistantSettings roles = AssistantSettings.fromForm(
                true, true, "Arctic AI", "roles", List.of("qa"), "system", "#1280A6",
                "420", "right", true, "", "", "45", List.of("qa", "developer"));
        check(AccessPolicy.allows(roles, false, List.of("developer", "qa")),
                "selected role grants access using OR logic");
        check(!AccessPolicy.allows(roles, false, List.of("developer")),
                "unselected role is denied");

        Properties saved = roles.toProperties();
        saved.setProperty("assistant.enabled", "false");
        AssistantSettings disabled = AssistantSettings.fromProperties(saved);
        check(!AccessPolicy.allows(disabled, true, List.of("admin")),
                "disabled assistant rejects even global administrators");
    }

    private static AssistantSettings settings(String name, String color, String width, boolean mock) {
        return AssistantSettings.fromForm(true, true, name, "all", List.of(), "system", color,
                width, "right", mock, "", "", "45", List.of("qa"));
    }

    private static void expectInvalid(Runnable action) {
        try {
            action.run();
            throw new AssertionError("Expected invalid setting to be rejected.");
        } catch (IllegalArgumentException expected) {
            // Expected validation outcome.
        }
    }

    private static void check(boolean condition, String description) {
        if (!condition) throw new AssertionError("Failed: " + description);
    }
}
