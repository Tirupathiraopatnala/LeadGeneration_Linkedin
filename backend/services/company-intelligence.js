/**
 * company-intelligence.js
 * Node.js company research pipeline.
 * Sources: Clearbit, Wikipedia, Serper (5 searches), Firecrawl (website + newsroom)
 * People: website team pages → registry directors → official press releases (priority order)
 */

const SERPER_BASE    = 'https://google.serper.dev';
const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v1/scrape';
const CLEARBIT_BASE  = 'https://autocomplete.clearbit.com/v1/companies/suggest';

// ── Registry map ───────────────────────────────────────────────────────
const REGISTRY_MAP = {
  se: ['allabolag.se', 'proff.se'],
  no: ['proff.no', 'brreg.no'],
  fi: ['finder.fi', 'kauppalehti.fi'],
  dk: ['cvr.dk', 'proff.dk'],
  uk: ['find-and-update.company-information.service.gov.uk'],
  de: ['northdata.de'],
  in: ['zaubacorp.com', 'tofler.in'],
  au: ['abr.business.gov.au'],
  sg: ['bizfile.acra.gov.sg'],
  nl: ['kvk.nl'],
  fr: ['societe.com'],
  es: ['einforma.com'],
  global: ['opencorporates.com'],
};

const HQ_COUNTRY_HINTS = {
  sweden: 'se', sverige: 'se', stockholm: 'se', gothenburg: 'se',
  norway: 'no', norge: 'no', oslo: 'no',
  finland: 'fi', helsinki: 'fi',
  denmark: 'dk', copenhagen: 'dk',
  'united kingdom': 'uk', england: 'uk', london: 'uk',
  germany: 'de', berlin: 'de', munich: 'de',
  india: 'in', mumbai: 'in', bangalore: 'in', hyderabad: 'in',
  australia: 'au', sydney: 'au', melbourne: 'au',
  singapore: 'sg',
  netherlands: 'nl', amsterdam: 'nl',
  france: 'fr', paris: 'fr',
  spain: 'es', madrid: 'es',
};

function detectCountry(domain = '', hq = '') {
  if (domain) {
    const parts = domain.toLowerCase().split('.');
    const tld = parts[parts.length - 1];
    if (REGISTRY_MAP[tld]) return tld;
  }
  if (hq) {
    const lower = hq.toLowerCase();
    for (const [kw, code] of Object.entries(HQ_COUNTRY_HINTS)) {
      if (lower.includes(kw)) return code;
    }
  }
  return 'global';
}

// ── HTTP helpers ───────────────────────────────────────────────────────

async function serperSearch(query, type = 'search', num = 8, serperKey) {
  try {
    const res = await fetch(`${SERPER_BASE}/${type}`, {
      method: 'POST',
      headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num }),
      signal: AbortSignal.timeout(15000),
    });
    return await res.json();
  } catch (e) {
    console.warn(`[Serper ${type}] Error:`, e.message);
    return {};
  }
}

