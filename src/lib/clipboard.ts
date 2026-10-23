/**
 * Safe clipboard copy utility that works across secure (HTTPS/localhost)
 * and non-secure (plain HTTP IP, e.g. Oracle Cloud IP) contexts.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // 1. Try modern Async Clipboard API if available and context is secure
  if (navigator?.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy fallback
    }
  }

  // 2. Legacy execCommand fallback for plain HTTP IP addresses
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    textArea.setAttribute("readonly", "");
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    textArea.remove();
    return Boolean(successful);
  } catch {
    return false;
  }
}
