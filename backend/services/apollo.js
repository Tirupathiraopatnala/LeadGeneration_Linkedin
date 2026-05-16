const APOLLO_BASE = 'https://api.apollo.io';

async function apolloRequest(endpoint, method = 'GET', body = null, apiKey) {
  if (!apiKey) throw new Error('Apollo API key is missing');

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${APOLLO_BASE}${endpoint}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo ${endpoint} failed [${res.status}]: ${text}`);
  }
  return res.json();
}

export async function searchCompanies(keywords, apolloKey, options = {}) {
  const keywordArray = Array.isArray(keywords) ? keywords : [keywords];

  const body = {
    q_organization_keyword_tags: keywordArray,
    page: options.page || 1,
    per_page: options.perPage || 10,
  };

  // Only add if provided
  if (options.locations?.length) {
    body.organization_locations = options.locations;
  }
  if (options.employeeRanges?.length) {
    body.organization_num_employees_ranges = options.employeeRanges;
  }

  return apolloRequest('/api/v1/organizations/search', 'POST', body, apolloKey);
}

export async function enrichCompany(domain, apolloKey) {
  return apolloRequest(`/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`, 'GET', null, apolloKey);
}

export async function matchPerson(firstName, lastName, organizationName, apolloKey) {
  return apolloRequest('/api/v1/people/match', 'POST', {
    first_name: firstName,
    last_name: lastName,
    organization_name: organizationName,
  }, apolloKey);
}