async function firecrawlScrape(url, firecrawlKey) {
  try {
    const res = await fetch(FIRECRAWL_BASE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    return data?.data?.markdown?.trim() || '';
  } catch (e) {
    console.warn(`[Firecrawl] Error for ${url}:`, e.message);
    return '';
  }
}

// ── Step 1: Domain resolution ──────────────────────────────────────────

async function getCompanyDomain(companyName, serperKey) {
  // Try Clearbit first
  try {
    const res = await fetch(
      `${CLEARBIT_BASE}?query=${encodeURIComponent(companyName)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const results = await res.json();
    if (results?.length && results[0].domain) {
      console.log(`[Domain] Clearbit: ${results[0].domain}`);
      return { name: results[0].name, domain: results[0].domain, logo: results[0].logo };
    }
  } catch (e) {
    console.warn('[Clearbit]', e.message);
  }

  // Fallback: Serper knowledge graph
  console.log('[Domain] Clearbit failed — trying Serper fallback');
  try {
    const data = await serperSearch(`${companyName} official website`, 'search', 3, serperKey);
    const site =
      data.knowledgeGraph?.website ||
      data.organic?.[0]?.link || '';
    const domain = site.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
    if (domain) {
      console.log(`[Domain] Serper fallback: ${domain}`);
      return { name: companyName, domain, logo: '' };
    }
  } catch (e) {
    console.warn('[Domain Serper fallback]', e.message);
  }

  return { name: companyName, domain: '', logo: '' };
}

// ── Step 2: Wikipedia ─────────────────────────────────────────────────

async function getWikipedia(companyName) {
  for (const q of [`${companyName}_(company)`, companyName]) {
    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (res.ok) {
        const d = await res.json();
        return `Title: ${d.title}\nDescription: ${d.description}\nSummary: ${(d.extract || '').substring(0, 2000)}`;
      }
    } catch {}
  }
  return '';
}

// ── Step 3: Serper searches ───────────────────────────────────────────

function formatSerperSearch(data) {
  const lines = [];
  const kg = data.knowledgeGraph || {};
  if (kg.title) {
    lines.push('[Knowledge Graph]');
    if (kg.type)        lines.push(`  Type: ${kg.type}`);
    if (kg.description) lines.push(`  Description: ${kg.description}`);
    if (kg.website)     lines.push(`  Website: ${kg.website}`);
    for (const [k, v] of Object.entries(kg.attributes || {})) lines.push(`  ${k}: ${v}`);
  }
  for (const r of (data.organic || [])) {
    lines.push(`- ${r.title}: ${r.snippet}`);
  }
  return lines.join('\n');
}

async function getSerperOverview(name, serperKey) {
  const data = await serperSearch(
    `${name} company overview founded employees revenue headquarters`,
    'search', 10, serperKey
  );
  return formatSerperSearch(data);
}

async function getSerperPeople(name, domain, serperKey) {
  const domainScope = domain ? ` site:${domain} OR site:linkedin.com/company` : '';
  const data = await serperSearch(
    `"${name}" CEO "Chief Executive" OR founder OR president OR director${domainScope}`,
    'search', 6, serperKey
  );
  const lines = (data.organic || []).map(r => `- ${r.title}: ${r.snippet}`);
  const kg = data.knowledgeGraph || {};
  if (kg.attributes) {
    for (const [k, v] of Object.entries(kg.attributes)) {
      if (/ceo|founder|president|director/i.test(k)) lines.unshift(`[Verified from Google] ${k}: ${v}`);
    }
  }
  return lines.join('\n');
}

// ── NEW: Newsroom search — official press releases for appointments ────
async function getSerperNewsroom(name, domain, serperKey) {
  const year = new Date().getFullYear();
  const prevYear = year - 1;
  const domainNewsroom = domain ? `site:${domain}` : '';

  const queries = [
    // Search company's own newsroom/press page
    `"${name}" CEO appointed "Chief Executive Officer" ${domainNewsroom}`,
    // Search major press release wires
    `"${name}" "appointed" OR "joins as" CEO OR CFO OR CTO OR CMO OR COO site:businesswire.com OR site:prnewswire.com OR site:globenewswire.com`,
    // Recent leadership changes
    `"${name}" leadership executive team ${year} OR ${prevYear}`,
  ];

  const seen  = new Set();
  const lines = [];

  for (const q of queries) {
    const data = await serperSearch(q, 'search', 5, serperKey);
    for (const r of (data.organic || [])) {
      if (!seen.has(r.link)) {
        seen.add(r.link);
        lines.push(`[Press Release] ${r.title}: ${r.snippet}`);
      }
    }
  }

  return lines.join('\n');
}

async function getSerperCustomers(name, serperKey) {
  const data = await serperSearch(
    `"${name}" customer client "case study" OR "success story" OR partner`,
    'search', 8, serperKey
  );
  return (data.organic || []).map(r => `- ${r.title}: ${r.snippet}`).join('\n');
}

async function getSerperNews(name, serperKey) {
  const data = await serperSearch(name, 'news', 8, serperKey);
  return (data.news || []).map(a => `- [${a.date}] ${a.title}: ${a.snippet}`).join('\n');
}

async function getSerperFunding(name, serperKey) {
  const data = await serperSearch(
    `"${name}" funding raised valuation series site:crunchbase.com OR site:techcrunch.com`,
    'search', 6, serperKey
  );
  return (data.organic || []).map(r => `- ${r.title}: ${r.snippet}`).join('\n');
}

// ── Step 4: Website scraping ──────────────────────────────────────────

async function getWebsitePages(domain, firecrawlKey) {
  if (!domain) return '';

  const pages = [
    '/team', '/leadership', '/about/team', '/about/leadership', '/about/management',
    '/', '/about', '/about-us',
    '/services', '/solutions', '/products',
    '/customers', '/clients', '/case-studies',
    '/pricing', '/contact',
  ];

  const results = [];
  for (let i = 0; i < pages.length; i += 4) {
    const batch = pages.slice(i, i + 4);
    const scraped = await Promise.all(batch.map(async path => {
      const content = await firecrawlScrape(`https://${domain}${path}`, firecrawlKey);
      if (content.length > 100) {
        const limit = /team|leadership|management/i.test(path) ? 4000 : 2000;
        return `--- Page: ${path} ---\n${content.substring(0, limit)}`;
      }
      return '';
    }));
    results.push(...scraped.filter(Boolean));
  }

  return results.join('\n\n');
}

