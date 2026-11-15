import assert from "node:assert/strict";
import { test } from "node:test";
import { assessCandidate, buildDiscoveryPlan, constructionGeography, homeRegionNuts, homeRegionNutsCodes, normalizeCountryCode } from "./research-plan";
import type { CompanyProfile } from "./types";

function profile(capabilities: string[], serviceRegions: string[] = []): CompanyProfile {
  return { name: "Example contractor", domain: "example.test", summary: "", capabilities, serviceRegions, certifications: [], projectReferences: [], equipmentAndResources: [], qualityAndSafety: [], sustainability: [], sourceCount: 1, failedCount: 0, sitemapUrls: 1, sources: [], news: [] };
}

test("normalizes explicit countries and bounded regions without guessing from domains", () => {
  for (const name of ["Italy", "Italia", "IT", "Lombardia", "Veneto"]) assert.equal(normalizeCountryCode(name), "IT");
  assert.equal(normalizeCountryCode("Deutschland"), "DE");
  assert.equal(normalizeCountryCode("Suomi"), "FI");
  assert.equal(normalizeCountryCode("Trentino"), "IT");
  assert.equal(normalizeCountryCode("EU"), undefined);
  assert.equal(normalizeCountryCode("example.it"), undefined);
  assert.equal(normalizeCountryCode("Dortmund"), undefined);
});

test("Trentino prioritizes its region, Italy and neighboring Austria without inventing operations", () => {
  const supplier = profile(["Road construction and asphalt surfacing"]);
  const plan = buildDiscoveryPlan(supplier, "", { homeCountry: "Italy", homeRegion: "Trentino" });
  assert.equal(plan.homeRegion, "Provincia Autonoma di Trento");
  assert.equal(plan.queries[0].region, "Provincia Autonoma di Trento");
  assert.equal(plan.queries[0].countryCode, "IT");
  assert.match(plan.queries[0].query, /Trento/);
  assert.equal(plan.queries[1].countryCode, "IT");
  assert.equal(plan.queries[1].region, undefined);
  assert.equal(plan.queries[2].countryCode, "AT");
  assert.deepEqual(plan.operatingCountries, []);
  const neighboring = assessCandidate({ title: "Straßenbau Asphalt", description: "", countryCode: "AT", countryBasis: "execution_location" }, supplier, plan);
  assert.equal(neighboring.relevant, true);
  assert.equal(neighboring.geographicPriority, "neighboring");
  assert.equal(neighboring.needsReview, true);
  assert.notEqual(neighboring.geography, "operating");
});

test("physical border helper recognizes representative EU regions without company-specific assumptions", () => {
  const alpine = constructionGeography({ homeRegion: "Südtirol" });
  assert.equal(alpine.primaryCountry, "IT");
  assert.equal(alpine.neighboringCountries[0], "AT");
  assert.equal(constructionGeography({ homeCountry: "Germany", homeRegion: "Bavaria" }).neighboringCountries[0], "AT");
  assert.equal(constructionGeography({ homeCountry: "Finland", homeRegion: "Lapland" }).neighboringCountries[0], "SE");
  assert.equal(constructionGeography({ homeCountry: "IT", homeRegion: "Bavaria" }).homeRegion, undefined);
  assert.equal(constructionGeography({ homeCountry: "Italy" }).homeRegion, undefined);
});

test("same-scope ranking prefers home region, home country, neighbors, then wider Europe", () => {
  const supplier = profile(["Road construction and asphalt surfacing"]);
  const plan = buildDiscoveryPlan(supplier, "", { homeCountry: "IT", homeRegion: "Trentino" });
  const base = { title: "Road construction", description: "", countryBasis: "execution_location" };
  const local = assessCandidate({ ...base, countryCode: "IT", region: "Provincia autonoma di Trento" }, supplier, plan);
  const domestic = assessCandidate({ ...base, countryCode: "IT", region: "Lazio" }, supplier, plan);
  const nearby = assessCandidate({ ...base, countryCode: "AT" }, supplier, plan);
  const europe = assessCandidate({ ...base, countryCode: "FI" }, supplier, plan);
  const overseas = assessCandidate({ ...base, countryCode: "US" }, supplier, plan);
  assert.equal(local.geographicPriority, "home_region");
  assert.ok(local.score > domestic.score);
  assert.ok(domestic.score > nearby.score);
  assert.ok(nearby.score > europe.score);
  assert.ok(europe.score > overseas.score);
  assert.equal(europe.relevant, true);
  assert.equal(europe.needsReview, true);
});

