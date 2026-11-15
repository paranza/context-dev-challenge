import type { CompanyProfile } from "./types";

export type ProcurementType = "works" | "supplies" | "services";
export type DiscoveryCluster = { label: string; cpvPrefixes: string[]; terms: string[]; queryTerms: string[] };
export type DiscoveryPlan = {
  primaryCountry?: string;
  countries: string[];
  homeRegion?: string;
  neighboringCountries?: string[];
  operatingCountries?: string[];
  international: boolean;
  procurementTypes: ProcurementType[];
  supportedTrades?: string[];
  clusters: DiscoveryCluster[];
  queries: { query: string; countryCode?: string; region?: string; cluster: string }[];
};
export type VerifiedGeography = { homeCountry?: string; homeRegion?: string; neighboringCountries?: string[]; operatingCountries?: string[]; deliveryCountries?: string[]; internationalDelivery?: boolean };
export type CandidateMetadata = {
  title: string;
  description: string;
  countryCode?: string;
  countryBasis?: string;
  region?: string;
  location?: string;
  cpvCodes?: string[];
  noticeType?: string;
  deadline?: string;
};
export type CandidateAssessment = {
  relevant: boolean;
  score: number;
  reason: string;
  geography: "domestic" | "operating" | "international" | "unknown";
  matchedCluster?: string;
  needsReview?: boolean;
  geographicPriority?: "home_region" | "domestic" | "operating" | "neighboring" | "europe" | "international" | "unknown";
};

const unique = <T,>(values: T[]) => [...new Set(values)];
const normalize = (value: string) => value.toLowerCase().replace(/ß/g, "ss").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// Phrase boundaries prevent e.g. "rail" matching "trailer". Final stems accept
// inflections used in multilingual notice titles without requiring translation.
function contains(text: string, term: string): boolean {
  const words = normalize(term).split(" ").filter(Boolean);
  return words.length > 0 && new RegExp(`(?:^| )${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[a-z]* ")}[a-z]*(?: |$)`).test(text);
}

const COUNTRY_NAMES: Record<string, string[]> = {
  IT: ["italy", "italia", "italien", "italie"], DE: ["germany", "deutschland", "germania", "allemagne"],
  FI: ["finland", "suomi", "finlandia"], FR: ["france", "francia", "frankreich"], ES: ["spain", "espana", "spagna", "spanien"],
  PT: ["portugal", "portogallo"], NL: ["netherlands", "nederland", "paesi bassi"], BE: ["belgium", "belgie", "belgique", "belgio"],
  AT: ["austria", "osterreich"], CH: ["switzerland", "schweiz", "svizzera", "suisse"], GB: ["united kingdom", "great britain", "regno unito", "uk", "england", "scotland", "wales", "northern ireland"],
  IE: ["ireland", "irlanda"], SE: ["sweden", "sverige", "svezia"], NO: ["norway", "norge", "norvegia"], DK: ["denmark", "danmark", "danimarca"],
  PL: ["poland", "polska", "polonia"], CZ: ["czech republic", "czechia", "repubblica ceca"], SK: ["slovakia", "slovensko"],
  HU: ["hungary", "magyarorszag", "ungheria"], RO: ["romania"], BG: ["bulgaria"], GR: ["greece", "hellas", "grecia"],
  HR: ["croatia", "hrvatska", "croazia"], SI: ["slovenia", "slovenija"], EE: ["estonia", "eesti"], LV: ["latvia", "latvija"], LT: ["lithuania", "lietuva"],
  LU: ["luxembourg", "lussemburgo"], MT: ["malta"], CY: ["cyprus", "cipro"], IS: ["iceland", "islanda"],
  LI: ["liechtenstein"], AD: ["andorra"], SM: ["san marino"], VA: ["vatican", "vatican city"], RS: ["serbia"], BA: ["bosnia", "bosnia and herzegovina"], ME: ["montenegro"], AL: ["albania"], MK: ["north macedonia"], UA: ["ukraine"], MD: ["moldova"], BY: ["belarus"], RU: ["russia"],
  US: ["united states", "united states of america", "usa", "stati uniti"], CA: ["canada"], CN: ["china", "cina"], AU: ["australia"], IN: ["india"], JP: ["japan", "giappone"],
};
// Regions are deliberately bounded. A city, TLD or vague "Europe" must never
// become evidence of delivery to an entire country or continent.
const REGION_COUNTRIES: Record<string, string> = {
  lombardia: "IT", lombardy: "IT", veneto: "IT", piemonte: "IT", piedmont: "IT", liguria: "IT", toscana: "IT", tuscany: "IT", lazio: "IT", campania: "IT", puglia: "IT", sicilia: "IT", sardegna: "IT", "emilia romagna": "IT", "friuli venezia giulia": "IT", "trentino alto adige": "IT", marche: "IT", umbria: "IT", abruzzo: "IT", calabria: "IT", basilicata: "IT", molise: "IT", "valle d aosta": "IT",
  bavaria: "DE", bayern: "DE", "baden wurttemberg": "DE", "nordrhein westfalen": "DE", "north rhine westphalia": "DE", hessen: "DE", saxony: "DE", sachsen: "DE", "lower saxony": "DE", niedersachsen: "DE", uusimaa: "FI", pirkanmaa: "FI", "varsinais suomi": "FI", lapland: "FI", "ile de france": "FR", catalonia: "ES", catalunya: "ES", andalucia: "ES",
};
export function normalizeCountryCode(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = normalize(value);
  const code = normalized.toUpperCase();
  if (code === "UK") return "GB";
  if (code === "EL") return "GR";
  if (COUNTRY_NAMES[code]) return code;
  for (const [candidate, names] of Object.entries(COUNTRY_NAMES)) if (names.includes(normalized)) return candidate;
  return REGION_COUNTRIES[normalized] ?? regionIn(value)?.country;
}
function countriesIn(values: string[]): string[] {
  return unique(values.flatMap((value) => {
    const exact = normalizeCountryCode(value);
    if (exact) return [exact];
    const text = normalize(value);
    const named = Object.entries(COUNTRY_NAMES).filter(([, names]) => names.some((name) => contains(text, name))).map(([code]) => code);
    const regions = Object.entries(REGION_COUNTRIES).filter(([region]) => contains(text, region)).map(([, code]) => code);
    const codes = value.split(/[,;/|\s]+/).filter((token) => /^[A-Z]{2}$/.test(token)).map(normalizeCountryCode).filter((code): code is string => Boolean(code));
    return [...named, ...regions, ...codes];
  }));
}

