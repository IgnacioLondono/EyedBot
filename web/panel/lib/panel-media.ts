function isLocalNetworkHostname(hostname = "") {
  const h = String(hostname || "").toLowerCase();
  if (!h) return false;
  if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "::1") return true;
  if (h.endsWith(".local") || h.endsWith(".localhost")) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  return false;
}

function extractUploadPath(rawUrl = "") {
  const raw = String(rawUrl || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/uploads/")) return raw.split("?")[0];
  try {
    const pathname = new URL(raw).pathname;
    if (pathname.startsWith("/uploads/")) return pathname.split("?")[0];
  } catch {
    // no es URL absoluta
  }
  return "";
}

/**
 * URL estable para <img src>.
 * No usa Date.now() en cada llamada: eso re-disparaba cientos de GETs y tumba el rate-limit.
 * Tras una subida, pasá `filePreview` o actualizá `value` con un ?t= puntual.
 */
export function resolvePanelMediaUrl(value?: string, filePreview?: string) {
  if (filePreview) return filePreview;
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(blob:|data:)/i.test(raw)) return raw;

  const uploadPath = extractUploadPath(raw);
  if (uploadPath) return uploadPath;

  if (raw.startsWith("/")) return raw.split("?")[0];

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (isLocalNetworkHostname(url.hostname)) {
        const localUpload = extractUploadPath(raw);
        if (localUpload) return localUpload;
        if (url.pathname.startsWith("/api/")) return url.pathname.split("?")[0];
        return "";
      }
      return raw;
    } catch {
      return "";
    }
  }

  return raw;
}