test("verified cross-border execution is distinguished from search expansion", () => {
  const supplier = profile(["Electrical installation works"]);
  const plan = buildDiscoveryPlan(supplier, "", { homeCountry: "IT", operatingCountries: ["Austria"] });
  const result = assessCandidate({ title: "Elektroinstallation", description: "", countryCode: "AT", countryBasis: "execution_location", cpvCodes: ["45310000"] }, supplier, plan);
  assert.equal(result.relevant, true);
  assert.equal(result.geography, "operating");
  assert.equal(result.needsReview, false);
  assert.equal(assessCandidate({ title: "Elektroinstallation", description: "", countryCode: "AT", countryBasis: "buyer_country" }, supplier, plan).needsReview, true);
});

test("civil contractor matches specific works rather than all CPV45", () => {
  const supplier = profile(["Road construction and asphalt surfacing", "Earthmoving and demolition", "Civil infrastructure and concrete construction"], ["Lombardia", "Italia"]);
  const plan = buildDiscoveryPlan(supplier);
  assert.equal(plan.primaryCountry, "IT");
  assert.equal(assessCandidate({ title: "Lavori di asfaltatura stradale", description: "", cpvCodes: ["45233220"], countryCode: "IT" }, supplier, plan).relevant, true);
  assert.equal(assessCandidate({ title: "Electrical installations", description: "General construction works", cpvCodes: ["45310000"], countryCode: "IT" }, supplier, plan).relevant, false);
  assert.equal(assessCandidate({ title: "Contract notice", description: "Works and maintenance", cpvCodes: ["45000000"] }, supplier, plan).relevant, false);
});

test("specialist contractors retain electrical HVAC water rail bridge and remediation scope", () => {
  for (const [capability, title, code] of [
    ["Electrical installation works", "Installazione impianti elettrici", "45310000"],
    ["HVAC and heating installation", "Heizungsbau und Lüftungsbau", "45331000"],
    ["Water pipeline construction", "Lavori acquedotti e fognature", "45231300"],
    ["Railway construction", "Gleisbau Erneuerung", "45234100"],
    ["Bridge construction", "Manutenzione ponti", "45221100"],
    ["Soil remediation and asbestos removal", "Bonifica amianto", "45262660"],
    ["Roofing and waterproofing", "Dachsanierung", "45261000"],
  ]) {
    const supplier = profile([capability]);
    const plan = buildDiscoveryPlan(supplier, "", { homeCountry: "IT" });
    assert.equal(assessCandidate({ title, description: "", cpvCodes: [code], countryCode: "AT" }, supplier, plan).relevant, true, capability);
    assert.equal(assessCandidate({ title: "General software consultancy", description: "", cpvCodes: ["72000000"] }, supplier, plan).relevant, false, capability);
  }
});

test("supply-only components and other industries cannot become construction offerings", () => {
  const supplier = profile(["Electrical installation works"]);
  const plan = buildDiscoveryPlan(supplier);
  assert.equal(assessCandidate({ title: "Supply of electrical equipment", description: "Electrical installation equipment", cpvCodes: ["45310000"] }, supplier, plan).relevant, false);
  assert.equal(assessCandidate({ title: "Fornitura e posa impianti elettrici", description: "", cpvCodes: ["45310000"] }, supplier, plan).relevant, true);
  for (const capability of ["Microfluidics and laboratory micropumps", "Electrical cable connectors", "Industrial software", "Conveyor belts and rollers"]) {
    assert.equal(buildDiscoveryPlan(profile([capability])).clusters.length, 0, capability);
  }
});