type Family = DiscoveryCluster & { types: ProcurementType[]; related: string[] };
const family = (label: string, cpvPrefixes: string[], terms: string[], queryTerms: string[], related: string[], types: ProcurementType[] = ["works"]): Family => ({ label, cpvPrefixes, terms, queryTerms, related, types });
const AMBIGUOUS_TERMS = new Set(["asphalt", "asfalt", "pavimentazion", "infrastruttur", "hvac", "hkls", "chaufferie", "climatizzazion", "condizionamento", "elektrotechnik", "klimatechnik", "acquedott", "fognatur", "reti idric", "vesihuolto", "ponti", "gallerie"]);
const constructionContext = (text: string) => /\b(construction|contractor|roadworks|installation[a-z]*|renovation|rehabilitation|demolition|earthworks|lavori|costruzion[a-z]*|installazion[a-z]*|ristrutturazion[a-z]*|realizzazion[a-z]*|posa|manutenzion[a-z]*|bau[a-z]*|[a-z]*bau|[a-z]*arbeiten|sanierung|[a-z]*urak[a-z]*|[a-z]*rakenn[a-z]*)\b/.test(text);
// Construction scope is explicit. Supplying a component or selling software does
// not establish the capability to construct the system that incorporates it.
const FAMILIES: Family[] = [
  family("Road construction and surfacing", ["452331", "452332"], ["road construction", "road maintenance", "road surfacing", "asphalt", "costruzion stradal", "manutenzione stradal", "lavori stradal", "pavimentazion", "asfalt", "strassenbau", "strassensanierung", "tienrakenn", "paallyst"], ["road construction surfacing", "lavori stradali asfaltatura", "Straßenbau Asphalt", "tienrakennus päällystys"], ["road", "street", "strad", "paviment", "strassen", "tie"]),
  family("Earthworks and demolition", ["4511"], ["earthwork", "earthmoving", "demolition", "excavation", "movimento terra", "demolizion", "scavi", "abbruch", "erdbau", "maanrakenn", "purkuty"], ["earthworks demolition excavation", "demolizioni movimento terra", "Abbruch Erdarbeiten", "maanrakennus purkutyöt"], ["earth", "demolition", "excavat", "demolizion", "scav", "abbruch", "purku"]),
  family("Building construction and renovation", ["4521", "4545"], ["building construction", "building works", "building contractor", "construction of buildings", "building renovation", "building restoration", "historic building", "industrial construction", "commercial construction", "residential construction", "adaptive reuse", "building refurbishment", "travaux de batiment", "construction batiment", "gros oeuvre", "edificacion", "rehabilitacion de edificios", "restauro edilizio", "restauro monumentale", "general contractor", "general construction", "costruzion edil", "costruzion general", "impresa edile", "lavori edil", "ristrutturazion", "edilizia", "edifici civili", "hochbau", "gebaudesanierung", "talonrakenn", "rakennusurak"], ["building construction renovation", "lavori edilizia ristrutturazione", "Hochbau Gebäudesanierung", "talonrakennus peruskorjaus"], ["building", "renovation", "edific", "edil", "ristruttur", "palestra", "scuola", "ospedale", "school", "hospital", "residential", "hochbau", "schule", "wohngebaude", "rakennus", "koulu"]),
  family("Civil infrastructure works", ["4522"], ["civil engineering works", "civil construction", "civil infrastructure", "infrastruttur", "opere civili", "tiefbau", "infrarakent"], ["civil infrastructure engineering works", "opere civili infrastrutture", "Tiefbau Infrastruktur", "infrarakentaminen"], ["civil", "infrastruttur", "tiefbau", "infra"]),
  family("Structural concrete and masonry works", ["452623", "452625"], ["concrete construction", "structural concrete", "concrete works", "masonry works", "reinforced concrete", "opere in calcestruzzo", "cemento armato", "lavori in muratura", "betonbau", "betonarbeiten", "mauerarbeit", "rohbau", "betonityo", "muuraustyo"], ["structural concrete masonry works", "opere calcestruzzo cemento armato muratura", "Rohbau Betonarbeiten Mauerarbeiten", "betonityöt muuraustyöt"], ["concrete", "masonry", "calcestruzzo", "cemento", "muratur", "beton", "mauer", "rohbau", "muuraus"]),
  family("Bridge and tunnel construction", ["45221"], ["bridge construction", "bridge rehabilitation", "tunnel construction", "bridge repair", "costruzion pont", "ponti", "gallerie", "bruckenbau", "tunnelbau", "sillanrakenn", "tunnelirakenn"], ["bridge tunnel construction rehabilitation", "costruzione manutenzione ponti gallerie", "Brückenbau Tunnelbau", "sillanrakennus tunnelityöt"], ["bridge", "tunnel", "pont", "galleri", "brucken", "silta"]),
  family("Rail infrastructure works", ["452341"], ["railway construction", "rail construction", "railway maintenance", "rail infrastructure", "track construction", "lavori ferrovi", "infrastruttur ferrovi", "armamento ferrovi", "gleisbau", "bahnbau", "ratarakenn", "rautatierakenn"], ["railway track construction maintenance", "lavori ferroviari armamento", "Gleisbau Bahnbau", "ratarakentaminen kunnossapito"], ["railway", "track", "ferrovi", "gleis", "bahn", "rata"]),
  family("Electrical installation works", ["4531"], ["electrical installation", "electrical contractor", "electrical works", "impianti elettric", "installazion elettric", "lavori elettric", "elektroinstallation", "elektrotechnik", "sahkoasenn", "sahkourak"], ["electrical installation works", "lavori impianti elettrici", "Elektroinstallation", "sähköasennusurakka"], ["electrical", "elettric", "elektro", "sahko"]),
  family("HVAC and mechanical installation", ["4533"], ["hvac", "hkls", "hls installation", "heating installation", "ventilation installation", "air conditioning installation", "mechanical contractor", "chaufferie", "impianti termic", "impianti meccanic", "climatizzazion", "condizionamento", "heizungsbau", "luftungsbau", "klimatechnik", "lvi urak", "ilmanvaihtourak"], ["HVAC heating ventilation installation", "impianti termici climatizzazione", "Heizungsbau Lüftungsbau HKLS", "LVI ilmanvaihtourakka"], ["heating", "ventilation", "hvac", "hkls", "hls", "chaufferie", "termic", "climatizz", "heizung", "luftung", "ilmanvaihto"]),
  family("Water and sewer infrastructure", ["452313", "45232", "452324", "452521"], ["water pipeline construction", "sewer construction", "water infrastructure", "wastewater treatment construction", "aqueduct", "acquedott", "fognatur", "reti idric", "kanalbau", "wasserleitungsbau", "vesihuolto", "viemarirakenn"], ["water sewer pipeline construction", "lavori acquedotti fognature reti idriche", "Kanalbau Wasserleitungsbau", "vesihuolto viemärirakentaminen"], ["water", "sewer", "pipeline", "acquedott", "fogn", "idric", "kanal", "wasser", "vesi", "viemari"]),
  family("Environmental remediation and site preparation", ["451123", "907323", "45262660"], ["environmental remediation", "soil remediation", "site remediation", "asbestos removal", "bonifica ambient", "bonifiche", "bonifica amianto", "rimozione amianto", "altlastensanierung", "asbestsanierung", "maaperan kunnost", "asbestipurku"], ["soil remediation asbestos removal", "bonifica ambientale rimozione amianto", "Altlastensanierung Asbestsanierung", "maaperän kunnostus asbestipurku"], ["remediation", "soil", "asbestos", "bonific", "amianto", "altlast", "asbest", "maapera"], ["works", "services"]),
  family("Roofing and waterproofing", ["45261"], ["roofing", "waterproofing", "roof renovation", "coperture edil", "impermeabilizzazion", "rifacimento tett", "dachdeck", "dachsanierung", "abdichtung", "kattourak", "vedenerist"], ["roofing waterproofing works", "rifacimento tetti impermeabilizzazione", "Dachsanierung Abdichtung", "kattourakka vedeneristys"], ["roof", "waterproof", "copertur", "tett", "impermeabil", "dach", "abdicht", "katto"]),
  family("Windows glazing and facade works", ["454211", "454430", "45262650"], ["window installation", "window replacement", "glazing works", "facade construction", "facade works", "posa serrament", "sostituzione infissi", "lavori facciat", "fensterbau", "fenstermontage", "fassadenbau", "fassadenarbeiten", "ikkuna asenn", "julkisivuty"], ["window installation glazing facade works", "posa serramenti infissi facciate", "Fensterbau Fassadenarbeiten Sonnenschutz", "ikkuna-asennus julkisivutyöt"], ["window", "glazing", "facade", "serrament", "infissi", "facciat", "fenster", "fassade", "sonnenschutz", "ikkuna", "julkisivu"]),
  family("Timber framing and structural carpentry", ["452611"], ["timber framing", "zimmererarbeiten", "zimmerei", "holzbau", "wood framing", "structural carpentry", "charpente bois", "charpente en bois", "carpenteria in legno", "strutture in legno", "holzbau", "holztragwerk", "puurunkotyo"], ["timber framing structural carpentry", "carpenteria strutturale legno", "Holzbau Holztragwerke", "puurunkotyöt"], ["timber", "wood", "carpentry", "charpente", "zimmererarbeiten", "zimmerei", "holzbau", "bois", "legno", "holz", "puurunko"]),
];

