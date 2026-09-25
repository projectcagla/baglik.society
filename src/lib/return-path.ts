// Where to send a member after the door. Only same-site, known sections.
const ALLOWED =
  /^\/(oda|filmler|geceler|defter|profil|masa|hosgeldin)(\/[A-Za-z0-9\-._~%/]*)?(\?[A-Za-z0-9\-._~%=&]*)?$/;

export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || value.length > 300) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  if (value.includes('..')) return null;
  return ALLOWED.test(value) ? value : null;
}