test("awards and generic notices are rejected; representative construction families are capped", () => {
  const supplier = profile(["Road construction", "Demolition", "Building construction", "Civil infrastructure", "Bridge construction", "Railway construction", "Electrical installation works", "HVAC", "Water pipeline construction", "Roofing"]);
  const plan = buildDiscoveryPlan(supplier, "", { homeCountry: "IT" });
  assert.equal(plan.clusters.length, 8);
  assert.ok(plan.procurementTypes.includes("works"));
  assert.equal(plan.procurementTypes.includes("supplies"), false);
  assert.equal(assessCandidate({ title: "Road construction", description: "", noticeType: "Contract award" }, supplier, plan).relevant, false);
  assert.equal(assessCandidate({ title: "Contract notice", description: "Repair construction maintenance services", cpvCodes: ["45000000"] }, supplier, plan).relevant, false);
  const general = profile(["General construction contractor"]);
  const buildingPlan = buildDiscoveryPlan(general);
  assert.equal(assessCandidate({ title: "General construction works", description: "Contract notice", cpvCodes: ["45000000"] }, general, buildingPlan).relevant, false);
  assert.equal(assessCandidate({ title: "Riqualificazione palestra scolastica", description: "", cpvCodes: ["45212222"] }, general, buildingPlan).relevant, true);
});


test("official NUTS2024 child codes match actual home regions without code guessing", () => {
  assert.equal(homeRegionNuts("Lombardia"), "ITC4");
  assert.equal(homeRegionNuts("ITC4C"), "ITC4");
  assert.equal(homeRegionNuts("Trentino"), "ITH2");
  assert.equal(homeRegionNuts("Südtirol"), "ITH1");
  assert.deepEqual(homeRegionNutsCodes("Trentino-Alto Adige"), ["ITH1", "ITH2"]);
  assert.equal(homeRegionNuts("Trentino-Alto Adige"), undefined);
  assert.equal(homeRegionNuts("Emilia-Romagna"), "ITH5");
  assert.equal(homeRegionNuts("Helsinki-Uusimaa"), "FI1B");
  assert.equal(homeRegionNuts("ITH2Z"), undefined);
  const supplier = profile(["Road construction"]);
  const plan = buildDiscoveryPlan(supplier, "", { homeCountry: "IT", homeRegion: "Lombardia" });
  const local = assessCandidate({ title: "Road construction", description: "", countryCode: "IT", region: "ITH20 ITC4C", location: "Milano", countryBasis: "execution_location" }, supplier, plan);
  assert.equal(local.geographicPriority, "home_region");
  assert.equal(assessCandidate({ title: "Road construction", description: "", countryCode: "IT", region: "ITH20", countryBasis: "execution_location" }, supplier, plan).geographicPriority, "domestic");
});

test("geographic tiers beat lexical hit variations after the scope relevance floor", () => {
  const supplier = profile(["Road construction and asphalt surfacing"]);
  const plan = buildDiscoveryPlan(supplier, "", { homeCountry: "IT", homeRegion: "Trentino" });
  const local = assessCandidate({ title: "Road construction", description: "", countryCode: "IT", region: "ITH20", countryBasis: "execution_location" }, supplier, plan);
  const national = assessCandidate({ title: "Road construction road maintenance asphalt road surfacing", description: "Asphalt surfacing road construction", cpvCodes: ["45233100"], countryCode: "IT", region: "ITC4C", countryBasis: "execution_location" }, supplier, plan);
  assert.ok(local.score > national.score);
  const buyer = assessCandidate({ title: "Road construction", description: "", countryCode: "IT", countryBasis: "buyer_country" }, supplier, plan);
  assert.equal(buyer.geographicPriority, "unknown");
  assert.equal(buyer.needsReview, true);
});

test("administrative regulations and closed results cannot qualify from boilerplate scope", () => {
  const supplier = profile(["Road construction and civil infrastructure"]);
  const plan = buildDiscoveryPlan(supplier, "", { homeCountry: "IT" });
  for (const title of ["Delibera n. 76 del 4 marzo 2026", "FAQ lavori stradali", "Guida appalti opere civili", "Normativa edilizia", "Osservatorio lavori pubblici", "Nachtragsvergabe Straßenbau", "Esito gara lavori stradali", "Aggiudicazione lavori stradali", "Cancelled road construction tender", "Road construction tender closed"]) {
    assert.equal(assessCandidate({ title, description: "Road construction and civil infrastructure", cpvCodes: ["45233100"], countryCode: "IT" }, supplier, plan).relevant, false, title);
  }
  assert.equal(assessCandidate({ title: "Delibera di indizione gara lavori stradali", description: "", cpvCodes: ["45233100"], countryCode: "IT" }, supplier, plan).relevant, true);
  assert.equal(assessCandidate({ title: "Avviso gara lavori stradali", description: "", cpvCodes: ["45233100"], countryCode: "IT" }, supplier, plan).relevant, true);
});