const SPECIALIST_TITLES: { label: string; pattern: RegExp }[] = [
  { label: "Electrical installation works", pattern: /\b(elektro[a-z]*|electrical installation[a-z]*|electrical works|impianti elettric[a-z]*|lavori elettric[a-z]*|sahko[a-z]*)\b/ },
  { label: "HVAC and mechanical installation", pattern: /\b(hkls|hls|hkl|hvac|chaufferie[a-z]*|heizung[a-z]*|luftung[a-z]*|sanitar[a-z]*|klima[a-z]*|lvi|impianti termic[a-z]*|climatizzazion[a-z]*)\b/ },
  { label: "Windows glazing and facade works", pattern: /\b(fenster[a-z]*|sonnenschutz[a-z]*|fassad[a-z]*|glazing|window installation|window replacement|facade works|facciat[a-z]*|serrament[a-z]*|infissi|ikkuna[a-z]*)\b/ },
  { label: "Roofing and waterproofing", pattern: /\b(dach[a-z]*|roofing|roof replacement|impermeabilizzazion[a-z]*|rifacimento tett[a-z]*|kattourak[a-z]*)\b/ },
  { label: "Structural concrete and masonry works", pattern: /\b(rohbau|betonarbeiten|mauerarbeiten|structural concrete|masonry works)\b/ },
  { label: "Timber framing and structural carpentry", pattern: /\b(charpente[a-z]* (?:en )?bois|timber fram[a-z]*|wood fram[a-z]*|structural carpentry|zimmerer[a-z]*|zimmerei|holzbau|holztragwerk[a-z]*|carpenteria in legno|puurunko[a-z]*)\b/ },
];
function demandedTitleTrades(rawTitle: string): string[] {
  // Explicit whole-building headings remain whole projects. Incidental M&E in
  // an "including ..." suffix or in the description does not define a trade lot.
  const heading = normalize(rawTitle).split(/\b(including|einschliesslich|inklusive|comprensivo|comprensiva|comprendente)\b/)[0];
  if (/\b(turnkey|schlusselfertig[a-z]*|chiavi in mano|general contractor|generalunternehmer|whole building)\b/.test(heading)) return [];
  const explicitLot = /\b(lot|lots|lotto|lotti|los|lose|gewerk|lote|package|packages)\b/.test(heading);
  const segments = rawTitle.split(/\s[-–—:;,|]\s*/).map(normalize);
  return SPECIALIST_TITLES.filter(({ pattern }) => {
    const match = heading.match(pattern);
    if (!match) return false;
    const startsWithTrade = match.index === 0;
    const endsWithTrade = (match.index ?? 0) + match[0].length === heading.length;
    const tradeSegment = segments.slice(1).some((segment) => segment.split(" ").length <= 9 && pattern.test(segment));
    return explicitLot || startsWithTrade || endsWithTrade || tradeSegment;
  }).map(({ label }) => label);
}

