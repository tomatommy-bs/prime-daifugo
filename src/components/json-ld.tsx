import { type JsonLd, serializeJsonLd } from '@/lib/structured-data'

/** Server-rendered JSON-LD block (structured data for search engines). */
export function JsonLdScript({ data }: { data: JsonLd | readonly JsonLd[] }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: serialised JSON with `<` escaped
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}
