import { Router } from 'express';
import { searchCompanies, enrichCompany } from '../services/apollo.js';
import { findDecisionMakers } from '../services/apify.js';
import { cleanSearchQuery, scoreCompany } from '../services/groq.js';

export const outreachRouter = Router();

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── FLOW 1: Company Discovery ─────────────────────────────────────────
outreachRouter.post('/discover', async (req, res) => {
  const {
    apolloKey, targetAudience, productDescription, minCompanyScore = 7,
    targetLocations, employeeRanges,
  } = req.body;

  if (!apolloKey || !targetAudience || !productDescription) {
    return res.status(400).json({ error: 'Missing apolloKey, targetAudience, or productDescription' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    // Step 1 — Clean search query
    send(res, 'progress', { message: 'Cleaning search keywords with AI...' });
    const keywords = await cleanSearchQuery(targetAudience);
    send(res, 'progress', { message: `Keywords: ${keywords}` });

    // Step 2 — Search Apollo
    send(res, 'progress', { message: 'Searching Apollo for matching companies...' });
    const searchResult = await searchCompanies(keywords, apolloKey, {
      locations: targetLocations,
      employeeRanges: employeeRanges,
    });
    const rawCompanies = searchResult?.organizations || [];
    send(res, 'progress', { message: `Found ${rawCompanies.length} companies` });

    // Step 3 — Filter
    const filtered = rawCompanies.filter(c => c.primary_domain || c.website_url).map(c => ({
      ...c,
      primary_domain: c.primary_domain || c.website_url?.replace('https://','').replace('http://','').replace('www.','').split('/')[0],
    }));
    send(res, 'progress', { message: `${filtered.length} companies after filtering` });

    // Step 4 — Enrich + Score
    const seenIds = new Set();
    for (const company of filtered) {
      if (seenIds.has(company.id)) continue;
      seenIds.add(company.id);

      send(res, 'progress', { message: `Enriching: ${company.name}` });
      let enriched = company;
      try {
        const enrichResult = await enrichCompany(company.primary_domain, apolloKey);
        enriched = { ...company, ...enrichResult?.organization };
      } catch { }

      send(res, 'progress', { message: `Scoring: ${company.name}` });
      const scored = await scoreCompany(enriched, productDescription, targetAudience);

      if (scored.score >= minCompanyScore) {
        send(res, 'company', {
          id:          enriched.id,
          name:        enriched.name,
          domain:      enriched.primary_domain,
          website:     enriched.website_url || '',
          linkedin:    enriched.linkedin_url || '',
          industry:    enriched.industry || '',
          employees:   enriched.estimated_num_employees || enriched.num_employees || 0,
          location:    enriched.city && enriched.state
                         ? `${enriched.city}, ${enriched.state}`
                         : enriched.state || enriched.country || '',
          description: enriched.short_description || enriched.description || '',
          score:       scored.score,
          scoreReason: scored.reason,
          state:       'qualified',
        });
      }
    }

    send(res, 'complete', { message: 'Company discovery complete' });

  } catch (err) {
    send(res, 'error', { message: err.message });
  } finally {
    res.end();
  }
});

// ── FLOW 2: Contact Finding ───────────────────────────────────────────
outreachRouter.post('/enrich', async (req, res) => {
  const { hunterKey, companies } = req.body;

  if (!hunterKey || !companies?.length) {
    return res.status(400).json({ error: 'Missing hunterKey or companies' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    for (const company of companies) {
      send(res, 'progress', { message: `Finding decision makers at ${company.name}...` });

      if (!company.domain || company.domain.includes(' ') || company.domain.includes(',')) {
        send(res, 'warning', { message: `Skipping ${company.name} — no valid domain` });
        continue;
      }

      let contacts = [];
      try {
        contacts = await findDecisionMakers(company.domain, hunterKey);
      } catch (err) {
        send(res, 'warning', { message: `Hunter failed for ${company.name}: ${err.message}` });
        continue;
      }

      if (!contacts?.length) {
        send(res, 'warning', { message: `No contacts found at ${company.name}` });
        continue;
      }

      for (const contact of contacts.slice(0, 5)) {
        // Skip if no email
        if (!contact.email) continue;

        send(res, 'lead', {
          // Person info from Hunter
          firstName:    contact.first_name,
          lastName:     contact.last_name,
          title:        contact.title || '',
          seniority:    contact.seniority || '',
          department:   contact.department || '',
          email:        contact.email,
          confidence:   contact.confidence || 0,
          linkedin:     contact.linkedin_url || '',

          // Company info from Apollo
          companyName:     company.name,
          companyDomain:   company.domain,
          companyIndustry: company.industry || '',
          companyLocation: company.location || '',
          companyScore:    company.score,
        });
      }
    }

    send(res, 'complete', { message: 'Contact finding complete' });

  } catch (err) {
    send(res, 'error', { message: err.message });
  } finally {
    res.end();
  }
});