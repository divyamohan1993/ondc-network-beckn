/**
 * Sanitize strings to prevent XSS when catalog data is rendered in web frontends.
 * Escapes HTML entities in text content.
 */

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
  "`": "&#96;",
};

const ENTITY_REGEX = /[&<>"'`/]/g;

export function escapeHtml(str: string): string {
  return str.replace(ENTITY_REGEX, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Sanitize catalog item data -- escape HTML in text fields.
 * Does NOT modify URLs, prices, or structured data.
 */
export function sanitizeCatalogItem(item: any): any {
  if (!item) return item;
  const clone = JSON.parse(JSON.stringify(item));

  // Sanitize descriptor text fields
  if (clone.descriptor) {
    if (clone.descriptor.name) clone.descriptor.name = escapeHtml(clone.descriptor.name);
    if (clone.descriptor.short_desc) clone.descriptor.short_desc = escapeHtml(clone.descriptor.short_desc);
    if (clone.descriptor.long_desc) clone.descriptor.long_desc = escapeHtml(clone.descriptor.long_desc);
  }

  // Sanitize category names
  if (clone.category_id) clone.category_id = escapeHtml(clone.category_id);

  // Sanitize tag values
  if (clone.tags && Array.isArray(clone.tags)) {
    for (const tag of clone.tags) {
      if (tag.list && Array.isArray(tag.list)) {
        for (const entry of tag.list) {
          if (entry.value && typeof entry.value === "string") {
            entry.value = escapeHtml(entry.value);
          }
        }
      }
    }
  }

  // Validate image URLs (must be https or data URIs only)
  if (clone.descriptor?.images && Array.isArray(clone.descriptor.images)) {
    clone.descriptor.images = clone.descriptor.images.filter((img: any) => {
      const url = typeof img === "string" ? img : img?.url;
      if (!url) return false;
      return url.startsWith("https://") || url.startsWith("data:image/");
    });
  }

  return clone;
}

/**
 * Sanitize an entire catalog response.
 */
export function sanitizeCatalog(catalog: any): any {
  if (!catalog) return catalog;
  const clone = JSON.parse(JSON.stringify(catalog));

  if (clone["bpp/providers"] && Array.isArray(clone["bpp/providers"])) {
    for (const provider of clone["bpp/providers"]) {
      if (provider.descriptor) {
        if (provider.descriptor.name) provider.descriptor.name = escapeHtml(provider.descriptor.name);
        if (provider.descriptor.short_desc) provider.descriptor.short_desc = escapeHtml(provider.descriptor.short_desc);
      }
      if (provider.items && Array.isArray(provider.items)) {
        provider.items = provider.items.map(sanitizeCatalogItem);
      }
    }
  }

  return clone;
}