test("structural concrete and masonry contractors do not acquire all civil infrastructure scope", () => {
  const supplier = profile(["Rohbau, Betonbau, Betonarbeiten und Mauerarbeiten", "Concrete construction and masonry works"]);
  const plan = buildDiscoveryPlan(supplier, "", { homeCountry: "DE" });
  assert.equal(plan.clusters.some((cluster) => cluster.cpvPrefixes.includes("4522")), false);
  assert.ok(plan.clusters.some((cluster) => cluster.cpvPrefixes.includes("452623")));
  assert.equal(assessCandidate({ title: "Rohbau Betonarbeiten Schulgebäude", description: "", cpvCodes: ["45262300"], countryCode: "DE" }, supplier, plan).relevant, true);
  assert.equal(assessCandidate({ title: "Sportpark irrigation system", description: "Including incidental Betonarbeiten and concrete construction", cpvCodes: ["45232120"], countryCode: "DE" }, supplier, plan).relevant, false);
  assert.equal(assessCandidate({ title: "Municipal Tiefbau infrastructure", description: "Civil infrastructure engineering works", cpvCodes: ["45220000"], countryCode: "DE" }, supplier, plan).relevant, false);
});

test("industrial one-word sectors alone do not establish construction contracting", () => {
  for (const capability of ["HVAC equipment manufacturer", "Asphalt products", "Elektrotechnik components", "Klimatechnik manufacturer"]) {
    assert.equal(buildDiscoveryPlan(profile([capability])).clusters.length, 0, capability);
  }
  const supplier = profile(["HVAC installation contractor"]);
  const plan = buildDiscoveryPlan(supplier);
  assert.equal(assessCandidate({ title: "HVAC equipment catalogue", description: "HVAC products for buildings", cpvCodes: ["42500000"] }, supplier, plan).relevant, false);
  assert.equal(assessCandidate({ title: "HVAC installation works", description: "", cpvCodes: ["45331000"] }, supplier, plan).relevant, true);
});

test("free-form supplier summaries cannot activate unsupported construction trades", () => {
  const supplier = profile(["Road construction"]);
  supplier.summary = "Bridge construction, electrical installation and HVAC installation contractor";
  const plan = buildDiscoveryPlan(supplier);
  assert.equal(plan.clusters.length, 1);
  assert.equal(plan.clusters[0].label, "Road construction and surfacing");
  const unsupported = profile([]);
  unsupported.summary = "General construction contractor offering building construction";
  assert.equal(buildDiscoveryPlan(unsupported).clusters.length, 0);
});

test("generic building CPV and school context cannot qualify unsupported specialist lots", () => {
  const general = profile(["General contractor", "Building construction and renovation", "Civil infrastructure works"]);
  const plan = buildDiscoveryPlan(general, "", { homeCountry: "AT" });
  const context = { description: "School building construction and renovation project", cpvCodes: ["45214200"], countryCode: "AT" };
  for (const title of ["Neubau Schule - Los 4 Elektroinstallationsarbeiten", "Schulzentrum - HKLS", "Neubau Schule - Fenster-Sonnenschutz", "Schulzentrum - Dachdeckerarbeiten", "Electrical installation for school construction", "Schulbau Los 3 HLS"]) {
    assert.equal(assessCandidate({ ...context, title }, general, plan).relevant, false, title);
  }
  assert.equal(assessCandidate({ ...context, title: "School building construction including electrical and HVAC installations" }, general, plan).relevant, true);
  assert.equal(assessCandidate({ ...context, title: "Schlüsselfertiger Neubau Schule", description: "Building construction including HKLS and electrical installation, windows and roofing" }, general, plan).relevant, true);
  const electrical = profile(["Electrical installation contractor"]);
  assert.equal(assessCandidate({ ...context, title: "Neubau Schule - Los 4 Elektro" }, electrical, buildDiscoveryPlan(electrical)).relevant, true);
  const mechanical = profile(["HKLS installation contractor"]);
  assert.equal(assessCandidate({ ...context, title: "Schulzentrum - HLS" }, mechanical, buildDiscoveryPlan(mechanical)).relevant, true);
  const glazing = profile(["Fensterbau und Fassadenarbeiten"]);
  assert.equal(assessCandidate({ ...context, title: "Neubau Schule - Fenster-Sonnenschutz" }, glazing, buildDiscoveryPlan(glazing)).relevant, true);
});