async function getCareersPage(domain, firecrawlKey) {
  if (!domain) return '';
  for (const path of ['/careers', '/jobs', '/work-with-us', '/join-us', '/about/careers']) {
    const content = await firecrawlScrape(`https://${domain}${path}`, firecrawlKey);
    if (content.length > 200) return content.substring(0, 3000);
  }
  return '';
}

// ── NEW: Newsroom page scrape — most reliable for recent appointments ──
async function getNewsroomPage(domain, firecrawlKey) {
  if (!domain) return '';
  for (const path of ['/newsroom', '/news', '/press', '/press-releases', '/about/news', '/en/newsroom']) {
    const content = await firecrawlScrape(`https://${domain}${path}`, firecrawlKey);
    if (content.length > 200) {
      console.log(`[Newsroom] ✓ scraped ${path}`);
      return content.substring(0, 4000);
    }
  }
  return '';
}

// ── Step 5: Registry data ─────────────────────────────────────────────

async function getRegistryData(companyName, domain, firecrawlKey, serperKey) {
  const country    = detectCountry(domain, '');
  const registries = REGISTRY_MAP[country] || REGISTRY_MAP.global;
  console.log(`[Registry] country: ${country} → ${registries.join(', ')}`);

  const results = [];
  for (const registry of registries.slice(0, 2)) {
    let data = await serperSearch(`"${companyName}" site:${registry}`, 'search', 3, serperKey);
    if (!(data.organic || []).length) {
      data = await serperSearch(`${companyName} site:${registry}`, 'search', 3, serperKey);
    }
    const top = (data.organic || [])[0];
    if (top) {
      results.push(`[${registry} snippet] ${top.snippet}`);
      if (top.link) {
        const page = await firecrawlScrape(top.link, firecrawlKey);
        if (page.length > 100) {
          results.push(`[${registry} full page]\n${page.substring(0, 3000)}`);
          console.log(`[Registry] ✓ scraped ${registry}`);
        }
      }
    }
  }
  return results.join('\n\n');
}

// ── Step 6: Azure OpenAI summarize ────────────────────────────────────

