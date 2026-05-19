/**
 * /blogg/[slug] — gammel rute, 301-redirect til /kniv-info/[slug].
 *
 * Beholdes for å fange opp gamle interne lenker eller indekserte URL-er.
 * Den faktiske artikkelsiden ligger i `app/kniv-info/[slug]/page.tsx`.
 */

import { permanentRedirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function BlogPostRedirect({ params }: PageProps) {
  const { slug } = await params;
  permanentRedirect(`/kniv-info/${slug}`);
}
