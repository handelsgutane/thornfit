/**
 * Button — universell CTA-primitiv for hele butikken.
 *
 * Polymorfisk: renders `<button>` eller Next.js `<Link>` avhengig av om
 * `href`-prop er oppgitt. Samme visuelle output uansett — velg basert på
 * om handlingen er navigasjon (href) eller en side-effekt (ingen href).
 *
 * Varianter — fargeprofil som prop:
 *   primary  : Rød aka-fyll + hvit tekst. Gå til checkout / Legg i handlekurv /
 *              Lagre endringer / Se alle produkter. Én per scope.
 *   outline  : 1px ink-border + surface-bg + ink-tekst. Endre passord /
 *              sekundær CTA i samme scope som en primary.
 *   ghost    : Ingen border/bg — kun tekst. Fortsett å handle / Avbryt.
 *              Brukes inline ved siden av primary/outline.
 *
 * Størrelser:
 *   sm  : h-10 (40px), px-sp-4, text-body-sm. Desktop kompakt-CTA.
 *         Brukes høyre-justert i form-cards (Personlig informasjon desktop).
 *   lg  : h-12 (48px), px-sp-4, text-body-md. Primær CTA full-bredde.
 *         Gå til checkout, Legg i handlekurv, Lagre endringer mobil.
 *
 * Icon-støtte:
 *   leftIcon / rightIcon  : ReactNode som rendres med gap-sp-2 mot teksten.
 *   Brukes for "Vis handlekurv →"-knapper og lignende CTA med ledsagerikon.
 *
 * Alle knapper har alltid rounded-1 (2px) per design-system-regelen.
 *
 * Tokens: kun semantic + brand (aka, aka-dark, ink, ink-inverse, surface,
 * surface-hover, divider). Ingen arbitrary-verdier.
 */

import Link from 'next/link';
import type {
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
  ReactNode,
} from 'react';

import { cn } from '@/lib/utils/cn';

export type ButtonVariant = 'primary' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'lg';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ButtonSharedProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full-bredde innenfor parent. Default false (auto). */
  fullWidth?: boolean;
  /** Ikon til venstre for teksten — f.eks. CartIcon i "Vis handlekurv". */
  leftIcon?: ReactNode;
  /** Ikon til høyre for teksten — f.eks. ArrowRight i "Fortsett →". */
  rightIcon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Rendres som <button> når href er utelatt. */
type ButtonAsButton = ButtonSharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | keyof ButtonSharedProps> & {
    href?: undefined;
    type?: 'button' | 'submit' | 'reset';
  };

/** Rendres som Next.js <Link> når href er oppgitt. */
type ButtonAsLink = ButtonSharedProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, 'href' | keyof ButtonSharedProps> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const BASE =
  'inline-flex items-center justify-center gap-sp-2 font-bold rounded-1 transition-colors ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-aka focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-aka text-white hover:bg-aka-dark',
  outline: 'border border-ink bg-surface text-ink hover:bg-surface-hover',
  ghost:   'text-ink-muted hover:text-ink',
};

const SIZE: Record<ButtonSize, string> = {
  // Desktop kompakt — h-10 (40px). Brukes høyre-justert i form-cards.
  sm: 'h-10 px-sp-4 text-body-sm',
  // Primær CTA — h-12 (48px). Cart checkout, add-to-cart, mobil form-CTA.
  lg: 'h-12 px-sp-4 text-body-md',
};

// Ghost-knapper i inline-kontekster trenger ikke full høyde — padding-basert.
const SIZE_GHOST: Record<ButtonSize, string> = {
  sm: 'px-sp-2 py-sp-1.5 text-body-sm',
  lg: 'px-sp-3 py-sp-2 text-body-md',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Button({
  variant = 'primary',
  size = 'sm',
  fullWidth = false,
  leftIcon,
  rightIcon,
  children,
  className,
  ...rest
}: ButtonProps) {
  const sizeClass = variant === 'ghost' ? SIZE_GHOST[size] : SIZE[size];

  const classes = cn(
    BASE,
    VARIANT[variant],
    sizeClass,
    fullWidth && 'w-full',
    className,
  );

  const content = (
    <>
      {leftIcon}
      {children}
      {rightIcon}
    </>
  );

  if ('href' in rest && rest.href !== undefined) {
    const { href, ...linkRest } = rest as ButtonAsLink;
    return (
      <Link href={href} className={classes} {...linkRest}>
        {content}
      </Link>
    );
  }

  const { type = 'button', ...buttonRest } = rest as ButtonAsButton;
  return (
    <button type={type} className={classes} {...buttonRest}>
      {content}
    </button>
  );
}
