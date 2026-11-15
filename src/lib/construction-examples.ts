export type ConstructionCompanyExample = {
  id: string;
  name: string;
  url: string;
  region: string;
  country: string;
  specialty: string;
  verification: "pending" | "tested";
  verifiedAt?: string;
};

// Identity, headquarters and activities were checked against official websites.
// "tested" requires a separately reviewed run through the actual research flow.
// Pending candidates never appear in the public company picker.
export const CONSTRUCTION_EXAMPLES: ConstructionCompanyExample[] = [
  { id: "vitali", name: "Vitali", url: "https://vitalispa.it/", region: "Lombardia", country: "IT", specialty: "Roads, bridges and urban regeneration", verification: "tested", verifiedAt: "2026-11-15" },
  { id: "collini", name: "Collini Lavori", url: "https://collinilavori.it/", region: "Trentino-Alto Adige", country: "IT", specialty: "Tunnels, infrastructure and public buildings", verification: "pending" },
  { id: "cogeis", name: "COGEIS", url: "https://cogeis.it/", region: "Piemonte", country: "IT", specialty: "Tunnelling and Alpine civil works", verification: "tested", verifiedAt: "2026-11-15" },
  { id: "bottoli", name: "Bottoli Costruzioni", url: "https://www.bottoli.it/", region: "Lombardia", country: "IT", specialty: "Building construction and restoration", verification: "tested", verifiedAt: "2026-11-15" },
  { id: "darema", name: "DAREMA Costruzioni", url: "https://www.darema.it/", region: "Abruzzo / Marche", country: "IT", specialty: "Regional building and seismic renovation", verification: "pending" },
  { id: "decker-de", name: "Decker Bau", url: "https://www.decker-bau.de/", region: "Baden-Württemberg", country: "DE", specialty: "Concrete, masonry and building refurbishment", verification: "pending" },
  { id: "strabag-at", name: "STRABAG", url: "https://www.strabag.com/en", region: "Carinthia", country: "AT", specialty: "Buildings, roads and civil infrastructure", verification: "tested", verifiedAt: "2026-11-15" },
  { id: "eiffage-fr", name: "Eiffage", url: "https://www.eiffage.com/", region: "Île-de-France", country: "FR", specialty: "Building, road and civil engineering", verification: "tested", verifiedAt: "2026-11-15" },
  { id: "nge-fr", name: "NGE", url: "https://www.nge.fr/en/", region: "Provence-Alpes-Côte d’Azur", country: "FR", specialty: "Earthworks, utilities and infrastructure", verification: "pending" },
  { id: "sacyr-es", name: "Sacyr", url: "https://sacyr.com/en/", region: "Madrid", country: "ES", specialty: "Transport infrastructure and public buildings", verification: "tested", verifiedAt: "2026-11-15" },
  { id: "comsa-es", name: "COMSA", url: "https://www.comsa.com/en/", region: "Catalonia", country: "ES", specialty: "Rail construction and civil works", verification: "tested", verifiedAt: "2026-11-15" },
  { id: "ncc-se", name: "NCC", url: "https://www.ncc.com/", region: "Stockholm County", country: "SE", specialty: "Nordic buildings and infrastructure", verification: "tested", verifiedAt: "2026-11-15" },
  { id: "yit-fi", name: "YIT", url: "https://www.yitgroup.com/en", region: "Uusimaa", country: "FI", specialty: "Buildings, roads and rock tunnelling", verification: "tested", verifiedAt: "2026-11-15" },
  { id: "heijmans-nl", name: "Heijmans", url: "https://www.heijmans.nl/en/", region: "North Brabant", country: "NL", specialty: "Dutch infrastructure, utilities and buildings", verification: "tested", verifiedAt: "2026-11-15" },
  { id: "besix-be", name: "BESIX", url: "https://www.besix.com/en", region: "Brussels", country: "BE", specialty: "Complex buildings, marine and civil works", verification: "tested", verifiedAt: "2026-11-15" },
];

export function testedConstructionExamples(): ConstructionCompanyExample[] {
  return CONSTRUCTION_EXAMPLES.filter((example) => example.verification === "tested");
}