const COUNTRY_BORDERS: Record<string, string[]> = {
  IT: ["FR", "CH", "AT", "SI", "SM", "VA"], DE: ["AT", "CH", "FR", "LU", "BE", "NL", "DK", "PL", "CZ"], AT: ["IT", "DE", "CH", "LI", "SI", "HU", "SK", "CZ"], CH: ["IT", "FR", "DE", "AT", "LI"], FR: ["BE", "LU", "DE", "CH", "IT", "ES", "AD"],
  ES: ["PT", "FR", "AD"], PT: ["ES"], BE: ["FR", "LU", "DE", "NL"], NL: ["BE", "DE"], LU: ["BE", "DE", "FR"], DK: ["DE"], FI: ["SE", "NO", "RU"], SE: ["NO", "FI"], NO: ["SE", "FI", "RU"], GB: ["IE"], IE: ["GB"],
  PL: ["DE", "CZ", "SK", "UA", "BY", "LT", "RU"], CZ: ["DE", "PL", "SK", "AT"], SK: ["CZ", "PL", "UA", "HU", "AT"], HU: ["AT", "SK", "UA", "RO", "RS", "HR", "SI"], SI: ["IT", "AT", "HU", "HR"], HR: ["SI", "HU", "RS", "BA", "ME"], RO: ["HU", "RS", "BG", "MD", "UA"], BG: ["RO", "RS", "MK", "GR"], GR: ["AL", "MK", "BG"], EE: ["LV", "RU"], LV: ["EE", "LT", "BY", "RU"], LT: ["LV", "BY", "PL", "RU"],
};
const EUROPE = new Set([...Object.keys(COUNTRY_BORDERS), "MT", "CY", "IS", "LI", "AD", "SM", "VA", "RS", "BA", "ME", "AL", "MK", "UA", "MD", "BY", "RU"]);
// Bounded region aliases describe geography only, never contractor capability.
const BORDER_REGIONS = [
  { name: "Trentino-Alto Adige", country: "IT", aliases: ["trentino alto adige", "trentino", "alto adige", "sudtirol", "south tyrol", "provincia autonoma di trento", "provincia autonoma di bolzano", "ITH1", "ITH2"], neighbors: ["AT", "CH"] },
  { name: "Lombardia", country: "IT", aliases: ["lombardia", "lombardy", "ITC4"], neighbors: ["CH"] },
  { name: "Veneto", country: "IT", aliases: ["veneto", "ITH3"], neighbors: ["AT"] },
  { name: "Friuli-Venezia Giulia", country: "IT", aliases: ["friuli venezia giulia", "friuli", "ITH4"], neighbors: ["AT", "SI"] },
  { name: "Piemonte", country: "IT", aliases: ["piemonte", "piedmont", "ITC1"], neighbors: ["FR", "CH"] },
  { name: "Liguria", country: "IT", aliases: ["liguria", "ITC3"], neighbors: ["FR"] },
  { name: "Valle d'Aosta", country: "IT", aliases: ["valle d aosta", "vallee d aoste", "aosta valley", "ITC2"], neighbors: ["FR", "CH"] },
  { name: "Bayern", country: "DE", aliases: ["bayern", "bavaria", "DE2"], neighbors: ["AT", "CZ"] },
  { name: "Baden-Württemberg", country: "DE", aliases: ["baden wurttemberg", "DE1"], neighbors: ["FR", "CH"] },
  { name: "Nordrhein-Westfalen", country: "DE", aliases: ["nordrhein westfalen", "north rhine westphalia", "DEA"], neighbors: ["BE", "NL"] },
  { name: "Tirol", country: "AT", aliases: ["tirol", "tyrol", "AT33"], neighbors: ["IT", "DE", "CH"] },
  { name: "Lapland", country: "FI", aliases: ["lapland", "lappi", "FI1D7"], neighbors: ["SE", "NO", "RU"] },
  { name: "Catalonia", country: "ES", aliases: ["catalonia", "catalunya", "cataluna", "ES51"], neighbors: ["FR", "AD"] },
];
// Static EU/EFTA subset from Eurostat GISCO NUTS 2024 attribute table:
// https://gisco-services.ec.europa.eu/distribution/v2/nuts/csv/NUTS_AT_2024.csv
// Exact validated codes avoid interpreting an arbitrary city or product code as
// a region. Parent matching supports real NUTS3 codes such as ITH20 and ITC4C.
const VALID_NUTS_CODES = new Set(`AT AT1 AT11 AT111 AT112 AT113 AT12 AT121 AT122 AT123 AT124 AT125 AT126 AT127 AT13 AT130 AT2 AT21 AT211 AT212 AT213 AT22 AT221 AT222 AT223 AT224 AT225 AT226 AT3 AT31 AT311 AT312 AT313 AT314 AT315 AT32 AT321 AT322 AT323 AT33 AT331 AT332 AT333 AT334 AT335 AT34 AT341 AT342 BE BE1 BE10 BE100 BE2 BE21 BE211 BE212 BE213 BE22 BE223 BE224 BE225 BE23 BE231 BE232 BE233 BE234 BE235 BE236 BE24 BE241 BE242 BE25 BE251 BE252 BE253 BE254 BE255 BE256 BE257 BE258 BE3 BE31 BE310 BE32 BE323 BE328 BE329 BE32A BE32B BE32C BE32D BE33 BE331 BE332 BE334 BE335 BE336 BE34 BE341 BE342 BE343 BE344 BE345 BE35 BE351 BE352 BE353 BG BG3 BG31 BG311 BG312 BG313 BG314 BG315 BG32 BG321 BG322 BG323 BG324 BG325 BG33 BG331 BG332 BG333 BG334 BG34 BG341 BG342 BG343 BG344 BG4 BG41 BG411 BG412 BG413 BG414 BG415 BG42 BG421 BG422 BG423 BG424 BG425 CH CH0 CH01 CH011 CH012 CH013 CH02 CH021 CH022 CH023 CH024 CH025 CH03 CH031 CH032 CH033 CH04 CH040 CH05 CH051 CH052 CH053 CH054 CH055 CH056 CH057 CH06 CH061 CH062 CH063 CH064 CH065 CH066 CH07 CH070 CY CY0 CY00 CY000 CZ CZ0 CZ01 CZ010 CZ02 CZ020 CZ03 CZ031 CZ032 CZ04 CZ041 CZ042 CZ05 CZ051 CZ052 CZ053 CZ06 CZ063 CZ064 CZ07 CZ071 CZ072 CZ08 CZ080 DE DE1 DE11 DE111 DE112 DE113 DE114 DE115 DE116 DE117 DE118 DE119 DE11A DE11B DE11C DE11D DE12 DE121 DE122 DE123 DE124 DE125 DE126 DE127 DE128 DE129 DE12A DE12B DE12C DE13 DE131 DE132 DE133 DE134 DE135 DE136 DE137 DE138 DE139 DE13A DE14 DE141 DE142 DE143 DE144 DE145 DE146 DE147 DE148 DE149 DE2 DE21 DE211 DE212 DE213 DE214 DE215 DE216 DE217 DE218 DE219 DE21A DE21B DE21C DE21D DE21E DE21F DE21G DE21H DE21I DE21J DE21K DE21L DE21M DE21N DE22 DE221 DE222 DE223 DE224 DE225 DE226 DE227 DE228 DE229 DE22A DE22B DE22C DE23 DE231 DE232 DE233 DE234 DE235 DE236 DE237 DE238 DE239 DE23A DE24 DE241 DE242 DE243 DE244 DE245 DE246 DE247 DE248 DE249 DE24A DE24B DE24C DE24D DE25 DE251 DE252 DE253 DE254 DE255 DE256 DE257 DE258 DE259 DE25A DE25B DE25C DE26 DE261 DE262 DE263 DE264 DE265 DE266 DE267 DE268 DE269 DE26A DE26B DE26C DE27 DE271 DE272 DE273 DE274 DE275 DE276 DE277 DE278 DE279 DE27A DE27B DE27C DE27D DE27E DE3 DE30 DE300 DE4 DE40 DE401 DE402 DE403 DE404 DE405 DE406 DE407 DE408 DE409 DE40A DE40B DE40C DE40D DE40E DE40F DE40G DE40H DE40I DE5 DE50 DE501 DE502 DE6 DE60 DE600 DE7 DE71 DE711 DE712 DE713 DE714 DE715 DE716 DE717 DE718 DE719 DE71A DE71B DE71C DE71D DE71E DE72 DE721 DE722 DE723 DE724 DE725 DE73 DE731 DE732 DE733 DE734 DE735 DE736 DE737 DE8 DE80 DE803 DE804 DE80J DE80K DE80L DE80M DE80N DE80O DE9 DE91 DE911 DE912 DE913 DE914 DE916 DE917 DE918 DE91A DE91B DE91C DE92 DE922 DE923 DE925 DE926 DE927 DE928 DE929 DE93 DE931 DE932 DE933 DE934 DE935 DE936 DE937 DE938 DE939 DE93A DE93B DE94 DE941 DE942 DE943 DE944 DE945 DE946 DE947 DE948 DE949 DE94A DE94B DE94C DE94D DE94E DE94F DE94G DE94H DEA DEA1 DEA11 DEA12 DEA13 DEA14 DEA15 DEA16 DEA17 DEA18 DEA19 DEA1A DEA1B DEA1C DEA1D DEA1E DEA1F DEA2 DEA22 DEA23 DEA24 DEA26 DEA27 DEA28 DEA29 DEA2A DEA2B DEA2C DEA2D DEA3 DEA31 DEA32 DEA33 DEA34 DEA35 DEA36 DEA37 DEA38 DEA4 DEA41 DEA42 DEA43 DEA44 DEA45 DEA46 DEA47 DEA5 DEA51 DEA52 DEA53 DEA54 DEA55 DEA56 DEA57 DEA58 DEA59 DEA5A DEA5B DEA5C DEB DEB1 DEB11 DEB12 DEB13 DEB14 DEB15 DEB17 DEB18 DEB1A DEB1B DEB1C DEB1D DEB2 DEB21 DEB22 DEB23 DEB24 DEB25 DEB3 DEB31 DEB32 DEB33 DEB34 DEB35 DEB36 DEB37 DEB38 DEB39 DEB3A DEB3B DEB3C DEB3D DEB3E DEB3F DEB3G DEB3H DEB3I DEB3J DEB3K DEC DEC0 DEC01 DEC02 DEC03 DEC04 DEC05 DEC06 DED DED2 DED21 DED2C DED2D DED2E DED2F DED4 DED41 DED42 DED43 DED44 DED45 DED5 DED51 DED52 DED53 DEE DEE0 DEE01 DEE02 DEE03 DEE04 DEE05 DEE06 DEE07 DEE08 DEE09 DEE0A DEE0B DEE0C DEE0D DEE0E DEF DEF0 DEF01 DEF02 DEF03 DEF04 DEF05 DEF06 DEF07 DEF08 DEF09 DEF0A DEF0B DEF0C DEF0D DEF0E DEF0F DEG DEG0 DEG01 DEG02 DEG03 DEG05 DEG06 DEG07 DEG09 DEG0A DEG0C DEG0D DEG0E DEG0G DEG0J DEG0K DEG0L DEG0M DEG0Q DEG0R DEG0S DEG0T DEG0U DEG0V DK DK0 DK01 DK011 DK012 DK013 DK014 DK02 DK021 DK022 DK03 DK031 DK032 DK04 DK041 DK042 DK05 DK050 EE EE0 EE00 EE001 EE004 EE008 EE009 EE00A EL EL3 EL30 EL301 EL302 EL303 EL304 EL305 EL306 EL307 EL4 EL41 EL411 EL412 EL413 EL42 EL421 EL422 EL43 EL431 EL432 EL433 EL434 EL5 EL51 EL511 EL512 EL513 EL514 EL515 EL52 EL521 EL522 EL523 EL524 EL525 EL526 EL527 EL53 EL531 EL532 EL533 EL54 EL541 EL542 EL543 EL6 EL61 EL611 EL612 EL613 EL62 EL621 EL622 EL623 EL624 EL63 EL631 EL632 EL633 EL64 EL641 EL642 EL643 EL644 EL645 EL65 EL651 EL652 EL653 ES ES1 ES11 ES111 ES112 ES113 ES114 ES12 ES120 ES13 ES130 ES2 ES21 ES211 ES212 ES213 ES22 ES220 ES23 ES230 ES24 ES241 ES242 ES243 ES3 ES30 ES300 ES4 ES41 ES411 ES412 ES413 ES414 ES415 ES416 ES417 ES418 ES419 ES42 ES421 ES422 ES423 ES424 ES425 ES43 ES431 ES432 ES5 ES51 ES511 ES512 ES513 ES514 ES52 ES521 ES522 ES523 ES53 ES531 ES532 ES533 ES6 ES61 ES611 ES612 ES613 ES614 ES615 ES616 ES617 ES618 ES62 ES620 ES63 ES630 ES64 ES640 ES7 ES70 ES703 ES704 ES705 ES706 ES707 ES708 ES709 FI FI1 FI19 FI196 FI198 FI199 FI19A FI19B FI1B FI1B1 FI1C FI1C1 FI1C2 FI1C5 FI1C6 FI1C7 FI1D FI1D5 FI1D7 FI1D8 FI1D9 FI1DA FI1DB FI1DC FI2 FI20 FI200 FR FR1 FR10 FR101 FR102 FR103 FR104 FR105 FR106 FR107 FR108 FRB FRB0 FRB01 FRB02 FRB03 FRB04 FRB05 FRB06 FRC FRC1 FRC11 FRC12 FRC13 FRC14 FRC2 FRC21 FRC22 FRC23 FRC24 FRD FRD1 FRD11 FRD12 FRD13 FRD2 FRD21 FRD22 FRE FRE1 FRE11 FRE12 FRE2 FRE21 FRE22 FRE23 FRF FRF1 FRF11 FRF12 FRF2 FRF21 FRF22 FRF23 FRF24 FRF3 FRF31 FRF32 FRF33 FRF34 FRG FRG0 FRG01 FRG02 FRG03 FRG04 FRG05 FRH FRH0 FRH01 FRH02 FRH03 FRH04 FRI FRI1 FRI11 FRI12 FRI13 FRI14 FRI15 FRI2 FRI21 FRI22 FRI23 FRI3 FRI31 FRI32 FRI33 FRI34 FRJ FRJ1 FRJ11 FRJ12 FRJ13 FRJ14 FRJ15 FRJ2 FRJ21 FRJ22 FRJ23 FRJ24 FRJ25 FRJ26 FRJ27 FRJ28 FRK FRK1 FRK11 FRK12 FRK13 FRK14 FRK2 FRK21 FRK22 FRK23 FRK24 FRK25 FRK26 FRK27 FRK28 FRL FRL0 FRL01 FRL02 FRL03 FRL04 FRL05 FRL06 FRM FRM0 FRM01 FRM02 FRY FRY1 FRY10 FRY2 FRY20 FRY3 FRY30 FRY4 FRY40 FRY5 FRY50 HR HR0 HR02 HR021 HR022 HR023 HR024 HR025 HR026 HR027 HR028 HR03 HR031 HR032 HR033 HR034 HR035 HR036 HR037 HR05 HR050 HR06 HR061 HR062 HR063 HR064 HR065 HU HU1 HU11 HU110 HU12 HU120 HU2 HU21 HU211 HU212 HU213 HU22 HU221 HU222 HU223 HU23 HU231 HU232 HU233 HU3 HU31 HU311 HU312 HU313 HU32 HU321 HU322 HU323 HU33 HU331 HU332 HU333 IE IE0 IE04 IE041 IE042 IE05 IE051 IE052 IE053 IE06 IE061 IE062 IE063 IS IS0 IS00 IS001 IS002 IT ITC ITC1 ITC11 ITC12 ITC13 ITC14 ITC15 ITC16 ITC17 ITC18 ITC2 ITC20 ITC3 ITC31 ITC32 ITC33 ITC34 ITC4 ITC41 ITC42 ITC43 ITC44 ITC46 ITC47 ITC48 ITC49 ITC4A ITC4B ITC4C ITC4D ITF ITF1 ITF11 ITF12 ITF13 ITF14 ITF2 ITF21 ITF22 ITF3 ITF31 ITF32 ITF33 ITF34 ITF35 ITF4 ITF43 ITF44 ITF45 ITF46 ITF47 ITF48 ITF5 ITF51 ITF52 ITF6 ITF61 ITF62 ITF63 ITF64 ITF65 ITG ITG1 ITG11 ITG12 ITG13 ITG14 ITG15 ITG16 ITG17 ITG18 ITG19 ITG2 ITG2D ITG2E ITG2F ITG2G ITG2H ITH ITH1 ITH10 ITH2 ITH20 ITH3 ITH31 ITH32 ITH33 ITH34 ITH35 ITH36 ITH37 ITH4 ITH41 ITH42 ITH43 ITH44 ITH5 ITH51 ITH52 ITH53 ITH54 ITH55 ITH56 ITH57 ITH58 ITH59 ITI ITI1 ITI11 ITI12 ITI13 ITI14 ITI15 ITI16 ITI17 ITI18 ITI19 ITI1A ITI2 ITI21 ITI22 ITI3 ITI31 ITI32 ITI33 ITI34 ITI35 ITI4 ITI41 ITI42 ITI43 ITI44 ITI45 LI LI0 LI00 LI000 LT LT0 LT01 LT011 LT02 LT021 LT022 LT023 LT024 LT025 LT026 LT027 LT028 LT029 LU LU0 LU00 LU000 LV LV0 LV00 LV005 LV009 LV00A LV00B LV00C MT MT0 MT00 MT001 MT002 NL NL1 NL11 NL112 NL114 NL115 NL12 NL126 NL127 NL128 NL13 NL131 NL132 NL133 NL2 NL21 NL211 NL212 NL213 NL22 NL221 NL224 NL225 NL226 NL23 NL230 NL3 NL32 NL321 NL323 NL325 NL327 NL328 NL32A NL32B NL34 NL341 NL342 NL35 NL350 NL36 NL361 NL362 NL363 NL364 NL365 NL366 NL4 NL41 NL411 NL414 NL415 NL416 NL42 NL421 NL422 NL423 NO NO0 NO02 NO020 NO06 NO060 NO07 NO071 NO072 NO073 NO08 NO081 NO083 NO084 NO085 NO09 NO092 NO093 NO094 NO0A NO0A1 NO0A2 NO0A3 NO0B NO0B1 NO0B2 PL PL2 PL21 PL213 PL214 PL217 PL218 PL219 PL21A PL22 PL224 PL225 PL227 PL228 PL229 PL22A PL22B PL22C PL4 PL41 PL411 PL414 PL415 PL416 PL417 PL418 PL42 PL424 PL426 PL427 PL428 PL43 PL431 PL432 PL5 PL51 PL514 PL515 PL516 PL517 PL518 PL52 PL523 PL524 PL6 PL61 PL613 PL616 PL617 PL618 PL619 PL62 PL621 PL622 PL623 PL63 PL633 PL634 PL636 PL637 PL638 PL7 PL71 PL711 PL712 PL713 PL714 PL715 PL72 PL721 PL722 PL8 PL81 PL811 PL812 PL814 PL815 PL82 PL821 PL822 PL823 PL824 PL84 PL841 PL842 PL843 PL9 PL91 PL911 PL912 PL913 PL92 PL921 PL922 PL923 PL924 PL925 PL926 PT PT1 PT11 PT111 PT112 PT119 PT11A PT11B PT11C PT11D PT11E PT15 PT150 PT19 PT191 PT192 PT193 PT194 PT195 PT196 PT1A PT1A0 PT1B PT1B0 PT1C PT1C1 PT1C2 PT1C3 PT1C4 PT1D PT1D1 PT1D2 PT1D3 PT2 PT20 PT200 PT3 PT30 PT300 RO RO1 RO11 RO111 RO112 RO113 RO114 RO115 RO116 RO12 RO121 RO122 RO123 RO124 RO125 RO126 RO2 RO21 RO211 RO212 RO213 RO214 RO215 RO216 RO22 RO221 RO222 RO223 RO224 RO225 RO226 RO3 RO31 RO311 RO312 RO313 RO314 RO315 RO316 RO317 RO32 RO321 RO322 RO4 RO41 RO411 RO412 RO413 RO414 RO415 RO42 RO421 RO422 RO423 RO424 SE SE1 SE11 SE110 SE12 SE121 SE122 SE123 SE124 SE125 SE2 SE21 SE211 SE212 SE213 SE214 SE22 SE221 SE224 SE23 SE231 SE232 SE3 SE31 SE311 SE312 SE313 SE32 SE321 SE322 SE33 SE331 SE332 SI SI0 SI03 SI031 SI032 SI033 SI034 SI035 SI036 SI037 SI038 SI04 SI041 SI042 SI043 SI044 SK SK0 SK01 SK010 SK02 SK021 SK022 SK023 SK03 SK031 SK032 SK04 SK041 SK042`.split(" "));
const NUTS2_DATA = `AT11|Burgenland
AT12|Niederösterreich
AT13|Wien
AT21|Kärnten
AT22|Steiermark
AT31|Oberösterreich
AT32|Salzburg
AT33|Tirol
AT34|Vorarlberg
BE10|Région de Bruxelles-Capitale/ Brussels Hoofdstedelijk Gewest
BE21|Prov. Antwerpen
BE22|Prov. Limburg (BE)
BE23|Prov. Oost-Vlaanderen
BE24|Prov. Vlaams-Brabant
BE25|Prov. West-Vlaanderen
BE31|Prov. Brabant wallon
BE32|Prov. Hainaut
BE33|Prov. Liège
BE34|Prov. Luxembourg (BE)
BE35|Prov. Namur
BG31|Severozapaden
BG32|Severen tsentralen
BG33|Severoiztochen
BG34|Yugoiztochen
BG41|Yugozapaden
BG42|Yuzhen tsentralen
CH01|Région lémanique
CH02|Espace Mittelland
CH03|Nordwestschweiz
CH04|Zürich
CH05|Ostschweiz
CH06|Zentralschweiz
CH07|Ticino
CY00|Kýpros
CZ01|Praha
CZ02|Střední Čechy
CZ03|Jihozápad
CZ04|Severozápad
CZ05|Severovýchod
CZ06|Jihovýchod
CZ07|Střední Morava
CZ08|Moravskoslezsko
DE11|Stuttgart
DE12|Karlsruhe
DE13|Freiburg
DE14|Tübingen
DE21|Oberbayern
DE22|Niederbayern
DE23|Oberpfalz
DE24|Oberfranken
DE25|Mittelfranken
DE26|Unterfranken
DE27|Schwaben
DE30|Berlin
DE40|Brandenburg
DE50|Bremen
DE60|Hamburg
DE71|Darmstadt
DE72|Gießen
DE73|Kassel
DE80|Mecklenburg-Vorpommern
DE91|Braunschweig
DE92|Hannover
DE93|Lüneburg
DE94|Weser-Ems
DEA1|Düsseldorf
DEA2|Köln
DEA3|Münster
DEA4|Detmold
DEA5|Arnsberg
DEB1|Koblenz
DEB2|Trier
DEB3|Rheinhessen-Pfalz
DEC0|Saarland
DED2|Dresden
DED4|Chemnitz
DED5|Leipzig
DEE0|Sachsen-Anhalt
DEF0|Schleswig-Holstein
DEG0|Thüringen
DK01|Hovedstaden
DK02|Sjælland
DK03|Syddanmark
DK04|Midtjylland
DK05|Nordjylland
EE00|Eesti
EL30|Attiki
EL41|Voreio Aigaio
EL42|Notio Aigaio
EL43|Kriti
EL51|Anatoliki Makedonia, Thraki
EL52|Kentriki Makedonia
EL53|Dytiki Makedonia
EL54|Ipeiros
EL61|Thessalia
EL62|Ionia Nisia
EL63|Dytiki Elláda
EL64|Sterea Elláda
EL65|Peloponnisos
ES11|Galicia
ES12|Principado de Asturias
ES13|Cantabria
ES21|País Vasco
ES22|Comunidad Foral de Navarra
ES23|La Rioja
ES24|Aragón
ES30|Comunidad de Madrid
ES41|Castilla y León
ES42|Castilla-La Mancha
ES43|Extremadura
ES51|Cataluña
ES52|Comunitat Valenciana
ES53|Illes Balears
ES61|Andalucía
ES62|Región de Murcia
ES63|Ciudad de Ceuta
ES64|Ciudad de Melilla
ES70|Canarias
FI19|Länsi-Suomi
FI1B|Helsinki-Uusimaa
FI1C|Etelä-Suomi
FI1D|Pohjois- ja Itä-Suomi
FI20|Åland
FR10|Ile-de-France
FRB0|Centre — Val de Loire
FRC1|Bourgogne
FRC2|Franche-Comté
FRD1|Basse-Normandie
FRD2|Haute-Normandie
FRE1|Nord-Pas de Calais
FRE2|Picardie
FRF1|Alsace
FRF2|Champagne-Ardenne
FRF3|Lorraine
FRG0|Pays de la Loire
FRH0|Bretagne
FRI1|Aquitaine
FRI2|Limousin
FRI3|Poitou-Charentes
FRJ1|Languedoc-Roussillon
FRJ2|Midi-Pyrénées
FRK1|Auvergne
FRK2|Rhône-Alpes
FRL0|Provence-Alpes-Côte d’Azur
FRM0|Corse
FRY1|Guadeloupe
FRY2|Martinique
FRY3|Guyane
FRY4|La Réunion
FRY5|Mayotte
HR02|Panonska Hrvatska
HR03|Jadranska Hrvatska
HR05|Grad Zagreb
HR06|Sjeverna Hrvatska
HU11|Budapest
HU12|Pest
HU21|Közép-Dunántúl
HU22|Nyugat-Dunántúl
HU23|Dél-Dunántúl
HU31|Észak-Magyarország
HU32|Észak-Alföld
HU33|Dél-Alföld
IE04|Northern and Western
IE05|Southern
IE06|Eastern and Midland
IS00|Ísland
ITC1|Piemonte
ITC2|Valle d’Aosta/Vallée d’Aoste
ITC3|Liguria
ITC4|Lombardia
ITF1|Abruzzo
ITF2|Molise
ITF3|Campania
ITF4|Puglia
ITF5|Basilicata
ITF6|Calabria
ITG1|Sicilia
ITG2|Sardegna
ITH1|Provincia Autonoma di Bolzano/Bozen
ITH2|Provincia Autonoma di Trento
ITH3|Veneto
ITH4|Friuli-Venezia Giulia
ITH5|Emilia-Romagna
ITI1|Toscana
ITI2|Umbria
ITI3|Marche
ITI4|Lazio
LI00|Liechtenstein
LT01|Sostinės regionas
LT02|Vidurio ir vakarų Lietuvos regionas
LU00|Luxembourg
LV00|Latvija
MT00|Malta
NL11|Groningen
NL12|Friesland (NL)
NL13|Drenthe
NL21|Overijssel
NL22|Gelderland
NL23|Flevoland
NL32|Noord-Holland
NL34|Zeeland
NL35|Utrecht
NL36|Zuid-Holland
NL41|Noord-Brabant
NL42|Limburg (NL)
NO02|Innlandet
NO06|Trøndelag/Trööndelage
NO07|Nord-Norge
NO08|Oslo og Viken
NO09|Agder og Sør-Østlandet
NO0A|Vestlandet
NO0B|Svalbard og Jan Mayen
PL21|Małopolskie
PL22|Śląskie
PL41|Wielkopolskie
PL42|Zachodniopomorskie
PL43|Lubuskie
PL51|Dolnośląskie
PL52|Opolskie
PL61|Kujawsko-pomorskie
PL62|Warmińsko-mazurskie
PL63|Pomorskie
PL71|Łódzkie
PL72|Świętokrzyskie
PL81|Lubelskie
PL82|Podkarpackie
PL84|Podlaskie
PL91|Warszawski stołeczny
PL92|Mazowiecki regionalny
PT11|Norte
PT15|Algarve
PT19|Centro (PT)
PT1A|Grande Lisboa
PT1B|Península de Setúbal
PT1C|Alentejo
PT1D|Oeste e Vale do Tejo
PT20|Região Autónoma dos Açores
PT30|Região Autónoma da Madeira
RO11|Nord-Vest
RO12|Centru
RO21|Nord-Est
RO22|Sud-Est
RO31|Sud-Muntenia
RO32|Bucureşti-Ilfov
RO41|Sud-Vest Oltenia
RO42|Vest
SE11|Stockholm
SE12|Östra Mellansverige
SE21|Småland med öarna
SE22|Sydsverige
SE23|Västsverige
SE31|Norra Mellansverige
SE32|Mellersta Norrland
SE33|Övre Norrland
SI03|Vzhodna Slovenija
SI04|Zahodna Slovenija
SK01|Bratislavský kraj
SK02|Západné Slovensko
SK03|Stredné Slovensko
SK04|Východné Slovensko`;
const NUTS_REGIONS = NUTS2_DATA.split("\n").map((line) => {
  const [code, name] = line.split("|");
  return { name, country: code.startsWith("EL") ? "GR" : code.slice(0, 2), aliases: [name, code], neighbors: [] as string[] };
});
function nutsCodesIn(value?: string): string[] {
  return unique((value?.toUpperCase().match(/\b[A-Z]{2}[A-Z0-9]{1,3}\b/g) ?? []).filter((code) => VALID_NUTS_CODES.has(code)));
}
function matchingRegions(value?: string) {
  if (!value) return [];
  const text = normalize(value);
  const codes = nutsCodesIn(value);
  return [...BORDER_REGIONS, ...NUTS_REGIONS].filter((region) => region.aliases.some((alias) => /^[A-Z]{2}[A-Z0-9]{1,3}$/.test(alias) ? codes.some((code) => code.startsWith(alias)) : contains(text, alias)));
}
function regionIn(value?: string) { return matchingRegions(value)[0]; }

