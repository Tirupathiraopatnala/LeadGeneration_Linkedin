// frontend/src/components/SummaryPanel.jsx

import { useState, useEffect, useRef } from 'react';
import { useSettings } from '../context/SettingsContext.jsx';

// ── localStorage cache — persists across sessions, keyed by profileUrl ─
const CACHE_PREFIX = 'summary_cache_';

// ── In-memory tracker for in-flight requests ────────────────────────────
// { [profileUrl]: { callbacks: [fn], loading: true } }
const inFlight = {};

function cacheGet(profileUrl) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + profileUrl);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function cacheSet(profileUrl, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + profileUrl, JSON.stringify(data));
  } catch {}
}

function cacheClear(profileUrl) {
  try {
    localStorage.removeItem(CACHE_PREFIX + profileUrl);
  } catch {}
}

// ── Button ─────────────────────────────────────────────────────────────
export function SummaryButton({ profileUrl, expanded, onToggle }) {
  const cached = cacheGet(profileUrl);
  const loading = !!inFlight[profileUrl];
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle(); }}
      style={{
        padding: '5px 14px',
        background: expanded ? 'rgba(77,159,255,0.2)' : 'rgba(77,159,255,0.08)',
        color: 'var(--info)',
        border: '1px solid rgba(77,159,255,0.35)',
        borderRadius: 'var(--radius)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'all 0.15s',
      }}
    >
      {expanded
        ? '▲ HIDE SUMMARY'
        : loading
          ? '◌ Loading...'
          : cached ? '▼ VIEW SUMMARY' : '✦ GET SUMMARY'
      }
    </button>
  );
}

