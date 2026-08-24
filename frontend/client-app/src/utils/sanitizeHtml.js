// ============================================================
// Lightweight allowlist HTML sanitizer (no dependencies).
// Used for rendering admin-authored CMS content (e.g. header
// navigation popup) via dangerouslySetInnerHTML.
//
// Strategy: parse with the browser's own parser inside an
// INERT container (<template> content is never executed),
// then rebuild ONLY whitelisted tags and strip ALL attributes.
// Stripping every attribute removes all event handlers (onclick,
// onerror, ...), javascript: URLs, styles, and iframes/scripts
// are dropped because their tags are not whitelisted.
// Unknown tags are unwrapped — their TEXT is preserved, so
// normal formatting survives while anything unsafe disappears.
// ============================================================

// Formatting tags allowed in CMS content
const ALLOWED_TAGS = new Set([
  'H1', 'H2', 'H3', 'H4', 'P', 'BR', 'HR',
  'UL', 'OL', 'LI',
  'STRONG', 'B', 'EM', 'I', 'U',
  'BLOCKQUOTE', 'SPAN', 'DIV'
]);

// Tags dropped WITH their entire subtree (never unwrapped —
// their inner text is code/markup, not content)
const DISCARDED_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME',
  'OBJECT', 'EMBED', 'LINK', 'META', 'TITLE'
]);

function sanitizeNode(node, doc) {
  const frag = doc.createDocumentFragment();
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      // Text nodes are always safe — React/DOM escaping applies at render
      frag.appendChild(doc.createTextNode(child.nodeValue || ''));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      if (DISCARDED_TAGS.has(child.tagName)) {
        return; // drop subtree entirely
      }
      if (ALLOWED_TAGS.has(child.tagName)) {
        // Rebuild the tag with NO attributes at all (no handlers, no href/src/style)
        const clean = doc.createElement(child.tagName.toLowerCase());
        clean.appendChild(sanitizeNode(child, doc));
        frag.appendChild(clean);
      } else {
        // Other non-whitelisted tags (a, img, form, svg, ...):
        // unwrap them — keep their sanitized children/text, drop the element itself
        frag.appendChild(sanitizeNode(child, doc));
      }
    }
    // Comments and every other node type are dropped entirely
  });
  return frag;
}

export const sanitizeHtml = (html) => {
  if (typeof html !== 'string' || html.trim() === '') return '';
  try {
    const template = document.createElement('template');
    template.innerHTML = html; // parsed inertly — nothing executes
    const clean = sanitizeNode(template.content, document);
    const container = document.createElement('div');
    container.appendChild(clean);
    return container.innerHTML;
  } catch (err) {
    // On any failure, fail closed: no HTML at all
    return '';
  }
};

export default sanitizeHtml;
