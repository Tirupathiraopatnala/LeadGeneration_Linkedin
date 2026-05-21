import { Router } from 'express';
import * as XLSX from 'xlsx';

export const exportRouter = Router();

// POST /api/export/excel  — body: { leads: [...], filename?: string }
exportRouter.post('/excel', (req, res) => {
  const { leads, filename, runs, exportType } = req.body;

  // Support both single leads array and multiple runs
  const allLeads = exportType === 'all' && runs
    ? runs.flatMap(r => r.leads)
    : leads;

  if (!allLeads || !Array.isArray(allLeads) || allLeads.length === 0) {
    return res.status(400).json({ error: 'No leads provided' });
  }

  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'No leads provided' });
  }

  try {
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Qualified Leads ────────────────────────────────────────
    //
    // Email and Phone columns are kept blank by the LinkedIn pipeline
    // since the Apollo /people/match enrichment step was removed.
    // They stay in the export so the user can paste in contact info
    // gathered from other sources (Hunter, manual lookup, etc.).
    const leadsData = leads.map((l, i) => ({
      '#': i + 1,
      'Name': l.commenterName || '',
      'Email': l.email || '',
      'Phone': l.phone || '',
      'Current Role': l.currentRole || l.designation || '',
      'Current Company': l.currentCompany || l.companyName || '',
      'Industry': l.companyIndustry || '',
      'Company Size': l.companySize || '',
      'Company Location': l.companyLocation || '',
      'Company Website': l.companyWebsite || '',
      'Company Followers': l.companyFollowers || 0,
      'Decision Maker Level': l.decisionMakerLevel || '',
      'Confidence Score': l.confidenceScore || 0,
      'Intent Level': l.intentLevel || '',
      'Comment': l.comment || '',
      'Round 1 Reason': l.round1Reason || '',
      'Round 2 Reason': l.round2Reason || '',
      'Keyword': l.keyword || '',
      'Keyword Type': l.keywordType || '',
      'Profile URL': l.profileUrl || '',
      'Post URL': l.postUrl || '',
    }));

    const ws1 = XLSX.utils.json_to_sheet(leadsData);

    // Column widths
    ws1['!cols'] = [
      { wch: 4 },   // #
      { wch: 25 },  // Name
      { wch: 35 },  // Email
      { wch: 18 },  // Phone
      { wch: 30 },  // Role
      { wch: 30 },  // Company
      { wch: 20 },  // Industry
      { wch: 12 },  // Size
      { wch: 20 },  // Location
      { wch: 30 },  // Website
      { wch: 16 },  // Followers
      { wch: 20 },  // Decision Maker
      { wch: 16 },  // Score
      { wch: 12 },  // Intent
      { wch: 50 },  // Comment
      { wch: 40 },  // R1 Reason
      { wch: 40 },  // R2 Reason
      { wch: 30 },  // Keyword
      { wch: 14 },  // KW Type
      { wch: 40 },  // Profile URL
      { wch: 40 },  // Post URL
    ];

    XLSX.utils.book_append_sheet(wb, ws1, 'Qualified Leads');
    if (exportType === 'all' && runs?.length > 1) {
  runs.forEach((run, idx) => {
    if (run.leads.length === 0) return;
    const runData = run.leads.map((l, i) => ({
      '#': i + 1,
      'Name': l.commenterName || '',
      'Current Role': l.currentRole || '',
      'Current Company': l.currentCompany || '',
      'Industry': l.companyIndustry || '',
      'Company Size': l.companySize || '',
      'Company LinkedIn': l.companyLinkedinUrl || '',
      'Company Website': l.companyWebsite || '',
      'Company Followers': l.companyFollowers || 0,
      'Decision Maker Level': l.decisionMakerLevel || '',
      'Confidence Score': l.confidenceScore || 0,
      'Intent Level': l.intentLevel || '',
      'Comment': l.comment || '',
      'Round 1 Reason': l.round1Reason || '',
      'Round 2 Reason': l.round2Reason || '',
      'Keyword': l.keyword || '',
      'Profile URL': l.profileUrl || '',
      'Post URL': l.postUrl || '',
    }));
    const ws = XLSX.utils.json_to_sheet(runData);
    ws['!cols'] = [
      { wch: 4 },  { wch: 25 }, { wch: 30 }, { wch: 30 },
      { wch: 20 }, { wch: 12 }, { wch: 35 }, { wch: 30 },
      { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 12 },
      { wch: 50 }, { wch: 40 }, { wch: 40 }, { wch: 30 },
      { wch: 40 }, { wch: 40 },
    ];
    const runDate = new Date(run.startedAt).toLocaleDateString('en-GB').replace(/\//g, '-');
    XLSX.utils.book_append_sheet(wb, ws, `Run ${idx + 1} (${runDate})`);
  });
}

    // ── Sheet 2: Summary Stats ──────────────────────────────────────────
    const intentCounts = { high: 0, medium: 0, low: 0 };
    const industryCounts = {};
    const decisionLevels = {};
    const companySizes = {};
    const scoreDist = { '6-7': 0, '8-9': 0, '10': 0 };

    for (const l of leads) {
      if (l.intentLevel) intentCounts[l.intentLevel] = (intentCounts[l.intentLevel] || 0) + 1;
      if (l.companyIndustry) industryCounts[l.companyIndustry] = (industryCounts[l.companyIndustry] || 0) + 1;
      if (l.decisionMakerLevel) decisionLevels[l.decisionMakerLevel] = (decisionLevels[l.decisionMakerLevel] || 0) + 1;
      if (l.companySize) companySizes[l.companySize] = (companySizes[l.companySize] || 0) + 1;
      const score = l.confidenceScore || 0;
      if (score >= 10) scoreDist['10']++;
      else if (score >= 8) scoreDist['8-9']++;
      else if (score >= 6) scoreDist['6-7']++;
    }

    const summaryRows = [
      ['LEAD GENERATION SUMMARY', ''],
      ['Generated At', new Date().toLocaleString()],
      ['Total Qualified Leads', leads.length],
      ['', ''],
      ['INTENT LEVEL BREAKDOWN', ''],
      ['High Intent', intentCounts.high || 0],
      ['Medium Intent', intentCounts.medium || 0],
      ['Low Intent', intentCounts.low || 0],
      ['', ''],
      ['CONFIDENCE SCORE DISTRIBUTION', ''],
      ['Score 10', scoreDist['10']],
      ['Score 8-9', scoreDist['8-9']],
      ['Score 6-7', scoreDist['6-7']],
      ['', ''],
      ['DECISION MAKER LEVELS', ''],
      ...Object.entries(decisionLevels).map(([k, v]) => [k, v]),
      ['', ''],
      ['COMPANY SIZES', ''],
      ...Object.entries(companySizes).map(([k, v]) => [k, v]),
      ['', ''],
      ['TOP INDUSTRIES', ''],
      ...Object.entries(industryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([k, v]) => [k, v]),
    ];

    const ws2 = XLSX.utils.aoa_to_sheet(summaryRows);
    ws2['!cols'] = [{ wch: 35 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

    // Write to buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fname = (filename || `leads_${Date.now()}`).replace(/[^a-z0-9_-]/gi, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: `Excel export failed: ${err.message}` });
  }
});



// ADD at the bottom of export.js
exportRouter.post('/outreach', (req, res) => {
  const { leads, filename } = req.body;
  if (!leads?.length) return res.status(400).json({ error: 'No leads provided' });

  try {
    const wb = XLSX.utils.book_new();
    const data = leads.map((l, i) => ({
      '#': i + 1,
      'First Name': l.firstName || '',
      'Last Name': l.lastName || '',
      'Email': l.email || '',
      'LinkedIn': l.linkedin || '',
      'Title': l.title || '',
      'Company': l.companyName || '',
      'Industry': l.companyIndustry || '',
      'Company Score': l.companyScore || 0,
      'Subject 1': l.subject1 || '',
      'Email 1': l.email1 || '',
      'Subject 2': l.subject2 || '',
      'Email 2': l.email2 || '',
      'Subject 3': l.subject3 || '',
      'Email 3': l.email3 || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 4 }, { wch: 15 }, { wch: 15 }, { wch: 30 },
      { wch: 35 }, { wch: 30 }, { wch: 25 }, { wch: 20 },
      { wch: 12 }, { wch: 35 }, { wch: 60 }, { wch: 35 },
      { wch: 60 }, { wch: 35 }, { wch: 60 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Outreach Leads');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fname = (filename || `outreach_${Date.now()}`).replace(/[^a-z0-9_\-]/gi, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: `Export failed: ${err.message}` });
  }
});

exportRouter.post('/maps', (req, res) => {
  const { leads, filename } = req.body;
  if (!leads?.length) return res.status(400).json({ error: 'No leads provided' });

  try {
    const wb = XLSX.utils.book_new();
    const data = leads.map((l, i) => ({
      '#':            i + 1,
      'Name':         l.name || '',
      'Address':      l.address || '',
      'Phone':        l.phone || '',
      'Email':        l.email || '',
      'Rating':       l.rating || '',
      'Website':      l.website || '',
      'Google Maps':  l.source || '',
      'ZIP Code':     l.zipCode || '',
      'Country':      l.country || '',
      'City':         l.city || '',
      'Business Type': l.businessType || '',
      'Created At':   l.createdAt || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 4 },  { wch: 30 }, { wch: 40 }, { wch: 18 },
      { wch: 30 }, { wch: 8 },  { wch: 30 }, { wch: 40 },
      { wch: 10 }, { wch: 8 },  { wch: 20 }, { wch: 20 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Maps Leads');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fname = (filename || `maps_${Date.now()}`).replace(/[^a-z0-9_\-]/gi, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: `Export failed: ${err.message}` });
  }
});