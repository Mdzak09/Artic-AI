package com.zaamtech.polarion.aiassistant.web;

import java.io.IOException;
import java.util.Collection;
import javax.servlet.http.HttpServletResponse;

/** Minimal JSON output helpers for the plugin's small same-origin responses. */
final class JsonResponse {
    private JsonResponse() { }

    static void begin(HttpServletResponse response) {
        response.setContentType("application/json;charset=UTF-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
    }

    static void error(HttpServletResponse response, int status, String message) throws IOException {
        begin(response);
        response.setStatus(status);
        response.getWriter().write("{\"error\":" + quote(message) + "}");
    }

    static String quote(String value) {
        StringBuilder out = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"': out.append("\\\""); break;
                case '\\': out.append("\\\\"); break;
                case '\b': out.append("\\b"); break;
                case '\f': out.append("\\f"); break;
                case '\n': out.append("\\n"); break;
                case '\r': out.append("\\r"); break;
                case '\t': out.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
            }
        }
        return out.append('"').toString();
    }

    static String strings(Collection<String> values) {
        StringBuilder out = new StringBuilder("[");
        boolean first = true;
        for (String value : values) {
            if (!first) out.append(',');
            first = false;
            out.append(quote(value));
        }
        return out.append(']').toString();
    }
}
