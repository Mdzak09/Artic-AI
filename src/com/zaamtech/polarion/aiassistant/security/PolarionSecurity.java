package com.zaamtech.polarion.aiassistant.security;

import java.security.Principal;
import java.security.PrivilegedExceptionAction;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import com.polarion.platform.core.PlatformContext;
import com.polarion.platform.security.ISecurityService;
import javax.servlet.http.HttpServletRequest;

/** Adapts authenticated servlet requests to Polarion's documented global-role API. */
public final class PolarionSecurity {
    private PolarionSecurity() { }

    public static boolean isGlobalAdministrator(HttpServletRequest request) {
        return request != null && request.isUserInRole("admin");
    }

    public static boolean canUseAssistant(HttpServletRequest request, com.zaamtech.polarion.aiassistant.config.AssistantSettings settings) {
        if (request == null || request.getUserPrincipal() == null) {
            return false;
        }
        if (isGlobalAdministrator(request)) {
            return AccessPolicy.allows(settings, true, Collections.emptyList());
        }
        if ("all".equals(settings.getAccessMode())) {
            return AccessPolicy.allows(settings, false, Collections.emptyList());
        }

        Principal principal = request.getUserPrincipal();
        Collection<String> roles;
        try {
            roles = asCurrentUser(() -> securityService().getRolesForUser(principal.getName()));
        } catch (RuntimeException e) {
            return false;
        }
        return AccessPolicy.allows(settings, false, roles);
    }

    public static List<String> globalRoles() {
        Collection<String> roles = asCurrentUser(() -> securityService().getGlobalRoles());
        List<String> result = new ArrayList<>();
        for (String role : roles) {
            if (com.zaamtech.polarion.aiassistant.config.AssistantSettings.validRoleId(role)) {
                result.add(role);
            }
        }
        Collections.sort(result);
        return result;
    }

    /** Runs Polarion service calls in the authenticated request's subject, as Polarion extension REST APIs do. */
    public static <T> T asCurrentUser(PrivilegedExceptionAction<T> action) {
        ISecurityService service = securityService();
        javax.security.auth.Subject subject = service.getCurrentSubject();
        if (subject == null) {
            throw new IllegalStateException("Polarion did not expose the authenticated request subject.");
        }
        try {
            return service.doAsUser(subject, action);
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Polarion service call failed for the authenticated user.", e);
        }
    }

    private static ISecurityService securityService() {
        ISecurityService service = (ISecurityService)
                PlatformContext.getPlatform().lookupService(ISecurityService.class);
        if (service == null) {
            throw new IllegalStateException("Polarion security service is unavailable.");
        }
        return service;
    }
}
