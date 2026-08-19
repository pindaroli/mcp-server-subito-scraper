/**
 * Utility to construct valid Wallapop search URLs across European domains
 */

export interface WallapopSearchParams {
  keywords?: string;
  domain?: 'es' | 'it' | 'fr' | 'pt' | 'en' | string;
  categoryId?: number | string;
  minPrice?: number;
  maxPrice?: number;
  orderBy?: 'newest' | 'price_low_to_high' | 'price_high_to_low' | 'most_relevance' | string;
  condition?: 'new' | 'as_good_as_new' | 'good' | 'fair' | 'has_given_it_all' | string;
  shippingOnly?: boolean;
}

export const WALLAPOP_DOMAINS: Record<string, string> = {
  es: 'https://es.wallapop.com',
  it: 'https://it.wallapop.com',
  fr: 'https://fr.wallapop.com',
  pt: 'https://pt.wallapop.com',
  uk: 'https://en.wallapop.com',
  en: 'https://en.wallapop.com'
};

export const WALLAPOP_CATEGORIES: Record<string, number> = {
  cars: 100,
  auto: 100,
  motor_accessories: 14000,
  moto: 14000,
  fashion: 12579,
  moda: 12579,
  electronics: 15000,
  informatica: 15000,
  phones: 16000,
  telefonia: 16000,
  audio_tv_photo: 17000,
  audio: 17000,
  gaming: 12900,
  videogiochi: 12900,
  home_garden: 12485,
  casa: 12485,
  appliances: 12545,
  elettrodomestici: 12545,
  books_music: 12800,
  libri: 12800,
  sports: 12578,
  sport: 12578,
  bikes: 12465,
  biciclette: 12465,
  real_estate: 200,
  immobili: 200,
  services: 18000,
  servizi: 18000,
  other: 13100,
  altro: 13100
};

/**
 * Builds a normalized Wallapop search URL
 */
export function buildWallapopSearchUrl(params: WallapopSearchParams): string {
  const rawDomain = (params.domain || 'it').toLowerCase().replace('wallapop.', '').replace('.com', '').trim();
  const baseUrl = WALLAPOP_DOMAINS[rawDomain] || (rawDomain.startsWith('http') ? rawDomain : `https://${rawDomain}.wallapop.com`);

  const url = new URL('/app/search', baseUrl);

  if (params.keywords && params.keywords.trim().length > 0) {
    url.searchParams.set('keywords', params.keywords.trim());
  }

  if (params.categoryId) {
    const catId = typeof params.categoryId === 'string' && WALLAPOP_CATEGORIES[params.categoryId.toLowerCase()]
      ? WALLAPOP_CATEGORIES[params.categoryId.toLowerCase()]
      : params.categoryId;
    url.searchParams.set('category_ids', String(catId));
  }

  if (params.minPrice !== undefined && params.minPrice > 0) {
    url.searchParams.set('min_sale_price', params.minPrice.toString());
  }

  if (params.maxPrice !== undefined && params.maxPrice > 0) {
    url.searchParams.set('max_sale_price', params.maxPrice.toString());
  }

  if (params.orderBy) {
    url.searchParams.set('order_by', params.orderBy);
  }

  if (params.condition) {
    url.searchParams.set('condition', params.condition);
  }

  if (params.shippingOnly) {
    url.searchParams.set('shipping_allowed', 'true');
  }

  return url.toString();
}
