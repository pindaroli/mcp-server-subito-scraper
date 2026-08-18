/**
 * Utility to construct valid Subito.it search URLs
 */

export interface SubitoSearchParams {
  query?: string;
  category?: string;
  region?: string;
  minPrice?: number;
  maxPrice?: number;
  shippingOnly?: boolean;
  sortBy?: 'datedesc' | 'priceasc' | 'pricedesc' | 'relevance';
}

const CATEGORY_MAP: Record<string, string> = {
  all: 'usato',
  usato: 'usato',
  auto: 'auto',
  motori: 'auto',
  moto: 'moto-e-scooter',
  scooter: 'moto-e-scooter',
  'accessori-auto': 'accessori-auto',
  'accessori-moto': 'accessori-moto',
  caravan: 'caravan-e-camper',
  camper: 'caravan-e-camper',
  nautica: 'nautica',
  veicoli_commerciali: 'veicoli-commerciali',
  immobili: 'appartamenti',
  case: 'appartamenti',
  appartamenti: 'appartamenti',
  'immobili-affitto': 'appartamenti',
  ville: 'ville-singole-e-a-schiera',
  terreni: 'terreni-e-rustici',
  uffici: 'uffici-e-locali-commerciali',
  informatica: 'informatica',
  telefonia: 'telefonia',
  'audio-video': 'audio-video',
  fotografia: 'fotografia',
  videogiochi: 'videogiochi',
  elettrodomestici: 'elettrodomestici',
  arredamento: 'arredamento-casalinghi',
  'arredamento-casalinghi': 'arredamento-casalinghi',
  abbigliamento: 'abbigliamento',
  accessori: 'accessori-abbigliamento',
  orologi: 'orologi',
  sport: 'sport',
  biciclette: 'biciclette',
  musica: 'strumenti-musicali',
  libri: 'libri-e-riviste',
  collezionismo: 'collezionismo',
  giardino: 'giardino-fai-da-te',
  animali: 'animali',
  lavoro: 'lavoro',
  servizi: 'servizi'
};

const REGION_MAP: Record<string, string> = {
  italia: 'italia',
  abruzzo: 'abruzzo',
  basilicata: 'basilicata',
  calabria: 'calabria',
  campania: 'campania',
  'emilia-romagna': 'emilia-romagna',
  emiliaromagna: 'emilia-romagna',
  'friuli-venezia-giulia': 'friuli-venezia-giulia',
  friuli: 'friuli-venezia-giulia',
  lazio: 'lazio',
  liguria: 'liguria',
  lombardia: 'lombardia',
  marche: 'marche',
  molise: 'molise',
  piemonte: 'piemonte',
  puglia: 'puglia',
  sardegna: 'sardegna',
  sicilia: 'sicilia',
  toscana: 'toscana',
  'trentino-alto-adige': 'trentino-alto-adige',
  trentino: 'trentino-alto-adige',
  umbria: 'umbria',
  'valle-daosta': 'valle-daosta',
  valledaosta: 'valle-daosta',
  veneto: 'veneto'
};

export function buildSubitoSearchUrl(params: SubitoSearchParams): string {
  const rawRegion = (params.region || 'italia').toLowerCase().trim().replace(/\s+/g, '-');
  const region = REGION_MAP[rawRegion] || 'italia';

  const rawCat = (params.category || 'usato').toLowerCase().trim();
  const category = CATEGORY_MAP[rawCat] || (rawCat.length > 0 ? rawCat.replace(/\s+/g, '-') : 'usato');

  const isAffitto = rawCat.includes('affitto');
  const transaction = isAffitto ? 'affitto' : 'vendita';

  const baseUrl = `https://www.subito.it/annunci-${region}/${transaction}/${category}/`;
  const url = new URL(baseUrl);

  if (params.query && params.query.trim().length > 0) {
    url.searchParams.set('q', params.query.trim());
  }

  if (params.minPrice !== undefined && params.minPrice > 0) {
    url.searchParams.set('ps', params.minPrice.toString());
  }

  if (params.maxPrice !== undefined && params.maxPrice > 0) {
    url.searchParams.set('pe', params.maxPrice.toString());
  }

  if (params.shippingOnly) {
    url.searchParams.set('shp', 'true');
  }

  if (params.sortBy && params.sortBy !== 'relevance') {
    url.searchParams.set('order', params.sortBy);
  }

  return url.toString();
}
