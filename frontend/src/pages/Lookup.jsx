// frontend/src/pages/Lookup.jsx
//
// Self-contained LinkedIn profile lookup tab. Calls /api/apify-summary/profile
// with a pasted LinkedIn URL and renders the rich AI dossier inline.
//
// Deliberately does NOT import SummaryPanel.jsx — that component is still
// used by the LinkedIn and Outreach tabs for the existing PhantomBuster
// summary path and we don't want to entangle the two flows. If/when the
// per-row summary is migrated to Apify, this file's rendering can be
// promoted into a shared component.

import { useState, useEffect, useRef } from 'react';

// ── localStorage cache — persists across sessions, keyed by profileUrl ─
const CACHE_PREFIX = 'apify_summary_cache_';

function cacheGet(profileUrl) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + profileUrl);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function cacheSet(profileUrl, data) {
  try { localStorage.setItem(CACHE_PREFIX + profileUrl, JSON.stringify(data)); } catch {}
}

function cacheClear(profileUrl) {
  try { localStorage.removeItem(CACHE_PREFIX + profileUrl); } catch {}
}

// ── Module-level in-flight tracker — survives component unmount, so a
//     lookup keeps running when the user navigates away and back. ─────
const inFlight = {};

async function startFetch(url) {
  if (!inFlight[url]) inFlight[url] = { callbacks: [] };
  try {
    const res = await fetch('/api/apify-summary/profile', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        profileUrl: url,
        apifyToken: localStorage.getItem('apifyKey') || '',
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Lookup failed');
    cacheSet(url, data);
    inFlight[url].callbacks.forEach(cb => cb(data, null));
  } catch (err) {
    inFlight[url]?.callbacks.forEach(cb => cb(null, err.message));
  } finally {
    delete inFlight[url];
  }
}

function isValidLinkedIn(url) {
  return /linkedin\.com\/in\/[^/]+/.test(url);
}

function urlToName(url) {
  return url.replace(/\/$/, '').split('/in/')[1] || url;
}

// ─────────────────────────────────────────────────────────────────────
//   Main page
// ─────────────────────────────────────────────────────────────────────

export default function Lookup() {
  const [input, setInput] = useState('');
  const [activeUrl, setActiveUrl] = useState(
    () => localStorage.getItem('lookup_activeUrl') || null
  );
  const [history, setHistory] = useState(() => {
    try {
      const stored = localStorage.getItem('lookup_history');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (activeUrl) localStorage.setItem('lookup_activeUrl', activeUrl);
    else localStorage.removeItem('lookup_activeUrl');
  }, [activeUrl]);

  function saveHistory(updater) {
    setHistory(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      localStorage.setItem('lookup_history', JSON.stringify(next));
      return next;
    });
  }

  function handleLookup(urlOverride) {
    const url = (urlOverride || input).trim().replace(/\/$/, '');
    setError('');

    if (!url) { setError('Paste a LinkedIn profile URL first.'); return; }
    if (!isValidLinkedIn(url)) {
      setError('Must be a LinkedIn profile URL — e.g. https://www.linkedin.com/in/username');
      return;
    }

    saveHistory(prev => {
      if (prev.find(h => h.url === url)) return prev;
      return [{ url, cachedAt: cacheGet(url) ? Date.now() : null }, ...prev].slice(0, 20);
    });
    setActiveUrl(url);
    setInput('');
  }

  function handleRefreshHistory(url) {
    cacheClear(url);
    saveHistory(prev => prev.map(h => h.url === url ? { ...h, cachedAt: null } : h));
    setActiveUrl(url);
  }

  function removeFromHistory(url) {
    cacheClear(url);
    saveHistory(prev => prev.filter(h => h.url !== url));
    if (activeUrl === url) setActiveUrl(null);
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── LEFT SIDEBAR: input + history ────────────────────────── */}
      <div style={{ width: 280, borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 4 }}>LOOKUP</div>
          <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.5px' }}>Profile Lookup</div>
        </div>

        <div style={{ padding: '14px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
              placeholder="linkedin.com/in/username"
              style={{
                flex: 1, padding: '8px 10px',
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', color: 'var(--text)',
                fontSize: 12, fontFamily: 'var(--font-mono)',
              }}
            />
            <button
              onClick={() => handleLookup()}
              style={{
                padding: '8px 12px', background: 'var(--accent)', color: '#000',
                fontWeight: 700, fontSize: 13, borderRadius: 'var(--radius)',
                cursor: 'pointer', flexShrink: 0,
              }}
            >→</button>
          </div>
          {error && (
            <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ff4455' }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {history.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', lineHeight: 1.8 }}>
              Paste a LinkedIn URL above<br />to look up a profile.
            </div>
          ) : (
            history.map(({ url }) => {
              const isActive = activeUrl === url;
              const isCached = Boolean(cacheGet(url));
              const name     = urlToName(url);
              return (
                <div
                  key={url}
                  onClick={() => setActiveUrl(url)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer',
                    background: isActive ? 'var(--accent-dim)' : 'transparent',
                    borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    transition: 'all 0.1s',
                    display: 'flex', flexDirection: 'column', gap: 3,
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface2)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                      color: isActive ? 'var(--accent)' : 'var(--text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{name}</span>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={e => { e.stopPropagation(); handleRefreshHistory(url); }}
                        title="Re-fetch (clear cache)"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 12, padding: '0 2px' }}
                      >↺</button>
                      <button
                        onClick={e => { e.stopPropagation(); removeFromHistory(url); }}
                        title="Remove"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, padding: '0 2px' }}
                      >×</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {isCached ? (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.2)', padding: '1px 6px', borderRadius: 10 }}>
                        ✓ CACHED
                      </span>
                    ) : (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text3)', background: 'var(--surface2)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 10 }}>
                        NOT FETCHED
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {history.length > 0 && (
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>
            {history.length} profile{history.length !== 1 ? 's' : ''} · cached in browser
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
        {!activeUrl ? <EmptyState onExample={u => { setInput(u); handleLookup(u); }} />
                    : <LookupSummary key={activeUrl} profileUrl={activeUrl} onCached={() => {
                        saveHistory(prev => prev.map(h => h.url === activeUrl ? { ...h, cachedAt: Date.now() } : h));
                      }} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//   Empty state
// ─────────────────────────────────────────────────────────────────────

function EmptyState({ onExample }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, color: 'var(--text3)', padding: 32 }}>
      <div style={{ fontSize: 40 }}>🔍</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text2)', marginBottom: 8 }}>Look up a LinkedIn profile</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.9, maxWidth: 380 }}>
          Paste a LinkedIn profile URL on the left.<br />
          Get a full AI dossier — career story, interests,<br />
          outreach hook, talking points, icebreakers.<br />
          <br />
          Results are cached in your browser. No re-fetch<br />
          unless you click refresh.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//   LookupSummary — handles fetch lifecycle + renders the dossier
// ─────────────────────────────────────────────────────────────────────

function LookupSummary({ profileUrl, onCached }) {
  const [state,  setState]  = useState(() => {
    if (cacheGet(profileUrl)) return 'done';
    if (inFlight[profileUrl]) return 'loading';
    return 'loading';
  });
  const [result, setResult] = useState(() => cacheGet(profileUrl) || null);
  const [error,  setError]  = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const cached = cacheGet(profileUrl);
    if (cached) { setState('done'); setResult(cached); onCached?.(); return; }

    setState('loading');
    setResult(null);
    setError('');

    if (!inFlight[profileUrl]) {
      inFlight[profileUrl] = { callbacks: [] };
      // Kick off fetch — module-level, survives unmount
      startFetch(profileUrl);
    }

    const cb = (data, err) => {
      if (!mounted.current) return;
      if (err) { setError(err); setState('error'); }
      else     { setResult(data); setState('done'); onCached?.(); }
    };
    inFlight[profileUrl].callbacks.push(cb);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileUrl]);

  function refresh() {
    cacheClear(profileUrl);
    delete inFlight[profileUrl];
    setResult(null); setError(''); setState('loading');
    inFlight[profileUrl] = { callbacks: [(data, err) => {
      if (!mounted.current) return;
      if (err) { setError(err); setState('error'); }
      else     { setResult(data); setState('done'); onCached?.(); }
    }] };
    startFetch(profileUrl);
  }

  const name = urlToName(profileUrl);

  if (state === 'loading') {
    return (
      <div style={{ padding: 40, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 18, color: 'var(--accent)' }}>◌</span>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
            Scraping LinkedIn profile for {name}...
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
            Takes 2–4 minutes — you can switch tabs and come back
          </div>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={{ padding: 40, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#ff4455' }}>✕ {error}</span>
        <button onClick={refresh} style={{ padding: '5px 14px', background: 'transparent', color: 'var(--info)', border: '1px solid rgba(77,159,255,0.3)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer' }}>Try again</button>
      </div>
    );
  }

  if (!result) return null;

  const p  = result.profile || {};
  const s  = result.summary || {};
  const st = result.stats   || {};
  const o  = s.outreach     || {};

  return (
    <div style={{ padding: '32px 40px', maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 4 }}>AI DOSSIER</div>
          <h1 style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-0.5px', marginBottom: 4 }}>{p.name || name}</h1>
          {p.title && (
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              {p.title}{p.company ? ` @ ${p.company}` : ''}{p.location ? ` · ${p.location}` : ''}
            </div>
          )}
          {p.email && (
            <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
              ✉ {p.email}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={refresh} style={{ padding: '6px 14px', background: 'transparent', color: 'var(--info)', border: '1px solid rgba(77,159,255,0.3)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>↺ Refresh</button>
          {p.profileUrl && (
            <a href={p.profileUrl} target="_blank" rel="noreferrer" style={{ padding: '6px 14px', background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: 11, textDecoration: 'none' }}>↗ LinkedIn</a>
          )}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {s.summary           && <Section label="WHO THEY ARE"          body={s.summary} />}
      {s.careerStory       && <Section label="CAREER STORY"           body={s.careerStory} />}
      {s.activityNarrative && <Section label="WHAT THEY TALK ABOUT"   body={s.activityNarrative} />}

      {(s.expertise?.length > 0 || s.interests?.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {s.expertise?.length > 0 && (
            <TagBlock label="EXPERTISE" items={s.expertise} color="accent" />
          )}
          {s.interests?.length > 0 && (
            <TagBlock label="INTERESTS" items={s.interests} color="info" />
          )}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Outreach section */}
      {(o.hook || o.talkingPoints?.length > 0 || o.icebreakers?.length > 0 || o.bestAngle) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ffb44d', letterSpacing: '0.12em' }}>
            OUTREACH GUIDE
          </div>

          {o.hook && (
            <Block label="OPENING HOOK" tint="warm">
              <span style={{ fontStyle: 'italic' }}>"{o.hook}"</span>
            </Block>
          )}

          {o.talkingPoints?.length > 0 && (
            <NumberedList label="TALKING POINTS" items={o.talkingPoints} bulletColor="var(--info)" />
          )}

          {o.icebreakers?.length > 0 && (
            <NumberedList label="ICEBREAKERS" items={o.icebreakers} bulletChar="?" bulletColor="var(--accent)" />
          )}

          {o.bestAngle && <Block label="BEST APPROACH" tint="accent">{o.bestAngle}</Block>}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Footer stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>
        <span>📝 {st.postsCount    ?? 0} posts</span>
        <span>💬 {st.commentsCount ?? 0} comments</span>
        <span>👍 {st.reactedCount  ?? 0} reactions</span>
        <span>📊 {st.totalActivity ?? 0} total activity</span>
        {result.meta?.scrapedAt && (
          <span>🕐 {new Date(result.meta.scrapedAt).toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}

// ── Small UI helpers ──────────────────────────────────────────────────

function Section({ label, body }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.12em' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
        {body}
      </div>
    </div>
  );
}

function Block({ label, tint = 'neutral', children }) {
  const tints = {
    neutral: { bg: 'var(--surface)',           border: 'var(--border)' },
    warm:    { bg: 'rgba(255,180,77,0.06)',    border: 'rgba(255,180,77,0.2)' },
    accent:  { bg: 'rgba(0,229,160,0.06)',     border: 'rgba(0,229,160,0.2)' },
  };
  const t = tints[tint];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.12em' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 'var(--radius)', padding: '10px 14px' }}>
        {children}
      </div>
    </div>
  );
}

function TagBlock({ label, items, color = 'info' }) {
  const palettes = {
    info:   { bg: 'rgba(77,159,255,0.1)',  border: 'rgba(77,159,255,0.25)',  text: 'var(--info)'   },
    accent: { bg: 'rgba(0,229,160,0.1)',   border: 'rgba(0,229,160,0.25)',   text: 'var(--accent)' },
  };
  const c = palettes[color];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.12em' }}>{label}</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {items.map((item, i) => (
          <span key={i} style={{
            padding: '3px 9px', background: c.bg, border: `1px solid ${c.border}`, borderRadius: 20,
            fontSize: 11, color: c.text, fontFamily: 'var(--font-mono)',
          }}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function NumberedList({ label, items, bulletChar = null, bulletColor = 'var(--info)' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.12em' }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
        {items.map((line, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
            <span style={{ color: bulletColor, fontFamily: 'var(--font-mono)', fontSize: 11, minWidth: 18, paddingTop: 2, fontWeight: 700 }}>
              {bulletChar ?? `${i + 1}.`}
            </span>
            <span>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