export function homeRegionNutsCodes(region?: string): string[] {
  if (!region) return [];
  const text = normalize(region);
  const directCodes = nutsCodesIn(region);
  if (directCodes.length) return unique(directCodes.map((code) => code.length > 4 ? code.slice(0, 4) : code));
  if (/^(trentino|provincia autonoma di trento|trento|trient)$/.test(text)) return ["ITH2"];
  if (/^(alto adige|sudtirol|south tyrol|provincia autonoma di bolzano|bolzano|bozen)$/.test(text)) return ["ITH1"];
  const matched = regionIn(region);
  if (!matched) return [];
  return unique(matched.aliases.filter((alias) => /^[A-Z]{2}[A-Z0-9]{1,3}$/.test(alias) && VALID_NUTS_CODES.has(alias)));
}
export function homeRegionNuts(region?: string): string | undefined {
  const codes = homeRegionNutsCodes(region);
  return codes.length === 1 ? codes[0] : undefined;
}

export function constructionGeography(geography: Pick<VerifiedGeography, "homeCountry" | "homeRegion" | "neighboringCountries">): { primaryCountry?: string; homeRegion?: string; neighboringCountries: string[] } {
  const region = regionIn(geography.homeRegion);
  const primaryCountry = normalizeCountryCode(geography.homeCountry) ?? region?.country;
  // A verified country wins a conflicting region alias; never silently relocate
  // the company because a homonymous region appeared in a string.
  const validRegion = !primaryCountry || !region || region.country === primaryCountry;
  const homeNuts = homeRegionNutsCodes(geography.homeRegion);
  const specificRegion = homeNuts.length === 1 ? NUTS_REGIONS.find((entry) => entry.aliases.includes(homeNuts[0])) : undefined;
  const homeRegion = validRegion ? specificRegion?.name ?? region?.name ?? geography.homeRegion?.trim() : undefined;
  const neighboringCountries = unique([...(validRegion ? region?.neighbors ?? [] : []), ...countriesIn(geography.neighboringCountries ?? []), ...(primaryCountry ? COUNTRY_BORDERS[primaryCountry] ?? [] : [])]).filter((code) => code !== primaryCountry);
  return { primaryCountry, homeRegion, neighboringCountries };
}

