export type ProcurementCountry = {
  code: string;
  tedCode: string;
  name: string;
  domains: string[];
  sourceName: string;
  sourceUrl: string;
};

// National sources are maintained as a bounded allowlist. TED remains the
// cross-border source; national portals add notices that may not be indexed by TED.
export const PROCUREMENT_COUNTRIES: ProcurementCountry[] = [
  { code: "AT", tedCode: "AUT", name: "Austria", domains: ["ausschreibungen.usp.gv.at"], sourceName: "Austrian procurement portal", sourceUrl: "https://ausschreibungen.usp.gv.at/" },
  { code: "BE", tedCode: "BEL", name: "Belgium", domains: ["publicprocurement.be", "pouvoirs-locaux.brussels", "overheid.vlaanderen.be", "marchespublics.wallonie.be"], sourceName: "Belgian procurement portals", sourceUrl: "https://www.publicprocurement.be/" },
  { code: "BG", tedCode: "BGR", name: "Bulgaria", domains: ["app.eop.bg", "aop.bg"], sourceName: "Bulgarian public procurement portal", sourceUrl: "https://app.eop.bg/" },
  { code: "HR", tedCode: "HRV", name: "Croatia", domains: ["eojn.hr", "eojn.nn.hr"], sourceName: "Croatian public procurement portal", sourceUrl: "https://eojn.hr/" },
  { code: "CY", tedCode: "CYP", name: "Cyprus", domains: ["eprocurement.gov.cy"], sourceName: "Cypriot public procurement portal", sourceUrl: "https://www.eprocurement.gov.cy/" },
  { code: "CZ", tedCode: "CZE", name: "Czechia", domains: ["nen.nipez.cz", "portal-vz.cz"], sourceName: "Czech public procurement portals", sourceUrl: "https://portal-vz.cz/" },
  { code: "DK", tedCode: "DNK", name: "Denmark", domains: ["udbud.dk", "kfst.dk"], sourceName: "Danish procurement portal", sourceUrl: "https://udbud.dk/" },
  { code: "EE", tedCode: "EST", name: "Estonia", domains: ["riigihanked.riik.ee"], sourceName: "Estonian public procurement register", sourceUrl: "https://riigihanked.riik.ee/" },
  { code: "FI", tedCode: "FIN", name: "Finland", domains: ["hankintailmoitukset.fi"], sourceName: "Hilma", sourceUrl: "https://www.hankintailmoitukset.fi/en/" },
  { code: "FR", tedCode: "FRA", name: "France", domains: ["marches-publics.gouv.fr", "boamp.fr"], sourceName: "French public procurement portals", sourceUrl: "https://www.marches-publics.gouv.fr/" },
  { code: "DE", tedCode: "DEU", name: "Germany", domains: ["evergabe-online.de", "bund.de"], sourceName: "German public procurement portals", sourceUrl: "https://www.evergabe-online.de/" },
  { code: "GR", tedCode: "GRC", name: "Greece", domains: ["promitheus.gov.gr", "cerpp.eprocurement.gov.gr"], sourceName: "Greek public procurement portal", sourceUrl: "https://cerpp.eprocurement.gov.gr/" },
  { code: "HU", tedCode: "HUN", name: "Hungary", domains: ["ekr.gov.hu", "kozbeszerzes.hu"], sourceName: "Hungarian public procurement portal", sourceUrl: "https://ekr.gov.hu/" },
  { code: "IE", tedCode: "IRL", name: "Ireland", domains: ["etenders.gov.ie"], sourceName: "Irish national tendering platform", sourceUrl: "https://www.etenders.gov.ie/" },
  { code: "IT", tedCode: "ITA", name: "Italy", domains: ["acquistinretepa.it", "serviziocontrattipubblici.it", "anticorruzione.it"], sourceName: "Italian public procurement portals", sourceUrl: "https://www.acquistinretepa.it/" },
  { code: "LV", tedCode: "LVA", name: "Latvia", domains: ["eis.gov.lv", "iub.gov.lv"], sourceName: "Latvian electronic procurement system", sourceUrl: "https://www.eis.gov.lv/" },
  { code: "LT", tedCode: "LTU", name: "Lithuania", domains: ["cvpp.eviesiejipirkimai.lt", "vpt.lrv.lt"], sourceName: "Lithuanian public procurement portal", sourceUrl: "https://cvpp.eviesiejipirkimai.lt/" },
  { code: "LU", tedCode: "LUX", name: "Luxembourg", domains: ["pmp.b2g.etat.lu", "marches.public.lu"], sourceName: "Luxembourg public procurement portal", sourceUrl: "https://pmp.b2g.etat.lu/" },
  { code: "MT", tedCode: "MLT", name: "Malta", domains: ["contracts.gov.mt"], sourceName: "Malta Department of Contracts", sourceUrl: "https://www.contracts.gov.mt/" },
  { code: "NL", tedCode: "NLD", name: "Netherlands", domains: ["tenderned.nl"], sourceName: "TenderNed", sourceUrl: "https://www.tenderned.nl/" },
  { code: "NO", tedCode: "NOR", name: "Norway", domains: ["doffin.no", "anskaffelser.no"], sourceName: "Norwegian national procurement database", sourceUrl: "https://www.doffin.no/" },
  { code: "PL", tedCode: "POL", name: "Poland", domains: ["ezamowienia.gov.pl", "uzp.gov.pl"], sourceName: "Polish public procurement portals", sourceUrl: "https://ezamowienia.gov.pl/" },
  { code: "PT", tedCode: "PRT", name: "Portugal", domains: ["base.gov.pt"], sourceName: "Portuguese public procurement portal", sourceUrl: "https://www.base.gov.pt/" },
  { code: "RO", tedCode: "ROU", name: "Romania", domains: ["e-licitatie.ro", "achizitiipublice.gov.ro"], sourceName: "Romanian electronic procurement system", sourceUrl: "https://www.e-licitatie.ro/pub" },
  { code: "SK", tedCode: "SVK", name: "Slovakia", domains: ["uvo.gov.sk"], sourceName: "Slovak Office for Public Procurement", sourceUrl: "https://www.uvo.gov.sk/" },
  { code: "SI", tedCode: "SVN", name: "Slovenia", domains: ["ejn.gov.si", "enarocanje.si"], sourceName: "Slovenian public procurement portal", sourceUrl: "https://ejn.gov.si/" },
  { code: "ES", tedCode: "ESP", name: "Spain", domains: ["contrataciondelestado.es"], sourceName: "Spanish Public Sector Procurement Platform", sourceUrl: "https://contrataciondelestado.es/" },
  { code: "SE", tedCode: "SWE", name: "Sweden", domains: [], sourceName: "No central public notice database", sourceUrl: "https://www.upphandlingsmyndigheten.se/en/conducting-business-with-public-sector-stakeholders/finding-business-in-the-public-sector/" },
  { code: "IS", tedCode: "ISL", name: "Iceland", domains: ["utbodsvefur.is"], sourceName: "Icelandic public tenders portal", sourceUrl: "https://utbodsvefur.is/" },
  { code: "LI", tedCode: "LIE", name: "Liechtenstein", domains: ["vergaben.llv.li"], sourceName: "Liechtenstein tender announcements", sourceUrl: "https://vergaben.llv.li/" },
];

export const ALL_TENDER_DOMAINS = [
  "ted.europa.eu",
  ...new Set(PROCUREMENT_COUNTRIES.flatMap((country) => country.domains)),
];
