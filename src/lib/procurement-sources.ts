export type ProcurementCountry = {
  code: string;
  tedCode: string;
  name: string;
  domains: string[];
  sourceName: string;
  sourceUrl: string;
  searchCountry?: string | null;
  availabilityDetail?: string;
  pathPrefixes?: string[];
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
  { code: "IT", tedCode: "ITA", name: "Italy", domains: ["acquistinretepa.it", "serviziocontrattipubblici.it", "intercenter.regione.emilia-romagna.it", "sater.regione.emilia-romagna.it", "ariaspa.it", "sintel.regione.lombardia.it", "bandi-altoadige.it"], sourceName: "Italian public procurement portals", sourceUrl: "https://www.acquistinretepa.it/" },
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
  { code: "GB", tedCode: "GBR", name: "United Kingdom", domains: ["find-tender.service.gov.uk", "contractsfinder.service.gov.uk", "publiccontractsscotland.gov.uk", "sell2wales.gov.wales", "etendersni.gov.uk"], sourceName: "UK and devolved public procurement portals", sourceUrl: "https://www.find-tender.service.gov.uk/", availabilityDetail: "Find a Tender, Contracts Finder, Public Contracts Scotland, Sell2Wales, and eTendersNI are queried together. Results are an aggregate indexed subset, and each result link shows its actual portal." },
  { code: "CH", tedCode: "CHE", name: "Switzerland", domains: ["simap.ch"], sourceName: "SIMAP", sourceUrl: "https://www.simap.ch/", availabilityDetail: "Official national portal. Context search results may be an indexed subset." },
  { code: "RS", tedCode: "SRB", name: "Serbia", domains: ["jnportal.ujn.gov.rs"], sourceName: "Serbian Public Procurement Portal", sourceUrl: "https://jnportal.ujn.gov.rs/" },
  { code: "BA", tedCode: "BIH", name: "Bosnia and Herzegovina", domains: ["next.ejn.gov.ba"], sourceName: "Bosnia and Herzegovina e-Procurement", sourceUrl: "https://next.ejn.gov.ba/" },
  { code: "ME", tedCode: "MNE", name: "Montenegro", domains: ["cejn.gov.me"], sourceName: "Montenegro CEJN", sourceUrl: "https://cejn.gov.me/" },
  { code: "AL", tedCode: "ALB", name: "Albania", domains: ["app.gov.al"], sourceName: "Albanian Public Procurement Agency", sourceUrl: "https://www.app.gov.al/e-procurement" },
  { code: "MK", tedCode: "MKD", name: "North Macedonia", domains: ["e-nabavki.gov.mk"], sourceName: "North Macedonia e-Procurement System", sourceUrl: "https://e-nabavki.gov.mk/PublicAccess/home.aspx" },
  { code: "XK", tedCode: "XKX", name: "Kosovo", domains: ["e-prokurimi.rks-gov.net"], sourceName: "Kosovo e-Procurement", sourceUrl: "https://e-prokurimi.rks-gov.net/", searchCountry: null },
  { code: "UA", tedCode: "UKR", name: "Ukraine", domains: ["prozorro.gov.ua"], sourceName: "Prozorro", sourceUrl: "https://prozorro.gov.ua/" },
  { code: "MD", tedCode: "MDA", name: "Moldova", domains: ["mtender.gov.md", "public.mtender.gov.md"], sourceName: "MTender", sourceUrl: "https://mtender.gov.md/en/public/for-civil", availabilityDetail: "MTender publishes an open OCDS tender feed. This search uses indexed portal pages, not the complete feed." },
  { code: "TR", tedCode: "TUR", name: "Türkiye", domains: ["ekap.kik.gov.tr"], sourceName: "EKAP", sourceUrl: "https://ekap.kik.gov.tr/EKAP/Ortak/IhaleArama/index.html", availabilityDetail: "Official search is dynamic and Turkish-language. Indexed results may be incomplete." },
  { code: "GE", tedCode: "GEO", name: "Georgia", domains: ["procurement.gov.ge", "eprocurement.gov.ge"], sourceName: "Georgia Unified Electronic System", sourceUrl: "https://www.procurement.gov.ge/", availabilityDetail: "The State Procurement Agency links to the live electronic tender system. Indexed results may be incomplete." },
  { code: "AM", tedCode: "ARM", name: "Armenia", domains: ["procurement.am"], sourceName: "Armenian procurement portal", sourceUrl: "https://procurement.am/en/" },
  { code: "AZ", tedCode: "AZE", name: "Azerbaijan", domains: ["etender.gov.az"], sourceName: "Azerbaijan e-Tender", sourceUrl: "https://etender.gov.az/", availabilityDetail: "Public notice search is available. Some documents may require bidder registration or payment." },
  { code: "AD", tedCode: "AND", name: "Andorra", domains: [], sourceName: "Andorran public procurement platform", sourceUrl: "https://contractacio.govern.ad/SLE_Internet", availabilityDetail: "The platform requires qualified electronic authentication, so public automated search is unavailable." },
  { code: "MC", tedCode: "MCO", name: "Monaco", domains: ["mairie.marches-publics.mc"], sourceName: "Monaco Mairie public tenders", sourceUrl: "https://mairie.marches-publics.mc/", availabilityDetail: "This source covers municipal tenders only, not all Monaco state procurement." },
  { code: "SM", tedCode: "SMR", name: "San Marino", domains: ["gov.sm"], sourceName: "San Marino public tenders", sourceUrl: "https://www.gov.sm/pub2/GovSM/Appalti-Pubblici-di-Beni-e-Servizi", pathPrefixes: ["/pub2/GovSM/Appalti-Pubblici-di-Beni-e-Servizi"] },
  { code: "BY", tedCode: "BLR", name: "Belarus", domains: ["gias.by", "icetrade.by", "goszakupki.by", "zakupki.butb.by"], sourceName: "Belarus public procurement portals", sourceUrl: "https://gias.by/", availabilityDetail: "Includes the state procurement information system and other official marketplaces. Portal pages are primarily in Russian or Belarusian; indexed results may be incomplete." },
  { code: "RU", tedCode: "RUS", name: "Russia", domains: ["zakupki.gov.ru"], sourceName: "Unified Information System in Procurement", sourceUrl: "https://zakupki.gov.ru/", availabilityDetail: "Official portal is Russian-language. Indexed results may be incomplete and cross-border eligibility must be checked separately." },
  { code: "VA", tedCode: "VAT", name: "Vatican City", domains: ["bandipubblici.va"], sourceName: "Holy See and Vatican public procurement", sourceUrl: "https://www.bandipubblici.va/", availabilityDetail: "Official procurement notices and supplier registration are available on the Holy See portal." },
];

export const ALL_TENDER_DOMAINS = [
  "ted.europa.eu",
  ...new Set(PROCUREMENT_COUNTRIES.flatMap((country) => country.domains)),
];

export function isOfficialTenderUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "ted.europa.eu" || host.endsWith(".ted.europa.eu")) return true;
    return PROCUREMENT_COUNTRIES.some((country) => {
      const domainMatch = country.domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
      if (!domainMatch) return false;
      if (!country.pathPrefixes?.length) return true;
      return country.pathPrefixes.some((prefix) => {
        const normalized = prefix.replace(/\/$/, "");
        return url.pathname === normalized || url.pathname.startsWith(`${normalized}/`);
      });
    });
  } catch {
    return false;
  }
}
