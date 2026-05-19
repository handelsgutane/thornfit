/**
 * /takk-for-handelen — DEPRECATED.
 *
 * Erstatningen `/ordre-bekreftet/[id]` (med sessionStorage-data) overtok denne
 * siden. Vi beholder denne ruten kun for bakoverkompatibilitet (eventuelle
 * gamle e-postlenker eller bookmarks) og redirecter til konto-ordrer-listen
 * — der finner brukeren sin ordre selv om sessionStorage er tomt.
 *
 * Kan slettes når vi er sikre på at ingen utestående lenker peker hit.
 */

import { redirect } from 'next/navigation';

export default function TakkForHandelenLegacyRedirect(): never {
  redirect('/konto/ordrer');
}
