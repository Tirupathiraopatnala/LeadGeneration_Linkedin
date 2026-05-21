import OpenAI from 'openai';

function getClient() {
  if (!process.env.AZURE_OPENAI_KEY || !process.env.AZURE_OPENAI_ENDPOINT) {
    throw new Error('Azure OpenAI credentials not configured in .env');
  }
  return new OpenAI({
    apiKey: process.env.AZURE_OPENAI_KEY,
    baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1-mini'}`,
    defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION || '2024-02-01' },
    defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_KEY },
  });
}

async function azureRequest(messages, maxTokens = 1000, signal, temperature = 0.2) {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1-mini',
    messages,
    temperature,
    max_tokens: maxTokens,
  }, { signal });
  return response.choices[0]?.message?.content || '';
}

// Clean keywords for Apollo search.
//
// History: the previous version of this prompt produced hallucinated
// criteria (e.g. "revenue over 10 million") from an input like
// "Businesses retail and manufacturing sector". This version is strict
// about ONLY emitting industry/sector terms derived from words present
// in the user's input, and is run at temperature 0 for determinism.
export async function cleanSearchQuery(targetAudience, signal) {
  const content = await azureRequest([{
    role: 'user',
    content: `You convert a sales target-audience description into Apollo.io company-search keywords.

STRICT RULES:
1. Output ONLY industry, sector, vertical, or business-type terms.
2. Each keyword MUST be derived from words present in the user's input. Do not invent revenue, size, location, or technology criteria that the user did not write.
3. If the user mentions multiple industries, output each one as its own keyword.
4. Drop generic filler that doesn't narrow Apollo's search: "businesses", "companies", "B2B", "enterprise", "mid-sized", "SMB", "organisations".
5. If the input contains no industry/sector signal at all, return the single keyword "general business".

EXAMPLES:
Input: "Businesses in retail and manufacturing sector"
Output: retail, manufacturing

Input: "Mid-market SaaS companies with 10M+ revenue"
Output: SaaS, software

Input: "Healthcare and pharmaceutical companies in Europe"
Output: healthcare, pharmaceutical

Input: "Banks and insurance firms"
Output: banking, insurance

Input: "Logistics and supply chain businesses"
Output: logistics, supply chain

Now convert this input. Return ONLY the keywords as a comma-separated list, no prose, no quotes, no explanation:

Input: "${targetAudience}"
Output:`,
  }], 100, signal, 0);
  return content.trim().split(',').map(k => k.trim()).filter(Boolean);
}

// Score a company
export async function scoreCompany(companyData, productDescription, targetAudience, signal) {
  const raw = await azureRequest([{
    role: 'user',
    content: `You are a B2B sales analyst. Score this company as a potential customer for our product.

OUR PRODUCT: ${productDescription}
TARGET AUDIENCE: ${targetAudience}

COMPANY:
Name: ${companyData.name}
Industry: ${companyData.industry}
Description: ${companyData.short_description || companyData.description || 'N/A'}
Employees: ${companyData.num_employees || 'Unknown'}
Location: ${companyData.hq_location || 'Unknown'}
Website: ${companyData.website_url || 'Unknown'}

HARD DISQUALIFICATION RULES — apply these FIRST, before the rubric:
A. If the TARGET AUDIENCE names specific industries (e.g. "retail and manufacturing") and this company's primary INDUSTRY is not one of them or a clear synonym, the score is at most 3. No exceptions for size or revenue.
B. A company that SELLS TO the target industry but is NOT IN it does NOT match. E.g. if audience says "retail" and this is an "IT services" or "SaaS" company whose product happens to be used by retailers, that is a 2-3, NOT a high score.
C. If TARGET AUDIENCE is generic (no industries named), skip rule A and use the rubric alone.

SCORING RUBRIC — apply only if not disqualified above. Use the WHOLE range, do NOT cluster around 7:
1-3  Weak fit. Wrong industry, wrong size, or clearly outside the audience.
4-5  Borderline. Some matching signal but several important mismatches.
6-7  Decent fit. Matches ICP on industry OR size — plausibly a buyer.
8-9  Strong fit. Matches on industry AND size AND audience description.
10   Perfect fit. Looks like the textbook customer described above.

Score from 0-10. Return ONLY JSON, no markdown:
{
  "score": 8,
  "reason": "one line explanation. If you applied a hard disqualification rule (A or B), say which and why."
}`,
  }], 200, signal);

  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { score: 0, reason: 'Failed to score' };
  }
}

// Create personalisation brief
export async function createPersonalisationBrief(personProfile, companyData, productDescription, signal) {
  return azureRequest([{
    role: 'user',
    content: `You are a B2B sales expert. Create a personalisation brief for a cold email.

PRODUCT: ${productDescription}

PERSON:
Name: ${personProfile.name}
Title: ${personProfile.title}
Bio: ${personProfile.bio || 'N/A'}
LinkedIn Headline: ${personProfile.headline || 'N/A'}

COMPANY:
Name: ${companyData.name}
Industry: ${companyData.industry}
Description: ${companyData.description || 'N/A'}

Write a brief covering:
1. One specific insight about this person
2. Best personalisation angle
3. How our product connects to their situation

Keep it under 150 words.`,
  }], 300, signal);
}

// Write 3 cold emails
export async function writeColdEmails(personalisationBrief, personName, productDescription, signal) {
  const raw = await azureRequest([{
    role: 'user',
    content: `Write 3 cold emails based on this brief. Each email under 100 words, informal tone, ends with a curiosity question. No subject lines.

PRODUCT: ${productDescription}
PROSPECT: ${personName}
BRIEF: ${personalisationBrief}

Return ONLY JSON, no markdown:
{
  "initial_email": "...",
  "first_follow_up": "...",
  "second_follow_up": "..."
}`,
  }], 800, signal);

  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return {
      initial_email: raw,
      first_follow_up: '',
      second_follow_up: '',
    };
  }
}

// Write 3 subject lines
export async function writeSubjectLines(emails, personFirstName, signal) {
  const raw = await azureRequest([{
    role: 'user',
    content: `Write 3 email subject lines, one for each email. Lowercase, 5-7 words, personal, non-salesy, use the prospect's first name.

Prospect first name: ${personFirstName}

Email 1: ${emails.initial_email}
Email 2: ${emails.first_follow_up}
Email 3: ${emails.second_follow_up}

Return ONLY JSON, no markdown:
{
  "subject1": "...",
  "subject2": "...",
  "subject3": "..."
}`,
  }], 200, signal);

  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { subject1: '', subject2: '', subject3: '' };
  }
}