async function summarizeWithAzure(companyName, domainData, sources) {
  const {
    wiki, overview, people, newsroom_search, newsroom_page,
    customers, news, funding, website, careers, registry,
  } = sources;

  const endpoint   = process.env.AZURE_OPENAI_ENDPOINT;
  const key        = process.env.AZURE_OPENAI_KEY;
  const deploy     = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1-mini';
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-01';

  const systemPrompt = `You are a senior company intelligence analyst.
Extract the most accurate and specific summary from the raw data provided.
Respond ONLY with valid JSON — no markdown, no explanation, no preamble.
If a field cannot be determined with confidence, use null. Never hallucinate.`;

  const userPrompt = `Company: ${companyName}
Domain: ${domainData.domain || 'unknown'}

<wikipedia>${wiki || 'No data.'}</wikipedia>

<web_search_overview>${overview || 'No results.'}</web_search_overview>

<website_pages>
PRIORITY SOURCE for key_people and ceo.
The /team and /leadership pages list actual employees with their titles.
Use names found here first before any other source.
${website || 'No website content scraped — team pages may be JavaScript-rendered.'}
</website_pages>

<newsroom_page>
PRIORITY SOURCE: Official company press releases about leadership appointments.
CEO/executive appointments announced here are verified by the company itself.
${newsroom_page || 'No newsroom page found.'}
</newsroom_page>

<newsroom_search>
Press release snippets from businesswire, prnewswire, globenewswire, and company site.
These are official announcements — use for confirmed appointments only.
${newsroom_search || 'No press release results.'}
</newsroom_search>

<leadership_search>
General web search results mentioning leadership.
Only use if website_pages, newsroom_page, and newsroom_search have no data.
${people || 'No results.'}
</leadership_search>

<business_registry>
Legally filed data. Use for revenue, profit, employees, directors, ownership.
Named directors here are verified — include them in key_people.
${registry || 'No registry data found.'}
</business_registry>

<customers_and_partners>${customers || 'No results.'}</customers_and_partners>
<recent_news>${news || 'No results.'}</recent_news>
<funding_data>${funding || 'No results.'}</funding_data>
<careers_page>${careers || 'No careers page found.'}</careers_page>

CRITICAL RULES FOR PEOPLE DATA:
Use this priority order — stop at the first source that has data:
1. BEST: Names explicitly listed on /team or /leadership website pages
2. BEST: Names from newsroom_page (official company press releases)
3. GOOD: Names from newsroom_search (businesswire/prnewswire appointments)
4. GOOD: Names from business_registry (legally filed directors)
5. LAST RESORT: Names from leadership_search — only use if title is explicit
   e.g. "X appointed as CEO of ${companyName}" is acceptable
   "X at ${companyName}" or "X joins ${companyName}" without a title is NOT acceptable

For the ceo field: use the most recently appointed CEO based on dates in sources.
For key_people: include C-suite and VP-level only, with verified titles.
Add a "source" field to each person: "website", "newsroom", "press_release", or "registry".

CRITICAL RULES FOR FINANCIALS:
Prefer registry data. If no registry, use any verified figure from news/search.
Always include currency. Mark estimates clearly in the source field.

Return exactly this JSON:
{
  "name": "string",
  "industry": "string or null",
  "headquarters": "string or null",
  "registered_address": "string or null",
  "founded": null,
  "founders": [],
  "ceo": "string — most recently confirmed CEO name, or null",
  "key_people": [{"name": "string", "title": "string", "source": "website|newsroom|press_release|registry"}],
  "employee_count": "string or null",
  "financials": {
    "revenue": "string with currency or null",
    "revenue_usd_approx": "string or null",
    "net_profit": "string or null",
    "profit_margin": "string or null",
    "yoy_growth": "string or null",
    "source": "registry name or estimated"
  },
  "ownership": {
    "structure": "string or null",
    "parent_company": "string or null",
    "board_members": []
  },
  "funding_summary": "string or null",
  "products_services": [],
  "verticals_served": [],
  "customers_and_partners": [],
  "competitor_context": [],
  "description": "4-5 sentence detailed summary",
  "recent_news": [{"headline": "string", "date": "string"}],
  "hiring_signals": [{"role": "string", "team": "string"}],
  "tech_stack_signals": [],
  "current_focus": "string or null",
  "potential_needs": []
}`;

  try {
    const res = await fetch(
      `${endpoint}openai/deployments/${deploy}/chat/completions?api-version=${apiVersion}`,
      {
        method: 'POST',
        headers: { 'api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
          max_tokens: 3000,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(60000),
      }
    );
    const data = await res.json();
    let raw = data.choices?.[0]?.message?.content?.trim() || '{}';
    raw = raw.replace(/```json|```/g, '').replace(/\\"/g, '"').trim();

    try {
      return JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Could not parse LLM response as JSON');
    }
  } catch (e) {
    console.error('[Azure OpenAI company]', e.message);
    return {};
  }
}

// ── Main export ────────────────────────────────────────────────────────

export async function getCompanySummary(companyName, serperKey, firecrawlKey) {
  console.log(`[company-intelligence] Starting for: ${companyName}`);

  const domainData = await getCompanyDomain(companyName, serperKey);
  console.log(`[company-intelligence] Domain: ${domainData.domain || 'not found'}`);

  // All sources in parallel
  const [
    wiki, overview, people, newsroom_search,
    customers, news, funding,
    website, careers, newsroom_page,
  ] = await Promise.all([
    getWikipedia(companyName),
    getSerperOverview(companyName, serperKey),
    getSerperPeople(companyName, domainData.domain, serperKey),
    getSerperNewsroom(companyName, domainData.domain, serperKey),
    getSerperCustomers(companyName, serperKey),
    getSerperNews(companyName, serperKey),
    getSerperFunding(companyName, serperKey),
    getWebsitePages(domainData.domain, firecrawlKey),
    getCareersPage(domainData.domain, firecrawlKey),
    getNewsroomPage(domainData.domain, firecrawlKey),
  ]);

  // Registry runs after — needs domain
  const registry = await getRegistryData(
    companyName, domainData.domain, firecrawlKey, serperKey
  );

  console.log(`[company-intelligence] All sources fetched — sending to LLM`);

  const summary = await summarizeWithAzure(companyName, domainData, {
    wiki, overview, people, newsroom_search, newsroom_page,
    customers, news, funding, website, careers, registry,
  });

  console.log(
    `[company-intelligence] Done — CEO: ${summary.ceo || 'null'}, ` +
    `People: ${(summary.key_people || []).length}, ` +
    `Sources: ${[...new Set((summary.key_people || []).map(p => p.source))].join(', ') || 'none'}`
  );

  return { ...summary, _logo: domainData.logo, _domain: domainData.domain };
}