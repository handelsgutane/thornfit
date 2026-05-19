/**
 * /blogg — gammel rute, 301-redirect til /kniv-info.
 *
 * Beholdes for å fange opp gamle interne lenker eller indekserte URL-er.
 * Den faktiske oversikten ligger i `app/kniv-info/page.tsx`.
 */

import { permanentRedirect } from 'next/navigation';

export default function BlogRedirect() {
  permanentRedirect('/kniv-info');
}