test("representative query cap does not erase an evidenced specialist trade", () => {
  const supplier = profile(["Road construction and asphalt road maintenance", "Earthmoving demolition excavation", "Building construction and building renovation", "Civil infrastructure and civil engineering works", "Bridge construction and tunnel construction", "Railway construction and track construction", "Electrical installation works", "HVAC heating installation", "Water pipeline construction sewer construction", "Roofing and waterproofing", "Fensterbau"]);
  const plan = buildDiscoveryPlan(supplier);
  assert.equal(plan.clusters.length, 8);
  assert.ok(plan.supportedTrades?.includes("Windows glazing and facade works"));
  assert.equal(assessCandidate({ title: "Schulzentrum - Los 7 Fenster-Sonnenschutz", description: "School building construction", cpvCodes: ["45214200"] }, supplier, plan).relevant, true);
});

test("archaeological excavation and diagnosis do not qualify as generic earthworks", () => {
  const supplier = profile(["Earthmoving, excavation and demolition", "Civil infrastructure", "Building construction"]);
  const plan = buildDiscoveryPlan(supplier);
  for (const title of ["FOUILLES D’ARCHEOLOGIE PREVENTIVE", "Archaeological excavation and survey", "Diagnostic archéologique préventif", "Scavi archeologici preventivi", "Baubegleitende archäologische Untersuchung"]) {
    assert.equal(assessCandidate({ title, description: "Earthmoving, excavation and civil infrastructure works", cpvCodes: ["45112000"] }, supplier, plan).relevant, false, title);
  }
  assert.equal(assessCandidate({ title: "Building construction of a new hospital", description: "Archaeological constraints apply to foundation excavation; a separate licensed archaeologist monitors the site.", cpvCodes: ["45215100"] }, supplier, plan).relevant, true);
});

test("retendered timber and collective heating lots require the corresponding evidenced trades", () => {
  const general = profile(["General contractor", "Building construction and renovation"]);
  const title = "Construction de 102 logements - relance des lots 02 CHARPENTE BOIS-BARDAGES et 09 CHAUFFERIE COLLECTIVE";
  const notice = { title, description: "Building construction for collective housing", cpvCodes: ["45211000"] };
  assert.equal(assessCandidate(notice, general, buildDiscoveryPlan(general)).relevant, false);
  const timberOnly = profile(["Timber framing and structural carpentry"]);
  assert.equal(assessCandidate(notice, timberOnly, buildDiscoveryPlan(timberOnly)).relevant, false);
  const specialist = profile(["Timber framing and structural carpentry", "Heating installation contractor"]);
  assert.equal(assessCandidate(notice, specialist, buildDiscoveryPlan(specialist)).relevant, true);
  assert.equal(assessCandidate({ ...notice, title: "Construction of collective housing", description: "The complete building construction includes timber framing, cladding and collective heating." }, general, buildDiscoveryPlan(general)).relevant, true);
});


test("building contractors retain core renovation trade from ordinary published activity wording", () => {
  const supplier = profile(["Civil and industrial construction, including residential buildings, offices and sports facilities.", "Restoration, architectural recovery, renovation and adaptive reuse of historic buildings."]);
  const plan = buildDiscoveryPlan(supplier, "", { homeCountry: "IT", homeRegion: "Lombardia" });
  assert.ok(plan.clusters.some((cluster) => cluster.label === "Building construction and renovation"));
});

test("German carpentry lot requires a timber trade even when coded as a school building", () => {
  const supplier = profile(["Building construction and renovation"]);
  const plan = buildDiscoveryPlan(supplier, "", { homeCountry: "AT" });
  assert.equal(assessCandidate({ title: "Austria – School construction – Zimmererarbeiten", description: "School renovation", cpvCodes: ["45210000"], countryCode: "AT", countryBasis: "execution_location" }, supplier, plan).relevant, false);
});
