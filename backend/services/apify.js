const HUNTER_BASE = 'https://api.hunter.io/v2';

export async function findDecisionMakers(domain, hunterKey) {
  // Clean domain
  const cleanDomain = domain
    ?.replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();

  // Skip if invalid
  if (!cleanDomain || cleanDomain.includes(' ') || cleanDomain.includes(',')) {
    throw new Error(`Invalid domain: "${domain}"`);
  }

  // Attempt 1 — strictest
  let emails = await hunterSearch(cleanDomain, hunterKey, 'executive,director', 'personal');

  // Attempt 2 — wider seniority
  if (!emails.length) {
    emails = await hunterSearch(cleanDomain, hunterKey, 'executive,director,senior', 'personal');
  }

  // Attempt 3 — any email type
  if (!emails.length) {
    emails = await hunterSearch(cleanDomain, hunterKey, 'executive,director,senior', '');
  }

  return emails.map(p => ({
    first_name:   p.first_name || '',
    last_name:    p.last_name || '',
    title:        p.position || '',
    email:        p.value || '',
    linkedin_url: p.linkedin || '',
    seniority:    p.seniority || '',
    department:   Array.isArray(p.departments)
                    ? p.departments.join(', ')
                    : (p.departments || p.department || ''),
    confidence:   p.confidence || 0,
  }));
}

async function hunterSearch(domain, hunterKey, seniority, type) {
  const params = new URLSearchParams({
    domain,
    api_key: hunterKey,
    limit: '5',
  });
  if (seniority) params.set('seniority', seniority);
  if (type) params.set('type', type);

  const res = await fetch(`${HUNTER_BASE}/domain-search?${params}`);
  if (!res.ok) throw new Error(`Hunter domain search failed [${res.status}]`);
  const data = await res.json();
  return data?.data?.emails || [];
}