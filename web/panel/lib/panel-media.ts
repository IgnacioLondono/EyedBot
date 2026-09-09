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

/** Conserva ?t= / ?v= para bustear cache tras subir (p. ej. greeting-image). */
function keepCacheBust(pathname: string, search = "") {
  const path = String(pathname || "").split("?")[0];
  if (!path) return "";
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const bust = params.get("t") || params.get("v");
    if (bust) return `${path}?t=${encodeURIComponent(bust)}`;
  } catch {
    // noop
  }
  return path;
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
  if (uploadPath) {
    try {
      const u = raw.startsWith("http") ? new URL(raw) : new URL(raw, "http://local.invalid");
      return keepCacheBust(uploadPath, u.search);
    } catch {
      return uploadPath;
    }
  }

  if (raw.startsWith("/")) {
    const [pathPart, queryPart = ""] = raw.split("?");
    return keepCacheBust(pathPart, queryPart);
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (isLocalNetworkHostname(url.hostname)) {
        const localUpload = extractUploadPath(raw);
        if (localUpload) return keepCacheBust(localUpload, url.search);
        if (url.pathname.startsWith("/api/")) return keepCacheBust(url.pathname, url.search);
        return "";
      }
      return raw;
    } catch {
      return "";
    }
  }

  return raw;
}

export function withMediaCacheBust(value?: string) {
  const raw = String(value || "").trim();
  if (!raw || /^(blob:|data:)/i.test(raw)) return raw;
  const base = raw.split("?")[0];
  return `${base}?t=${Date.now()}`;
}
