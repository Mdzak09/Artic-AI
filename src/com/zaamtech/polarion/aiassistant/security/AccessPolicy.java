package com.zaamtech.polarion.aiassistant.security;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;
import com.zaamtech.polarion.aiassistant.config.AssistantSettings;

/** Role-only access policy. Selected global roles combine using OR. */
public final class AccessPolicy {
    private AccessPolicy() { }

    public static boolean allows(
            AssistantSettings settings,
            boolean polarionGlobalAdmin,
            Collection<String> userGlobalRoles) {
        if (!settings.isEnabled()) {
            return false;
        }
        if (polarionGlobalAdmin) {
            return true;
        }
        if ("all".equals(settings.getAccessMode())) {
            return true;
        }
        if (!"roles".equals(settings.getAccessMode())
                || settings.getAccessRoles().isEmpty()
                || userGlobalRoles == null) {
            return false;
        }

        Set<String> assignedRoles = new HashSet<>(userGlobalRoles);
        return settings.getAccessRoles().stream().anyMatch(assignedRoles::contains);
    }
}
