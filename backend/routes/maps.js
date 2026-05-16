import { Router } from 'express';

export const mapsRouter = Router();

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── Get country code from country name ────────────────────────────────
mapsRouter.get('/country-code', async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'Country name required' });

  try {
    const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(name.trim())}?fields=cca2,name`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !Array.isArray(data) || data.length === 0) {
      return res.status(404).json({ error: `Country "${name}" not found — try a different spelling` });
    }

    const country = data[0];
    res.json({ code: country.cca2, name: country.name.common });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get ZIP codes for city + country code ─────────────────────────────
mapsRouter.get('/zipcodes', async (req, res) => {
  const { city, countryCode } = req.query;
  if (!city || !countryCode) return res.status(400).json({ error: 'city and countryCode required' });

  try {
    // Step 1 — Get state/region from Nominatim
    const cityRes = await fetch(
      `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
        city,
        countrycode: countryCode.toLowerCase(),
        format: 'json',
        limit: 1,
        addressdetails: 1,
      }),
      { headers: { 'User-Agent': 'LeadGenApp/1.0' } }
    );

    const cityData = await cityRes.json();
    if (!cityData.length) return res.json({ zips: [], fallback: true });

    const address = cityData[0].address;

    // Get state code e.g. "US-WA" -> "WA"
    const stateCode = address['ISO3166-2-lvl4']?.split('-')[1];

    if (!stateCode) return res.json({ zips: [], fallback: true });

    // Step 2 — Use Zippopotam with state + city (works for US)
    const zipRes = await fetch(
      `https://api.zippopotam.us/${countryCode.toLowerCase()}/${stateCode.toLowerCase()}/${encodeURIComponent(city.toLowerCase())}`,
      { headers: { 'User-Agent': 'LeadGenApp/1.0' } }
    );

    if (!zipRes.ok) return res.json({ zips: [], fallback: true });

    const zipData = await zipRes.json();
    const zips = (zipData.places || []).map(p => p['post code']);

    if (!zips.length) return res.json({ zips: [], fallback: true });

    res.json({ zips, fallback: false });

  } catch (err) {
    res.json({ zips: [], fallback: true });
  }
});

// ── Run Google Maps scrape ────────────────────────────────────────────
mapsRouter.post('/scrape', async (req, res) => {
  const { searches, apifyKey, maxResults = 20 } = req.body;

  if (!apifyKey) return res.status(400).json({ error: 'Apify API key required' });
  if (!searches?.length) return res.status(400).json({ error: 'No searches provided' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const allLeads = [];

  try {
    send(res, 'start', { total: searches.length });

    for (let si = 0; si < searches.length; si++) {
      const search = searches[si];
      const { business, city, countryCode, zips } = search;
      let cityLeadCount = 0;

      // Build search tasks — one per ZIP or just city if no ZIPs
      const tasks = zips?.length
        ? zips.map(zip => ({
            query: `${business} near ${zip}, ${city}, ${countryCode.toUpperCase()}`,
            zip,
          }))
        : [{ query: `${business} near ${city}, ${countryCode.toUpperCase()}`, zip: '' }];

      send(res, 'progress', {
        message: `Searching: ${business} in ${city}, ${countryCode.toUpperCase()} — ${tasks.length} ZIP(s)`,
        current: si + 1,
        total: searches.length,
      });

      for (const task of tasks) {
        try {
          send(res, 'progress', { message: `Scraping: ${task.query}` });

          const apifyRes = await fetch(
            `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${apifyKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                searchStringsArray: [task.query],
                maxCrawledPlacesPerSearch: maxResults,
                language: 'en',
                countryCode: countryCode.toLowerCase(),
              }),
              signal: AbortSignal.timeout(120000),
            }
          );

          if (!apifyRes.ok) {
            send(res, 'warning', { message: `Apify failed for "${task.query}": ${apifyRes.status}` });
            continue;
          }

          const results = await apifyRes.json();

          for (const d of results) {
            if (cityLeadCount >= maxResults) break;
            const email = d.email || d.emails?.[0] || '';
            const phone = d.phone || d.phoneNumber || d.phoneUnformatted || '';

            // Filter — must have email or phone
            if (!email && !phone) continue;

            const lead = {
              name:         d.title || d.name || '',
              address:      d.address || d.street || '',
              phone,
              email,
              rating:       d.totalScore || d.rating || '',
              website:      d.website || '',
              source:       d.url || d.googleMapsUrl || '',
              zipCode:      task.zip,
              country:      countryCode.toUpperCase(),
              city,
              businessType: business,
              createdAt:    new Date().toISOString(),
            };

            allLeads.push(lead);
            send(res, 'lead', lead);
            cityLeadCount++;
          }
          if (cityLeadCount >= maxResults) {
            send(res, 'progress', { message: `City limit reached for ${city} — ${cityLeadCount} leads` });
            break;
            }

          send(res, 'progress', {
            message: `Found ${results.length} results, ${allLeads.length} qualified leads so far`,
          });

        } catch (err) {
          send(res, 'warning', { message: `Error for "${task.query}": ${err.message}` });
        }
      }
    }

    send(res, 'complete', {
      totalLeads: allLeads.length,
      message: `Complete — ${allLeads.length} leads found`,
    });

  } catch (err) {
    send(res, 'error', { message: err.message });
  } finally {
    res.end();
  }
});