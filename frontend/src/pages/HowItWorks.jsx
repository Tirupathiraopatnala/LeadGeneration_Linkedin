// Plain-English guide to the three lead-gen flows. Intended for
// non-technical sales users so they can pick the right tool without
// having to read source code or remember internal jargon.

const SCORE_TIERS = [
  { range: '1–3',  label: 'Weak fit',     desc: 'Wrong industry, size, or outside audience' },
  { range: '4–5',  label: 'Borderline',   desc: 'Some signal but several mismatches' },
  { range: '6–7',  label: 'Decent fit',   desc: 'Matches ICP on industry OR size' },
  { range: '8–9',  label: 'Strong fit',   desc: 'Matches on industry AND size AND audience' },
  { range: '10',   label: 'Perfect fit',  desc: 'Textbook customer' },
];

const INTENT_TIERS = [
  { level: 'HIGH',   color: '#00e5a0', desc: 'Explicit pain point or buying language in the comment' },
  { level: 'MEDIUM', color: '#ffb900', desc: 'Curiosity or evaluation questions, no clear pain yet' },
  { level: 'LOW',    color: '#8888a0', desc: 'Generic engagement, weak buying signal' },
];

export default function HowItWorks() {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* ── Page header ─────────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 4 }}>SALES GUIDE</div>
          <h1 style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-0.8px', marginBottom: 8 }}>How each tool works</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 }}>
            Three different ways to find leads, each strong for different kinds of buyers.
            Read this once and you'll know which tool to reach for and how to read its output.
          </p>
        </div>

        {/* ── Quick decision matrix ───────────────────────────────── */}
        <Section title="Which one should I use?" tone="accent">
          <Table
            rows={[
              ['You want…', 'Use…'],
              ['Buyers who already SAID they have a problem', 'LinkedIn'],
              ['Companies that LOOK like your best customers', 'Apollo'],
              ['Local businesses with a phone or email', 'Maps'],
            ]}
            firstRowIsHeader
          />
          <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
            All three can run in parallel and export to Excel separately. A common combo: use
            Apollo to find target companies, then re-run LinkedIn on those company names to
            catch any employees publicly discussing pain points.
          </p>
        </Section>

        {/* ── LinkedIn ────────────────────────────────────────────── */}
        <Section title="1. LinkedIn — Intent prospecting" badge="in" badgeStyle={{ background: 'rgba(77,159,255,0.12)', border: '1px solid rgba(77,159,255,0.3)', color: 'var(--info)' }}>
          <Block label="What it does">
            Finds people <strong>commenting on LinkedIn posts</strong> about topics you care about,
            then uses AI to figure out which of those commenters are real potential buyers
            (vs. competitors, students, or content creators).
          </Block>

          <Block label="Best for">
            B2B SaaS, AI tools, services. <strong>High-intent, low-volume</strong> — these
            people self-identified by typing about a pain point. Expect 5–30 qualified leads
            per run, but they're warm.
          </Block>

          <Block label="What you give it">
            <ul style={ulStyle}>
              <li><Code>KEYWORDS</Code> — phrases your target customer would naturally write in a comment, e.g. <em>"struggling with lead generation"</em>, <em>"need more B2B leads"</em>, <em>"hiring SDR"</em>. Default list provided.</li>
              <li><Code>ConnectSafely</Code> key + Account ID (Settings) for LinkedIn access.</li>
              <li><em>Optional:</em> Apollo API key — if set, every qualified lead gets a verified work email and phone attached.</li>
            </ul>
          </Block>

          <Block label="How it works (under the hood)">
            <ol style={olStyle}>
              <li><strong>Find posts</strong> mentioning each keyword (past month by default).</li>
              <li><strong>Pull comments</strong> from those posts (up to 100 each).</li>
              <li><strong>AI screen (Round 1)</strong> — quick pass over every comment looking for buying signals and filtering out sellers/promoters. Tags each as HIGH / MEDIUM / HIDDEN intent.</li>
              <li><strong>Enrich</strong> — for flagged commenters, fetches their full profile and current company.</li>
              <li><strong>AI qualify (Round 2)</strong> — deep analysis with profile + company context. Produces a <Code>confidenceScore</Code> 1–10 and a <Code>decisionMakerLevel</Code>.</li>
              <li><strong>Apollo enrich</strong> (if configured) — attaches email + phone using LinkedIn URL match.</li>
            </ol>
          </Block>

          <Block label="Reading the output — Intent level">
            {INTENT_TIERS.map(t => (
              <div key={t.level} style={{ display: 'flex', gap: 12, padding: '4px 0', fontSize: 13 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: t.color, width: 75 }}>{t.level}</span>
                <span style={{ color: 'var(--text2)' }}>{t.desc}</span>
              </div>
            ))}
          </Block>

          <Block label="Reading the output — Confidence score">
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>
              1–10 from the Round 2 qualifier. <strong>6 is the minimum kept</strong> (configurable),
              8+ is strong, 10 is a perfect ICP match. Pair this with intent level for the
              hottest leads: <Code>HIGH intent + score 8+</Code> is what you want at the top of your call list.
            </p>
          </Block>

          <Block label="Reading the output — Email status">
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
              Apollo's free tier returns most emails as <Code>locked</Code> — you can see the
              person exists but you need to burn a credit to reveal the address. Locked rows
              show a 🔒 icon. The Summary sheet in the Excel export tells you the unlocked/locked
              ratio so you know whether to upgrade.
            </p>
          </Block>
        </Section>

        {/* ── Apollo ──────────────────────────────────────────────── */}
        <Section title="2. Apollo — ICP-driven prospecting" badge="🎯" badgeStyle={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.3)', color: 'var(--accent)' }}>
          <Block label="What it does">
            Searches Apollo's company database for companies that match your <strong>ideal customer
            profile (ICP)</strong>, scores each one with AI, then finds decision-maker emails at
            the keepers via Hunter.io.
          </Block>

          <Block label="Best for">
            When you know what your buyer LOOKS LIKE (industry + size + geography) more than you
            know what they SAY. <strong>Higher volume, lower per-lead intent</strong> than LinkedIn.
            Good for filling the top of the funnel.
          </Block>

          <Block label="What you give it">
            <ul style={ulStyle}>
              <li><Code>PRODUCT DESCRIPTION</Code> — 1–2 sentences about what you sell.</li>
              <li><Code>TARGET AUDIENCE</Code> — who buys it. AI converts this into Apollo search keywords automatically.</li>
              <li><Code>TARGET LOCATIONS</Code> — comma-separated countries or regions.</li>
              <li><Code>COMPANY SIZE</Code> — employee ranges (default: 11–50, 51–200, 201–500).</li>
              <li><Code>MIN COMPANY SCORE</Code> — threshold for keeping a company (see rubric below).</li>
              <li>Apollo + Hunter API keys (Settings).</li>
            </ul>
          </Block>

          <Block label="How it works — two-step flow">
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10 }}>
              You run it as <strong>two separate button clicks</strong>, not one pipeline:
            </p>
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 10 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 6 }}>STEP 1 — DISCOVER COMPANIES</div>
              <ol style={olStyle}>
                <li>AI cleans your audience description into search keywords.</li>
                <li>Apollo searches by keywords + location + employee size.</li>
                <li>Each result is enriched with full firmographics.</li>
                <li>AI scores each company 0–10 against your ICP (rubric below).</li>
                <li>Companies at or above your threshold land in the COMPANIES tab.</li>
              </ol>
            </div>
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--info)', letterSpacing: '0.1em', marginBottom: 6 }}>STEP 2 — FIND CONTACTS</div>
              <ol style={olStyle}>
                <li>For each kept company, Hunter.io looks up executives & directors by domain.</li>
                <li>Returns name, title, seniority, verified work email (5 per company max).</li>
                <li>Contacts land in the LEADS tab, exportable to Excel.</li>
              </ol>
            </div>
          </Block>

          <Block label="The 0–10 score — what it means">
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
              {SCORE_TIERS.map(t => (
                <div key={t.label} style={{ display: 'flex', gap: 12, padding: '4px 0', fontSize: 13, color: 'var(--text2)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, width: 50, color: 'var(--text)' }}>{t.range}</span>
                  <span style={{ fontWeight: 700, width: 110 }}>{t.label}</span>
                  <span>{t.desc}</span>
                </div>
              ))}
            </div>
            <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
              <strong>Recommended threshold: 7.</strong> Start there, look at what you get, then
              raise to 8 if too many borderline companies sneak through. The score's <em>reason</em>
              field shows which ICP criteria matched so you can sanity-check the AI.
            </p>
          </Block>
        </Section>

        {/* ── Maps ────────────────────────────────────────────────── */}
        <Section title="3. Maps — Local business scraping" badge="🗺" badgeStyle={{ background: 'rgba(255,185,0,0.08)', border: '1px solid rgba(255,185,0,0.3)', color: '#ffb900' }}>
          <Block label="What it does">
            Scrapes Google Maps for businesses of a given type in a city or ZIP, keeps the ones
            with a phone or email, and dumps everything else.
          </Block>

          <Block label="Best for">
            Targeting <strong>physical-location businesses</strong> — datacenters, clinics,
            agencies, restaurants, anyone with a Google Maps listing. <strong>High volume, no
            intent signal.</strong> You're cold-calling/cold-emailing on firmographic fit only.
          </Block>

          <Block label="What you give it">
            <ul style={ulStyle}>
              <li><Code>BUSINESS TYPE</Code> — what to search for (e.g. "Datacenters").</li>
              <li><Code>COUNTRY</Code> + <Code>CITY</Code>.</li>
              <li><em>Optional:</em> <Code>ZIP / PINCODE</Code> — narrows the search to one area. Leave blank to search the whole city.</li>
              <li>Apify API key (Settings).</li>
            </ul>
          </Block>

          <Block label="How it works">
            <ol style={olStyle}>
              <li>For each search, we kick off Apify's Google Places scraper with the query <Code>{`{business} near {ZIP}, {city}, {country}`}</Code>.</li>
              <li>The scrape runs asynchronously — live progress updates every 2–10 seconds (e.g. <em>"Apify: 7 places scraped — 32s elapsed"</em>).</li>
              <li>Each result is filtered: <strong>must have a phone OR an email</strong>, otherwise it's discarded as unusable.</li>
              <li>Click STOP at any time to abort the Apify run and stop burning credits.</li>
            </ol>
          </Block>

          <Block label="No AI scoring — why?">
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
              Maps results are deterministic: a business either matches your search term or it
              doesn't, and either has contact info or it doesn't. There's nothing for an AI to
              decide. The filter is binary, the data is structured. If you want quality scoring,
              feed these leads into Apollo (paste the company name) — that flow has the rubric.
            </p>
          </Block>
        </Section>

        {/* ── Pro tips ────────────────────────────────────────────── */}
        <Section title="Practical tips" tone="muted">
          <ul style={{ ...ulStyle, fontSize: 13 }}>
            <li><strong>Start every session on the right tool.</strong> LinkedIn = warm but slow. Apollo = volume by ICP. Maps = local cold list. Mixing them in your head is what burns time.</li>
            <li><strong>STOP is real.</strong> All three flows now actually abort the backend work when you click STOP — no more wondering if it's still burning API credits.</li>
            <li><strong>Run state survives navigation.</strong> Start a scrape, browse another tab, come back — the run is still going and the log is intact.</li>
            <li><strong>Excel exports include a Summary sheet.</strong> Open it to see hit rate, top industries, decision-maker breakdown. Useful for reporting back to the team.</li>
            <li><strong>Apollo's free tier locks most emails.</strong> The COMPANIES list works fine on free; emails are where the credit wall is.</li>
            <li><strong>ConnectSafely needs a live LinkedIn cookie.</strong> If you see "Failed to get LinkedIn authentication credentials", your <Code>li_at</Code> cookie expired — refresh it inside ConnectSafely's dashboard.</li>
          </ul>
        </Section>

      </div>
    </div>
  );
}

