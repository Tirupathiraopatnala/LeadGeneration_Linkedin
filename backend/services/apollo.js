const APOLLO_BASE = 'https://api.apollo.io';

async function apolloRequest(endpoint, method = 'GET', body = null, apiKey, signal) {
  if (!apiKey) throw new Error('Apollo API key is missing');

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    signal,
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${APOLLO_BASE}${endpoint}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo ${endpoint} failed [${res.status}]: ${text}`);
  }
  return res.json();
}

// Apollo company search.
//
// Deterministic structured-filter version. Replaces the earlier
// keyword-driven flow (which was fed by an AI-extracted keyword list
// and produced false matches — e.g. IT companies serving retail
// instead of actual retail companies).
//
// `filters` is an object:
//   industries       — array of industry name strings, sent as keyword tags
//   technologies     — array of Apollo technology UIDs / slugs (paid feature)
//   locations        — array of location strings ("United States", "California")
//   employeeRanges   — array of "min,max" range strings ("11,50")
//   page, perPage    — pagination (defaults: 1, 25)
export async function searchCompanies(filters = {}, apolloKey, signal) {
  const {
    industries = [],
    technologies = [],
    locations = [],
    employeeRanges = [],
    page = 1,
    perPage = 25,
  } = filters;

  const body = { page, per_page: perPage };

  // Industries go via keyword tags. Apollo matches these against its
  // industry taxonomy + tags, so single clean values ("retail",
  // "manufacturing") produce far better hits than free-form prose.
  if (industries.length) {
    body.q_organization_keyword_tags = industries;
  }
  if (technologies.length) {
    // Paid-tier filter. On free tier Apollo returns an error or 0 rows;
    // the route catches that and reports it.
    body.currently_using_any_of_technology_uids = technologies;
  }
  if (locations.length) {
    body.organization_locations = locations;
  }
  if (employeeRanges.length) {
    body.organization_num_employees_ranges = employeeRanges;
  }

  return apolloRequest('/api/v1/organizations/search', 'POST', body, apolloKey, signal);
}

export async function enrichCompany(domain, apolloKey, signal) {
  return apolloRequest(`/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`, 'GET', null, apolloKey, signal);
}

// Detect Apollo's locked-email sentinel ("email_not_unlocked@domain.com")
// Returned on free / out-of-credit accounts.
function isLockedEmail(email) {
  return !!email && /email_not_unlocked@/i.test(email);
}

function splitName(full) {
  if (!full) return { firstName: '', lastName: '' };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

// Enrich a person via Apollo `/people/match`.
// Prefers LinkedIn URL (highest match accuracy), falls back to name + company.
// On free / no-credit accounts, `email` may be locked — caller can read
// `emailLocked` to surface this in the UI.
export async function matchPerson({ linkedinUrl, name, firstName, lastName, organizationName, domain }, apolloKey, signal) {
  if (!firstName && !lastName && name) {
    ({ firstName, lastName } = splitName(name));
  }

  const body = {
    reveal_personal_emails: true,
    reveal_phone_number: true,
  };
  if (linkedinUrl) body.linkedin_url = linkedinUrl;
  if (firstName) body.first_name = firstName;
  if (lastName) body.last_name = lastName;
  if (organizationName) body.organization_name = organizationName;
  if (domain) body.domain = domain;

  // Need at least one strong identifier
  if (!linkedinUrl && !((firstName || lastName) && (organizationName || domain))) {
    return null;
  }

  const data = await apolloRequest('/api/v1/people/match', 'POST', body, apolloKey, signal);
  const person = data?.person;
  if (!person) return null;

  const rawEmail = person.email || '';
  const emailLocked = isLockedEmail(rawEmail);
  const personalEmail = (person.personal_emails || []).find(e => !isLockedEmail(e)) || '';
  const workEmail = !emailLocked ? rawEmail : '';

  const phone = person.phone_numbers?.[0]?.sanitized_number
    || person.phone_numbers?.[0]?.raw_number
    || person.organization?.phone
    || '';

  return {
    apolloPersonId: person.id || '',
    email: workEmail || personalEmail || '',
    emailType: workEmail ? 'work' : (personalEmail ? 'personal' : ''),
    emailStatus: person.email_status || '',
    emailLocked,
    personalEmails: (person.personal_emails || []).filter(e => !isLockedEmail(e)),
    phone,
    title: person.title || '',
    seniority: person.seniority || '',
    departments: person.departments || [],
    city: person.city || '',
    state: person.state || '',
    country: person.country || '',
    linkedinUrl: person.linkedin_url || '',
  };
}