'use client';

/**
 * Newsletter-blokk for kniv-info-oversikten.
 *
 * Mobil: full-bleed kuro band (Paper FYZ-0 G1F-0).
 * Desktop (Paper EF9-0): 1312-bred bordered kort midt i grid'et — kuro bg,
 *   radius 2, padding 40/56, gap 40, justify-between.
 *
 *   - Left (EFA-0): col, max-w 480, gap 6
 *     · eyebrow (EFB-0): 11/14 Bold uppercase, color #FFFFFF80, letter 0.12em
 *     · h2 (EFC-0): 22/27 Bold white, line 120%, letter -0.02em
 *     · body (EFD-0): 14/21 Regular #FFFFFF99, line 150%
 *   - Right (EFE-0): row, gap 10
 *     · input (EFF-0): w 280, h 48, padding 0/16, radius 2,
 *       bg #FFFFFF14, border 1px #FFFFFF26, placeholder #FFFFFF59
 *     · button (EFH-0): h 48, padding 0/24, radius 2, aka bg, 14/18 Bold
 *
 * MVP: postet til /api/newsletter/subscribe (stub-endpoint). Når
 * Mailchimp/Klaviyo-integrasjon kommer, byttes endepunktet uten å røre
 * komponenten her.
 */

import { useState, useTransition } from 'react';

import { Toast, useToast } from '@/components/ui/Toast';

