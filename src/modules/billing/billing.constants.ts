export interface TokenPackage {
  id: string;
  name: string;
  tokenAmount: number;
  priceIdr: number;
}

export const TOKEN_PACKAGES: Record<string, TokenPackage> = {
  STARTER: {
    id: 'STARTER',
    name: 'Starter',
    tokenAmount: 50,
    priceIdr: 50_000,
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    tokenAmount: 150,
    priceIdr: 125_000,
  },
  PREMIUM: {
    id: 'PREMIUM',
    name: 'Premium',
    tokenAmount: 500,
    priceIdr: 350_000,
  },
};

export const getPackage = (id: string): TokenPackage | undefined => {
  return TOKEN_PACKAGES[id];
};