// ── Row ────────────────────────────────────────────────────────────────
export function SummaryRow({ profileUrl, name, colSpan, onClose }) {
  console.log('[SummaryRow] profileUrl:', profileUrl, 'name:', name);  // ← add this
  const { pbApiKey, pbActivityAgentId, pbProfileAgentId, pbLinkedinCookie } = useSettings();

  // Initialize from cache or in-flight state — scoped to THIS profileUrl
  const [state, setState] = useState(() => {
    if (cacheGet(profileUrl)) return 'done';
    if (inFlight[profileUrl]) return 'loading';
    return 'loading';
  });
  const [result, setResult] = useState(() => cacheGet(profileUrl) || null);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // Always re-initialize when profileUrl changes
    const cached = cacheGet(profileUrl);
    if (cached) {
      setState('done');
      setResult(cached);
      return;
    }
    if (inFlight[profileUrl]) {
      // Already fetching — subscribe to completion
      setState('loading');
      inFlight[profileUrl].callbacks.push((data, err) => {
        if (!mountedRef.current) return;
        if (err) { setError(err); setState('error'); }
        else { setResult(data); setState('done'); }
      });
      return;
    }
    // Start fresh fetch for this profileUrl
    startFetch(profileUrl);
  }, [profileUrl]); // ← key: re-runs for every different profileUrl

  async function startFetch(url) {
    if (!pbApiKey || !pbActivityAgentId || !pbProfileAgentId || !pbLinkedinCookie) {
      const errMsg = 'PhantomBuster not configured — go to Settings.';
      if (mountedRef.current) { setError(errMsg); setState('error'); }
      return;
    }

    // Register in-flight for this specific url
    inFlight[url] = { callbacks: [] };
    if (mountedRef.current) setState('loading');

    try {
      const res = await fetch('/api/summary/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pbApiKey,
          activityAgentId: pbActivityAgentId,
          profileAgentId: pbProfileAgentId,
          linkedinCookie: pbLinkedinCookie,
          profileUrl: url, // ← always this person's URL
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Summary failed');

      // Cache result for this specific person
      cacheSet(url, data);

      // Notify all subscribers (other open panels for same person)
      inFlight[url]?.callbacks.forEach(cb => cb(data, null));
      delete inFlight[url];

      if (mountedRef.current && url === profileUrl) {
        setResult(data);
        setState('done');
      }
    } catch (err) {
      inFlight[url]?.callbacks.forEach(cb => cb(null, err.message));
      delete inFlight[url];

      if (mountedRef.current && url === profileUrl) {
        setError(err.message);
        setState('error');
      }
    }
  }

  function handleRefresh() {
    cacheClear(profileUrl);
    delete inFlight[profileUrl];
    setResult(null);
    setError('');
    startFetch(profileUrl);
  }

  return (
    <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
      <td colSpan={colSpan} style={{ padding: 0 }}>
        <div style={{ padding: '10px 20px', borderTop: '2px solid rgba(77,159,255,0.2)' }}>

          {/* ── Loading ── */}
          {state === 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 14, color: 'var(--accent)' }}>◌</span>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>
                  Scraping LinkedIn activity for {name}...
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                  Takes 1–2 minutes — you can browse other rows while waiting
                </div>
              </div>
              <button onClick={onClose} style={{ marginLeft: 'auto', padding: '3px 10px', background: 'transparent', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer' }}>✕ Close</button>
            </div>
          )}

          {/* ── Error ── */}
          {state === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff4455' }}>✕ {error}</span>
              <button onClick={handleRefresh} style={{ padding: '3px 10px', background: 'transparent', color: 'var(--info)', border: '1px solid rgba(77,159,255,0.3)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer' }}>Try again</button>
              <button onClick={onClose} style={{ padding: '3px 10px', background: 'transparent', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer' }}>✕ Close</button>
            </div>
          )}

          {/* ── Done ── */}
          {state === 'done' && result && (() => {
            const p = result.profile || {};
            const s = result.summary || {};
            const st = result.stats || {};
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>

                {/* Row 1: AI SUMMARY label */}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--info)', letterSpacing: '0.1em' }}>
                  AI SUMMARY
                </div>

                {/* Row 2: Name */}
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                  {name}
                </div>

                {/* Row 3: Title @ Company */}
                {p.title && (
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {p.title}{p.company ? ` @ ${p.company}` : ''}
                  </div>
                )}

                {/* Row 4: Summary text */}
                <div style={{
                  fontSize: 12,
                  color: 'var(--text2)',
                  lineHeight: 1.5,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '6px 10px',
                  marginTop: 2,
                  maxWidth: '60%',
                }}>
                  {s.summary || '—'}
                </div>

                {/* Row 5: Expertise + Interests inline */}
                {(s.expertise?.length > 0 || s.interests?.length > 0) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 2 }}>
                    {s.expertise?.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '0.1em' }}>EXPERTISE</span>
                        {s.expertise.map((item, i) => (
                          <span key={i} style={{ padding: '2px 8px', background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 20, fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{item}</span>
                        ))}
                      </div>
                    )}
                    {s.interests?.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '0.1em' }}>INTERESTS</span>
                        {s.interests.map((item, i) => (
                          <span key={i} style={{ padding: '2px 8px', background: 'rgba(77,159,255,0.1)', border: '1px solid rgba(77,159,255,0.25)', borderRadius: 20, fontSize: 10, color: 'var(--info)', fontFamily: 'var(--font-mono)' }}>{item}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Row 6: Stats + Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderTop: '1px solid var(--border)', paddingTop: 7, marginTop: 2, maxWidth: '60%' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>📝 {st.postsCount ?? 0} posts</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>💬 {st.commentsCount ?? 0} comments</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>📅 {st.daysScanned ?? 0}d</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button onClick={handleRefresh} style={{ padding: '3px 10px', background: 'transparent', color: 'var(--info)', border: '1px solid rgba(77,159,255,0.3)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>↺ Refresh</button>
                    <button onClick={onClose} style={{ padding: '3px 10px', background: 'transparent', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer' }}>✕ Close</button>
                  </div>
                </div>

              </div>
            );
          })()}

        </div>
      </td>
    </tr>
  );
}