const QUERY_LANGUAGE: Record<string, number> = { IT: 1, DE: 2, AT: 2, CH: 2, FI: 3 };
function queryFor(cluster: DiscoveryCluster, country?: string): string {
  const language = country ? QUERY_LANGUAGE[country] ?? 0 : 0;
  return cluster.queryTerms[language] ?? cluster.queryTerms[0] ?? cluster.label;
}

export function buildDiscoveryPlan(profile: CompanyProfile, evidenceText = "", geography: VerifiedGeography = {}): DiscoveryPlan {
  // Summaries have no per-claim source binding. Only capabilities/resources
  // already verified by the caller, plus explicitly supplied evidence, may
  // establish a construction trade for discovery.
  const capabilityText = normalize([...profile.capabilities, ...profile.equipmentAndResources, evidenceText].join(" "));
  const allSelected = FAMILIES.map((entry, index) => ({ entry, index, hits: entry.terms.filter((term) => contains(capabilityText, term) && (!AMBIGUOUS_TERMS.has(term) || constructionContext(capabilityText))).length }))
    .filter(({ hits }) => hits > 0).sort((a, b) => b.hits - a.hits || a.index - b.index);
  const selected = allSelected.slice(0, 8);
  const supportedTrades = allSelected.map(({ entry }) => entry.label);
  const clusters: DiscoveryCluster[] = selected.map(({ entry }) => ({ label: entry.label, cpvPrefixes: [...entry.cpvPrefixes], terms: [...entry.terms], queryTerms: [...entry.queryTerms] }));
  const operatingCountries = countriesIn([...(geography.operatingCountries ?? []), ...(geography.deliveryCountries ?? []), ...profile.serviceRegions]);
  const location = constructionGeography({ ...geography, homeCountry: geography.homeCountry ?? operatingCountries[0] });
  const { primaryCountry, homeRegion, neighboringCountries } = location;
  const countries = unique([...(primaryCountry ? [primaryCountry] : []), ...neighboringCountries, ...operatingCountries]);
  const international = geography.internationalDelivery === true;
  const procurementTypes = unique(selected.flatMap(({ entry }) => entry.types));
  const queries: DiscoveryPlan["queries"] = [];
  if (primaryCountry && homeRegion) for (const cluster of clusters) queries.push({ query: `${queryFor(cluster, primaryCountry)} ${homeRegion}`, countryCode: primaryCountry, region: homeRegion, cluster: cluster.label });
  for (const countryCode of countries) for (const cluster of clusters) queries.push({ query: queryFor(cluster, countryCode), countryCode, cluster: cluster.label });
  if (international || !countries.length) for (const cluster of clusters) queries.push({ query: queryFor(cluster), cluster: cluster.label });
  return { primaryCountry, homeRegion, neighboringCountries, operatingCountries, countries, international, procurementTypes, supportedTrades, clusters, queries };
}

