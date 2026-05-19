/**
 * User types — customer accounts live in Woo (see adr/0003).
 */

export interface Address {
  firstName: string;
  lastName: string;
  company: string | null;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string;
  city: string;
  /** ISO 3166-1 alpha-2 country code. Validered til 'NO' ved input (se adr/0005). */
  country: string;
  phone: string | null;
  email?: string;
}

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;

  billingAddress: Address | null;
  shippingAddress: Address | null;

  acceptsMarketing: boolean;
  createdAt: string;

  /** True if the account was created via gjest-checkout and never set a password. */
  isGuest: boolean;
}

/** Session as we carry it across our own code. JWT lives in HTTP-only cookie. */
export interface Session {
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
  expiresAt: string;
}
