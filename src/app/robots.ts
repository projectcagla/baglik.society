import type { MetadataRoute } from 'next';

// Nothing here is for search engines. (Not a security control — the door is.)
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