export function NewsletterBlock() {
  const [email, setEmail] = useState('');
  const [pending, startTransition] = useTransition();
  const { toastProps, showToast } = useToast();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    startTransition(async () => {
      try {
        const res = await fetch('/api/newsletter/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: trimmed }),
        });
        if (!res.ok) throw new Error(String(res.status));
        showToast({
          variant: 'success',
          message: 'Takk! Sjekk innboksen for å bekrefte abonnementet.',
        });
        setEmail('');
      } catch {
        showToast({
          variant: 'error',
          message: 'Noe gikk galt. Prøv igjen om en stund.',
        });
      }
    });
  }

  return (
    <>
      {/* Wrapper:
          - Mobil: full-bleed bg-kuro (gammel layout, gap 14, padding 28/24/32/24).
          - Desktop: section er transparent; kuro kort er INNI max-w-content
            (Paper EF9-0 1312×154). */}
      <section
        aria-label="Nyhetsbrev"
        className="w-full bg-kuro text-shiro lg:bg-transparent lg:text-ink lg:my-10" /* paper-exact: EF9-0 wrapped in CID-0 grid (mt 40 from prev row) */
      >
        {/* Mobile-layout (kuro bg arvet fra wrapper) */}
        <div className="mx-auto flex max-w-content flex-col gap-3.5 px-sp-4 pt-7 pb-8 md:flex-row md:items-center md:justify-between md:gap-sp-7 md:px-sp-7 md:py-sp-7 lg:hidden">
          <div className="flex flex-col gap-1.5 md:max-w-md md:gap-sp-2">
            <span
              className="block font-bold uppercase text-aka md:text-shiro/60"
              style={{ fontSize: '10px', lineHeight: '12px', letterSpacing: '0.1em' }}
            >
              Nyhetsbrev
            </span>
            <h2
              className="font-bold text-shiro"
              style={{
                fontSize: '20px',
                lineHeight: '24px',
                letterSpacing: '-0.015em',
              }}
            >
              Få nye guider rett i innboksen
            </h2>
            <p
              className="text-shiro/70"
              style={{ fontSize: '13px', lineHeight: '20px' }}
            >
              Knivteknikk, stålguider og eksklusive tips. Ingen spam.
            </p>
          </div>
          <form
            onSubmit={handleSubmit}
            className="flex w-full flex-col gap-sp-2 md:flex-row md:items-stretch md:gap-0 md:overflow-hidden md:rounded-1 md:bg-shiro md:focus-within:ring-2 md:focus-within:ring-aka md:focus-within:ring-offset-2 md:max-w-lg"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="din@epost.no"
              aria-label="E-postadresse"
              className="min-w-0 flex-1 rounded-1 border border-shiro/[0.12] bg-shiro/[0.07] px-4 py-3 text-shiro placeholder:text-shiro/30 focus:outline-none focus:ring-2 focus:ring-aka focus:ring-offset-2 focus:ring-offset-kuro md:rounded-none md:border-0 md:bg-transparent md:px-sp-3 md:py-sp-3 md:text-body-sm md:text-ink md:placeholder:text-ink-muted md:focus:ring-0 md:focus:ring-offset-0" /* paper-exact: FYZ-0 G1L-0 (translucent input on mobile) */
              style={{ fontSize: '14px', lineHeight: '18px' }}
            />
            <button
              type="submit"
              disabled={pending}
              className="flex shrink-0 items-center justify-center rounded-1 bg-aka px-sp-3 py-3.5 font-bold text-shiro transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-aka focus:ring-offset-2 focus:ring-offset-kuro disabled:opacity-60 md:m-1 md:px-sp-4 md:py-0 md:text-body-sm md:focus:ring-offset-shiro"
              style={{ fontSize: '14px', lineHeight: '18px', letterSpacing: '0.01em' }}
            >
              {pending ? 'Sender…' : 'Meld meg på'}
            </button>
          </form>
        </div>

        {/* Desktop-layout — Paper EF9-0 (1312×154 kuro kort, padding 40/56). */}
        <div className="mx-auto hidden max-w-content lg:block lg:px-16">
          <div
            className="flex items-center justify-between gap-10 rounded-1 bg-kuro" /* paper-exact: EF9-0 (kuro bg, radius 2, justify-between, gap 40) */
            style={{ padding: '40px 56px' }} /* paper-exact: EF9-0 (paddingBlock 40, paddingInline 56) */
          >
            <div className="flex max-w-[480px] flex-col gap-1.5" /* paper-exact: EFA-0 (max-w 480, gap 6) */>
              <span
                className="font-bold uppercase text-shiro/50"
                style={{ fontSize: '11px', lineHeight: '14px', letterSpacing: '0.12em' }} /* paper-exact: EFB-0 (11/14 Bold #FFFFFF80, letter 0.12em) */
              >
                Nyhetsbrev
              </span>
              <h2
                className="font-bold text-shiro"
                style={{
                  fontSize: '22px',
                  lineHeight: '27px',
                  letterSpacing: '-0.02em',
                }} /* paper-exact: EFC-0 (22/27 Bold, letter -0.02em) */
              >
                Få nye guider rett i innboksen
              </h2>
              <p
                className="text-shiro/60"
                style={{ fontSize: '14px', lineHeight: '21px' }} /* paper-exact: EFD-0 (14/21 Regular #FFFFFF99) */
              >
                Knivteknikk, stålguider og eksklusive tips. Ingen spam.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex flex-shrink-0 items-center gap-2.5" /* paper-exact: EFE-0 (gap 10) */
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="din@epost.no"
                aria-label="E-postadresse"
                className="h-12 w-[280px] flex-shrink-0 rounded-1 border bg-shiro/[0.08] px-4 text-shiro placeholder:text-shiro/35 focus:outline-none focus:ring-2 focus:ring-aka focus:ring-offset-2 focus:ring-offset-kuro" /* paper-exact: EFF-0 (w 280, h 48, padding-inline 16, bg #FFFFFF14, border #FFFFFF26) */
                style={{
                  fontSize: '14px',
                  lineHeight: '18px',
                  borderColor: 'rgba(255,255,255,0.15)',
                }} /* paper-exact: EFG-0 (14/18) + EFF-0 (border 1px #FFFFFF26) */
              />
              <button
                type="submit"
                disabled={pending}
                className="flex h-12 flex-shrink-0 items-center justify-center rounded-1 bg-aka font-bold text-shiro transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-aka focus:ring-offset-2 focus:ring-offset-kuro disabled:opacity-60" /* paper-exact: EFH-0 (h 48, aka bg, radius 2) */
                style={{
                  fontSize: '14px',
                  lineHeight: '18px',
                  padding: '0 24px',
                }} /* paper-exact: EFH-0 (paddingInline 24) + EFI-0 (14/18 Bold) */
              >
                {pending ? 'Sender…' : 'Meld meg på'}
              </button>
            </form>
          </div>
        </div>
      </section>
      {toastProps && <Toast {...toastProps} />}
    </>
  );
}
