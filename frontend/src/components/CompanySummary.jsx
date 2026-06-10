// frontend/src/components/CompanySummary.jsx

import { useState, useEffect, useRef } from 'react';

// ── Cache helpers ─────────────────────────────────────────────────────
const CACHE_PREFIX = 'company_summary_cache_';

export function companyCacheGet(name) {
  try { const r = localStorage.getItem(CACHE_PREFIX + name); return r ? JSON.parse(r) : null; } catch { return null; }
}
export function companyCacheClear(name) {
  try { localStorage.removeItem(CACHE_PREFIX + name); } catch {}
}
function companyCacheSet(name, data) {
  try { localStorage.setItem(CACHE_PREFIX + name, JSON.stringify(data)); } catch {}
}

// ── Module-level in-flight tracker ───────────────────────────────────
// Each entry: { callbacks: [...], abortController: AbortController }
const inFlight = {};

// Caller must initialise inFlight[name] before calling this
async function startFetch(name, serperKey, firecrawlKey) {
  const flight = inFlight[name];
  if (!flight) return;

  try {
    const res = await fetch('/api/company-summary/lookup', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ companyName: name, serperKey, firecrawlKey }),
      signal:  flight.abortController.signal,
    });
    const text = await res.text();
    if (!text?.trim()) throw new Error('Server returned empty response');
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`Invalid response: ${text.substring(0, 100)}`); }
    if (!res.ok || data.error) throw new Error(data.error || 'Lookup failed');
    companyCacheSet(name, data.company);
    inFlight[name]?.callbacks.forEach(cb => cb(data.company, null));
  } catch (err) {
    if (err.name === 'AbortError') {
      inFlight[name]?.callbacks.forEach(cb => cb(null, 'Cancelled'));
    } else {
      inFlight[name]?.callbacks.forEach(cb => cb(null, err.message));
    }
  } finally {
    delete inFlight[name];
  }
}

// Attach to (or start) a fetch. Returns cleanup fn to detach this callback.
function attachFetch(name, serperKey, firecrawlKey, onDone) {
  if (!inFlight[name]) {
    inFlight[name] = { callbacks: [], abortController: new AbortController() };
    inFlight[name].callbacks.push(onDone);
    startFetch(name, serperKey, firecrawlKey);
  } else {
    inFlight[name].callbacks.push(onDone);
  }
  return () => {
    if (inFlight[name]) {
      inFlight[name].callbacks = inFlight[name].callbacks.filter(cb => cb !== onDone);
    }
  };
}

// Abort a running fetch
function abortFetch(name) {
  if (inFlight[name]) {
    inFlight[name].abortController.abort();
    delete inFlight[name];
  }
}

// ─────────────────────────────────────────────────────────────────────
//   CompanySummary — main export
// ─────────────────────────────────────────────────────────────────────