// ── helper components ───────────────────────────────────────────────

function Section({ title, badge, badgeStyle, tone, children }) {
  const accent = tone === 'accent';
  const muted = tone === 'muted';
  return (
    <div style={{
      background: accent ? 'rgba(0,229,160,0.04)' : 'var(--surface)',
      border: accent ? '1px solid rgba(0,229,160,0.2)' : '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px 24px',
      marginBottom: 20,
      opacity: muted ? 0.92 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        {badge && (
          <span style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, ...badgeStyle }}>
            {badge}
          </span>
        )}
        <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px', color: 'var(--text)' }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Block({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text3)', marginBottom: 6 }}>{label}</div>
      <div style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

function Code({ children }) {
  return (
    <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '1px 6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)' }}>
      {children}
    </code>
  );
}

function Table({ rows, firstRowIsHeader }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map((row, i) => {
          const isHeader = firstRowIsHeader && i === 0;
          return (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: '8px 12px',
                  fontFamily: isHeader ? 'var(--font-mono)' : 'inherit',
                  fontSize: isHeader ? 10 : 13,
                  letterSpacing: isHeader ? '0.1em' : 0,
                  color: isHeader ? 'var(--text3)' : 'var(--text2)',
                  fontWeight: isHeader ? 500 : (j === 1 ? 700 : 400),
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const ulStyle = {
  margin: 0,
  paddingLeft: 20,
  fontSize: 13,
  color: 'var(--text2)',
  lineHeight: 1.7,
};

const olStyle = {
  margin: 0,
  paddingLeft: 20,
  fontSize: 13,
  color: 'var(--text2)',
  lineHeight: 1.7,
};