export function assessCandidate(candidate: CandidateMetadata, _profile: CompanyProfile, plan: DiscoveryPlan): CandidateAssessment {
  const candidateLocation = `${candidate.region ?? ""} ${candidate.location ?? ""}`;
  const candidateRegions = matchingRegions(candidateLocation);
  const candidateRegion = candidateRegions[0];
  const country = (candidate.countryBasis === "buyer_country" ? candidateRegion?.country : undefined) ?? normalizeCountryCode(candidate.countryCode) ?? candidateRegion?.country;
  const evidencedOperations = plan.operatingCountries ?? [];
  const geography: CandidateAssessment["geography"] = !country ? "unknown" : country === plan.primaryCountry ? "domestic" : evidencedOperations.includes(country) ? "operating" : "international";
  const homeNuts = homeRegionNutsCodes(plan.homeRegion);
  const candidateNuts = nutsCodesIn(candidateLocation);
  const regionsMatch = candidateRegions.some((region) => region.name === regionIn(plan.homeRegion)?.name) || Boolean(plan.homeRegion && contains(normalize(candidateLocation), plan.homeRegion));
  const regionMatches = homeNuts.length && candidateNuts.length ? candidateNuts.some((code) => homeNuts.some((homeCode) => code.startsWith(homeCode))) : regionsMatch;
  const executionLocationKnown = candidate.countryBasis !== "buyer_country" || candidateRegions.length > 0;
  const sameRegion = Boolean(regionMatches && executionLocationKnown && (!country || country === plan.primaryCountry));
  const geographicPriority: NonNullable<CandidateAssessment["geographicPriority"]> = !executionLocationKnown ? "unknown" : sameRegion ? "home_region" : geography === "domestic" ? "domestic" : geography === "operating" ? "operating" : country && plan.neighboringCountries?.includes(country) ? "neighboring" : country && EUROPE.has(country) ? "europe" : geography;
  const needsReview = candidate.countryBasis === "buyer_country" || !country || (country !== plan.primaryCountry && !evidencedOperations.includes(country));
  const reject = (reason: string): CandidateAssessment => ({ relevant: false, score: 0, reason, geography, geographicPriority, needsReview });
  const text = normalize(`${candidate.title} ${candidate.description}`);
  const title = normalize(candidate.title);
  const notice = normalize(candidate.noticeType ?? "");
  if (/\b(award|awarded|contract award|result|planning|prior information|cancelled|canceled|aggiudicazione|esito|nachtragsvergabe|zuschlag|annullato)\b/.test(notice)) return reject("Award, planning, result or cancelled notice is not an open competition.");
  const closedTitle = /\b(awarded|contract award|award notice|tender closed|closed tender|cancelled|canceled|aggiudicazion[a-z]*|esito[a-z]*|annullat[a-z]*|gara chiusa|procedura conclusa|scadut[a-z]*|nachtragsvergabe|zuschlag[a-z]*|vergebene auftrage|bekanntmachung vergebener)\b/.test(title);
  if (closedTitle) return reject("The title identifies a result, award, closed or cancelled procedure.");
  const referenceDocument = /\b(faq|guida|guide|manuale|manual for|manual of|manual on|handbuch|leitfaden|normativa|regolamento|regulation eu|regulation ec|regulation no|osservatorio|observatory|codice dei contratti|decreto legislativo|d lgs)\b/.test(title);
  const administrativeRuling = /\b(delibera[a-z]*|determina[a-z]*|ordinanza|direttiva|circolare|beschluss|richtlinie)\b/.test(title);
  const invitation = /\b(bando|avviso|invito|indizione|ausschreibung|invitation|contract notice|call for tenders|tarjouspyynto)\b/.test(title);
  if (referenceDocument || (administrativeRuling && !invitation)) return reject("Administrative, guidance or regulatory document is not a tender invitation.");
  const scopeHeading = title.split(/\b(including|with|einschliesslich|inklusive|comprensivo|comprendente)\b/)[0];
  const archaeological = /\b(archeolog[a-z]*|archaeolog[a-z]*|archaolog[a-z]*)\b/.test(scopeHeading);
  const dedicatedArchaeology = archaeological && (!constructionContext(scopeHeading) || /\b(fouilles|diagnostic[a-z]*|survey[a-z]*|excavation[a-z]*|scavi|indagini|grabung[a-z]*|ausgrabung[a-z]*|untersuchung[a-z]*)\b/.test(scopeHeading));
  if (dedicatedArchaeology) return reject("Archaeological survey or excavation is a specialist heritage service, not evidenced construction earthworks.");
  const supplyOnly = /\b(supply|supplies|fornitura|lieferung|toimitus)\b/.test(title) && !/\b(works|construction|installation|installazione|posa|lavori|bau|montage|asennus)\b/.test(title);
  if (supplyOnly) return reject("Supply-only notice does not establish a construction contract.");
  const demandedTrades = demandedTitleTrades(candidate.title);
  const supportedTrades = plan.supportedTrades ?? plan.clusters.map((cluster) => cluster.label);
  const missingTrade = demandedTrades.find((label) => !supportedTrades.includes(label));
  if (missingTrade) return reject(`The title defines a specialist trade lot (${missingTrade}) without that evidenced contractor capability.`);
  const candidateClusters = [...plan.clusters, ...FAMILIES.filter((entry) => demandedTrades.includes(entry.label) && supportedTrades.includes(entry.label) && !plan.clusters.some((cluster) => cluster.label === entry.label))];
  const matches: { cluster: DiscoveryCluster; score: number; cpv: boolean }[] = [];
  for (const cluster of candidateClusters) {
    if (demandedTrades.length && !demandedTrades.includes(cluster.label)) continue;
    const definition = FAMILIES.find((entry) => entry.label === cluster.label);
    if (!definition) continue;
    const hits = cluster.terms.filter((term) => !["general contractor", "general construction", "costruzion general", "impresa edile"].includes(term) && contains(text, term));
    const titleHits = hits.filter((term) => contains(title, term));
    if (demandedTrades.includes(cluster.label) && !titleHits.length) { hits.push(cluster.label); titleHits.push(cluster.label); }
    const cpv = (candidate.cpvCodes ?? []).some((code) => cluster.cpvPrefixes.some((prefix) => code.replace(/\D/g, "").startsWith(prefix)));
    const related = definition.related.some((term) => contains(text, term));
    if (!hits.length && !(cpv && related)) continue;
    if (hits.length && hits.every((term) => AMBIGUOUS_TERMS.has(term)) && !cpv && (!titleHits.length || !constructionContext(title))) continue;
    // A specialist trade mentioned incidentally in a complete municipal or
    // building project does not make that whole contract a matching trade lot.
    const specialist = SPECIALIST_TITLES.some((trade) => trade.label === cluster.label);
    if (specialist && !titleHits.length && !cpv) continue;
    matches.push({ cluster, cpv, score: Math.min(9, hits.length * 2 + titleHits.length + (cpv ? 2 : 0)) });
  }
  matches.sort((a, b) => b.score - a.score);
  const best = matches[0];
  if (!best) return reject("No specific overlap with evidenced construction or specialist contracting capabilities.");
  // Disjoint score bands make geography the stable first ordering key after
  // relevance. Extra boilerplate hits cannot outrank a real home-region match.
  const bonus = { home_region: 90, domestic: 80, operating: 70, neighboring: 60, europe: 40, international: 20, unknown: 10 }[geographicPriority];
  const geographicReason = needsReview ? `${geographicPriority} location; local execution capability requires verification` : `${geographicPriority} location priority; contract qualifications still require verification`;
  return { relevant: true, score: Math.min(100, best.score + bonus), geography, geographicPriority, needsReview, matchedCluster: best.cluster.label, reason: `${best.cluster.label}: specific ${best.cpv ? "scope and CPV" : "scope"} overlap; ${geographicReason}.` };
}