export default function CompanySummary({ companyName, serperKey, firecrawlKey, onCached }) {
  const [state,  setState]  = useState(() => companyCacheGet(companyName) ? 'done' : 'loading');
  const [result, setResult] = useState(() => companyCacheGet(companyName) || null);
  const [error,  setError]  = useState('');
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    const cached = companyCacheGet(companyName);
    if (cached) { setState('done'); setResult(cached); onCached?.(); return; }

    setState('loading'); setResult(null); setError('');

    // FIX: use attachFetch so startFetch never clobbers the callback array
    const cleanup = attachFetch(companyName, serperKey, firecrawlKey, (data, err) => {
      if (!mounted.current) return;
      if (err === 'Cancelled') { setState('idle'); return; }
      if (err) { setError(err); setState('error'); }
      else     { setResult(data); setState('done'); onCached?.(); }
    });

    return cleanup;
  }, [companyName]);

  function stop() {
    abortFetch(companyName);
    setState('idle');
  }

  function refresh() {
    companyCacheClear(companyName);
    abortFetch(companyName); // cancel any in-flight first

    setResult(null); setError(''); setState('loading');

    // FIX: create flight entry, push callback, THEN call startFetch
    // startFetch reads from inFlight[name] — it will NOT reinitialise it
    inFlight[companyName] = { callbacks: [], abortController: new AbortController() };
    inFlight[companyName].callbacks.push((data, err) => {
      if (!mounted.current) return;
      if (err === 'Cancelled') { setState('idle'); return; }
      if (err) { setError(err); setState('error'); }
      else     { setResult(data); setState('done'); onCached?.(); }
    });
    startFetch(companyName, serperKey, firecrawlKey);
  }

  // ── Idle (cancelled) ─────────────────────────────────────────────
  if (state === 'idle') return (
    <div style={{ padding: 40 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)' }}>
        Fetch cancelled.{' '}
        <button onClick={refresh} style={btnStyle('info')}>Retry</button>
      </div>
    </div>
  );

  // ── Loading ──────────────────────────────────────────────────────
  if (state === 'loading') return (
    <div style={{ padding: 40, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 18, color: 'var(--accent)' }}>◌</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
          Researching {companyName}...
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
          Searching web, scraping website, checking registries — takes 30–60 seconds
        </div>
      </div>
      <button onClick={stop} style={btnStyle('danger')}>✕ Stop</button>
    </div>
  );

  // ── Error ────────────────────────────────────────────────────────
  if (state === 'error') return (
    <div style={{ padding: 40, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#ff4455' }}>✕ {error}</span>
      <button onClick={refresh} style={btnStyle('info')}>Try again</button>
    </div>
  );

  if (!result) return null;

  const r   = result;
  const fin = r.financials || {};
  const own = r.ownership  || {};

  // ── Result ───────────────────────────────────────────────────────
  return (
    <div style={{ padding: '32px 40px', maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {r._logo && (
            <img src={r._logo} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'contain', background: 'var(--surface)', border: '1px solid var(--border)', padding: 4 }} />
          )}
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 4 }}>COMPANY INTELLIGENCE</div>
            <h1 style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.5px', marginBottom: 2 }}>{r.name || companyName}</h1>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              {[r.industry, r.headquarters, r.founded ? `Founded ${r.founded}` : null].filter(Boolean).join(' · ')}
            </div>
            {r._domain && (
              <div style={{ fontSize: 11, color: 'var(--info)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>🌐 {r._domain}</div>
            )}
          </div>
        </div>
        <button onClick={refresh} style={btnStyle('info')}>↺ Refresh</button>
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {r.description && <InfoBlock label="OVERVIEW" body={r.description} />}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {r.employee_count && <Metric label="Employees"  value={r.employee_count} />}
        {fin.revenue      && <Metric label="Revenue"    value={`${fin.revenue}${fin.revenue_usd_approx ? ` (~${fin.revenue_usd_approx})` : ''}`} />}
        {fin.net_profit   && <Metric label="Net Profit" value={`${fin.net_profit}${fin.profit_margin ? ` (${fin.profit_margin})` : ''}`} />}
        {fin.yoy_growth   && <Metric label="YoY Growth" value={fin.yoy_growth} />}
        {own.structure    && <Metric label="Ownership"  value={own.structure} />}
      </div>

      {r.key_people?.length > 0 && (
        <Section label="KEY PEOPLE">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {r.key_people.map((p, i) => (
              <div key={i} style={{ padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{p.name}</span>
                {p.title && <span style={{ color: 'var(--text3)', marginLeft: 6, fontSize: 11 }}>{p.title}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {r.products_services?.length > 0 && (
        <Section label="PRODUCTS & SERVICES">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {r.products_services.map((p, i) => <Tag key={i} label={p} color="accent" />)}
          </div>
        </Section>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {r.verticals_served?.length > 0 && (
          <Section label="VERTICALS SERVED" style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {r.verticals_served.map((v, i) => <Tag key={i} label={v} color="info" />)}
            </div>
          </Section>
        )}
        {r.tech_stack_signals?.length > 0 && (
          <Section label="TECH STACK" style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {r.tech_stack_signals.map((t, i) => <Tag key={i} label={t} color="warm" />)}
            </div>
          </Section>
        )}
      </div>

      {r.customers_and_partners?.length > 0 && (
        <Section label="CUSTOMERS & PARTNERS">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {r.customers_and_partners.map((c, i) => <Tag key={i} label={c} color="info" />)}
          </div>
        </Section>
      )}

      {r.competitor_context?.length > 0 && (
        <Section label="COMPETITOR CONTEXT">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {r.competitor_context.map((c, i) => <Tag key={i} label={c} color="warm" />)}
          </div>
        </Section>
      )}

      {r.current_focus && <InfoBlock label="CURRENT FOCUS" body={r.current_focus} />}

      {r.potential_needs?.length > 0 && (
        <Section label="POTENTIAL NEEDS">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {r.potential_needs.map((n, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700, minWidth: 16 }}>→</span>
                <span>{n}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {r.hiring_signals?.length > 0 && (
        <Section label="HIRING SIGNALS">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {r.hiring_signals.map((h, i) => (
              <div key={i} style={{ padding: '4px 10px', background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.2)', borderRadius: 'var(--radius)', fontSize: 11, color: 'var(--text2)' }}>
                <span style={{ color: 'var(--accent)', fontSize: 10, fontFamily: 'var(--font-mono)', marginRight: 6 }}>{h.team}</span>
                {h.role}
              </div>
            ))}
          </div>
        </Section>
      )}

      {r.recent_news?.length > 0 && (
        <Section label="RECENT NEWS">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {r.recent_news.map((n, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 10, minWidth: 80, paddingTop: 2 }}>{n.date}</span>
                <span>{n.headline}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {(fin.source || own.parent_company || own.board_members?.length > 0) && (
        <Section label="OWNERSHIP & FINANCIALS">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
            {fin.source            && <div><span style={{ color: 'var(--text3)' }}>Source       : </span>{fin.source}</div>}
            {r.registered_address  && <div><span style={{ color: 'var(--text3)' }}>Reg. Address : </span>{r.registered_address}</div>}
            {own.parent_company    && <div><span style={{ color: 'var(--text3)' }}>Parent Co    : </span>{own.parent_company}</div>}
            {own.board_members?.length > 0 && (
              <div><span style={{ color: 'var(--text3)' }}>Board        : </span>{own.board_members.join(', ')}</div>
            )}
            {r.funding_summary     && <div><span style={{ color: 'var(--text3)' }}>Funding      : </span>{r.funding_summary}</div>}
          </div>
        </Section>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//   Local UI primitives
// ─────────────────────────────────────────────────────────────────────

function btnStyle(variant = 'info') {
  const colors = {
    info:   { color: 'var(--info)',   border: 'rgba(77,159,255,0.3)' },
    danger: { color: '#ff4455',       border: 'rgba(255,68,85,0.3)'  },
  };
  const c = colors[variant] || colors.info;
  return { padding: '6px 14px', background: 'transparent', color: c.color, border: `1px solid ${c.border}`, borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 };
}

function Section({ label, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.12em' }}>{label}</div>
      {children}
    </div>
  );
}

function InfoBlock({ label, body }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.12em' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
        {body}
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={{ padding: '10px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', minWidth: 120 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{value}</div>
    </div>
  );
}

function Tag({ label, color = 'info' }) {
  const palettes = {
    info:   { bg: 'rgba(77,159,255,0.1)',  border: 'rgba(77,159,255,0.25)',  text: 'var(--info)'   },
    accent: { bg: 'rgba(0,229,160,0.1)',   border: 'rgba(0,229,160,0.25)',   text: 'var(--accent)' },
    warm:   { bg: 'rgba(255,180,77,0.1)',  border: 'rgba(255,180,77,0.25)',  text: '#ffb44d'       },
  };
  const c = palettes[color] || palettes.info;
  return (
    <span style={{ padding: '3px 9px', background: c.bg, border: `1px solid ${c.border}`, borderRadius: 20, fontSize: 11, color: c.text, fontFamily: 'var(--font-mono)' }}>
      {label}
    </span>
  );
}