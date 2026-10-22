// The figures on the World in numbers page. Every one is a World Bank World
// Development Indicator; `source` names the body that compiles it.
export type Better = "up" | "down" | null;
export interface Indicator {
  code: string; name: string; short: string; unit: string; cat: string;
  /** Which way is better for comparisons (null when neither is). */
  better: Better;
  /** Shown as value × scale (e.g. sex ratio 1.08 → 108 boys per 100 girls). */
  scale?: number;
  /** Earlier code of the same series, tried when the first gives no data. */
  alt?: string;
  source: string;
}

export const CATEGORIES = ["Economy", "People", "Health", "Learning & tech", "Environment"] as const;

export const INDICATORS: Indicator[] = [
  { code: "NY.GDP.MKTP.CD", name: "GDP", short: "GDP", unit: "US$", cat: "Economy", better: "up", source: "World Bank and OECD national accounts" },
  { code: "NY.GDP.PCAP.CD", name: "GDP per person", short: "GDP per person", unit: "US$", cat: "Economy", better: "up", source: "World Bank and OECD national accounts" },
  { code: "NY.GDP.PCAP.PP.CD", name: "GDP per person at local prices (PPP)", short: "GDP per person (PPP)", unit: "international $", cat: "Economy", better: "up", source: "International Comparison Program, World Bank" },
  { code: "NY.GDP.MKTP.KD.ZG", name: "Economic growth", short: "Growth", unit: "% a year", cat: "Economy", better: "up", source: "World Bank and OECD national accounts" },
  { code: "FP.CPI.TOTL.ZG", name: "Inflation (consumer prices)", short: "Inflation", unit: "% a year", cat: "Economy", better: null, source: "International Monetary Fund" },
  { code: "SL.UEM.TOTL.ZS", name: "Unemployment", short: "Unemployment", unit: "% of workforce", cat: "Economy", better: "down", source: "International Labour Organization (modelled estimate)" },
  { code: "NE.EXP.GNFS.ZS", name: "Exports", short: "Exports", unit: "% of GDP", cat: "Economy", better: null, source: "World Bank and OECD national accounts" },

  { code: "SP.POP.TOTL", name: "Population", short: "Population", unit: "people", cat: "People", better: null, source: "UN Population Division and national statistics" },
  { code: "SP.POP.BRTH.MF", name: "Sex ratio at birth", short: "Sex ratio at birth", unit: "boys per 100 girls", cat: "People", better: null, scale: 100, source: "UN Population Division, World Population Prospects" },
  { code: "SP.POP.TOTL.FE.ZS", name: "Women in the population", short: "Women", unit: "% of people", cat: "People", better: null, source: "UN Population Division, World Population Prospects" },
  { code: "SP.DYN.LE00.IN", name: "Life expectancy at birth", short: "Life expectancy", unit: "years", cat: "People", better: "up", source: "UN Population Division, World Population Prospects" },
  { code: "SP.DYN.TFRT.IN", name: "Births per woman", short: "Fertility", unit: "children", cat: "People", better: null, source: "UN Population Division, World Population Prospects" },
  { code: "SP.URB.TOTL.IN.ZS", name: "Living in cities", short: "Urban", unit: "% of people", cat: "People", better: null, source: "UN Population Division, World Urbanization Prospects" },

  { code: "SP.DYN.IMRT.IN", name: "Infant mortality", short: "Infant mortality", unit: "per 1,000 live births", cat: "Health", better: "down", source: "UN Inter-agency Group for Child Mortality Estimation" },
  { code: "SH.DYN.MORT", name: "Under-5 mortality", short: "Under-5 mortality", unit: "per 1,000 live births", cat: "Health", better: "down", source: "UN Inter-agency Group for Child Mortality Estimation" },
  { code: "SH.STA.MMRT", name: "Maternal mortality", short: "Maternal mortality", unit: "per 100,000 live births", cat: "Health", better: "down", source: "WHO, UNICEF, UNFPA, World Bank, UN Population Division" },
  { code: "SH.XPD.CHEX.PC.CD", name: "Health spending per person", short: "Health spending", unit: "US$", cat: "Health", better: "up", source: "World Health Organization, Global Health Expenditure" },

  { code: "SE.ADT.LITR.ZS", name: "Adult literacy", short: "Literacy", unit: "% of adults", cat: "Learning & tech", better: "up", source: "UNESCO Institute for Statistics" },
  { code: "SE.TER.ENRR", name: "College enrolment", short: "College", unit: "% (gross)", cat: "Learning & tech", better: "up", source: "UNESCO Institute for Statistics" },
  { code: "IT.NET.USER.ZS", name: "Internet users", short: "Internet", unit: "% of people", cat: "Learning & tech", better: "up", source: "International Telecommunication Union" },

  { code: "AG.LND.FRST.ZS", name: "Forest cover", short: "Forest", unit: "% of land", cat: "Environment", better: "up", source: "Food and Agriculture Organization" },
  { code: "EN.GHG.CO2.PC.CE.AR5", alt: "EN.ATM.CO2E.PC", name: "CO₂ emissions per person", short: "CO₂ per person", unit: "tonnes", cat: "Environment", better: "down", source: "EDGAR, European Commission JRC (via World Bank)" },
  { code: "EG.ELC.ACCS.ZS", name: "Access to electricity", short: "Electricity", unit: "% of people", cat: "Environment", better: "up", source: "World Bank, Sustainable Energy for All" },
];

export interface CountriesFile {
  generatedAt: string;
  /** Years covered by every series, oldest first. */
  years: number[];
  countries: { id: string; name: string; region: string; income: string; capital: string }[];
  /** code → country → value per year (null when not reported), aligned with `years`. */
  data: Record<string, Record<string, (number | null)[]>>;
  /** code → world average per year (the World Bank's "World" aggregate). */
  world: Record<string, (number | null)[]>;
  /** Codes that gave no data this time (kept from the previous file when it had them). */
  missing: string[];
}

/** The latest reported value and its year. */
export function latest(series: (number | null)[] | undefined, years: number[]): { v: number; year: number } | null {
  if (!series) return null;
  for (let i = series.length - 1; i >= 0; i--) if (series[i] != null) return { v: series[i]!, year: years[i] };
  return null;
}
