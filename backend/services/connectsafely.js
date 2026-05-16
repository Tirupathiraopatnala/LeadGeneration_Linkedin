// ConnectSafely API Service
// All calls use the Bearer token provided by the frontend (user's key)

const BASE_URL = 'https://api.connectsafely.ai';

async function csRequest(endpoint, body, apiKey) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ConnectSafely ${endpoint} failed [${res.status}]: ${text}`);
  }

  return res.json();
}

// Search LinkedIn posts by keyword
export async function searchPosts(keyword, accountId, apiKey, options = {}) {
  return csRequest('/linkedin/posts/search', {
    accountId,
    keywords: keyword,
    count: options.postLimit || 20,
    datePosted: options.datePosted || 'past-month',
  }, apiKey);
}

// Get all comments for a post
export async function getComments(postUrl, accountId, apiKey, options = {}) {
  return csRequest('/linkedin/posts/comments/all', {
    accountId,
    postUrl,
    limit: options.commentLimit || 100,
  }, apiKey);
}

// Get LinkedIn profile
export async function getProfile(profileId, accountId, apiKey) {
  return csRequest('/linkedin/profile', {
    accountId,
    profileId,
    includeExperience: true,
    includeEducation: true,
    includeSkills: true,
    forceRefresh: true,
  }, apiKey);
}

// Search company by name
export async function searchCompany(keyword, accountId, apiKey) {
  return csRequest('/linkedin/search/companies', {
    accountId,
    keywords: keyword,
    count: 1,
  }, apiKey);
}

// Get full company details
export async function getCompanyDetails(companyId, accountId, apiKey) {
  return csRequest('/linkedin/search/companies/details', {
    accountId,
    companyId,
  }, apiKey);
}