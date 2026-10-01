/* Garmin Sono — ponte entre o LifePlan e o Garmin Connect.
   O LifePlan chama GET /sono?from=YYYY-MM-DD&to=YYYY-MM-DD com o token do
   Firebase (login Google). O Worker confere que é você, usa os tokens do
   Garmin guardados no secret GARMIN_OAUTH1 e devolve um resumo por noite.
   Tokens vêm de tools/garmin-tokens.py (login uma vez, com 2FA se tiver). */

const te = new TextEncoder();
const td = new TextDecoder();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

/* ---------------- base64url + token do Firebase ---------------- */
function b64uToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
let jwksCache = { keys: null, exp: 0 };
async function getJwks() {
  if (jwksCache.keys && Date.now() < jwksCache.exp) return jwksCache.keys;
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!r.ok) throw new Error('jwks ' + r.status);
  jwksCache = { keys: (await r.json()).keys, exp: Date.now() + 30 * 60e3 };
  return jwksCache.keys;
}
async function verifyFirebaseToken(token, projectId) {
  try {
    const [h, p, s] = token.split('.');
    if (!s) return null;
    const header = JSON.parse(td.decode(b64uToBytes(h)));
    const claims = JSON.parse(td.decode(b64uToBytes(p)));
    if (claims.aud !== projectId) return null;
    if (claims.iss !== 'https://securetoken.google.com/' + projectId) return null;
    if (!claims.sub || claims.exp * 1000 < Date.now()) return null;
    const jwk = (await getJwks()).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uToBytes(s), te.encode(h + '.' + p));
    return ok ? claims : null;
  } catch {
    return null;
  }
}

/* ---------------- OAuth1 (assinatura HMAC-SHA1) para trocar pelo token OAuth2 ---------------- */
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

async function oauth1Header(method, url, consumer, token, tokenSecret) {
  const u = new URL(url);
  const params = {
    oauth_consumer_key: consumer.consumer_key,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: '1.0',
  };
  const all = { ...params };
  u.searchParams.forEach((v, k) => { all[k] = v; });
  const norm = Object.keys(all).sort().map((k) => enc(k) + '=' + enc(all[k])).join('&');
  const base = [method, enc(u.origin + u.pathname), enc(norm)].join('&');
  const key = await crypto.subtle.importKey(
    'raw', te.encode(enc(consumer.consumer_secret) + '&' + enc(tokenSecret)), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, te.encode(base)));
  params.oauth_signature = btoa(String.fromCharCode(...sig));
  return 'OAuth ' + Object.keys(params).sort().map((k) => `${enc(k)}="${enc(params[k])}"`).join(', ');
}

const UA = 'com.garmin.android.apps.connectmobile';
let session = { bearer: null, exp: 0, name: null };

async function garminSession(env) {
  if (session.bearer && Date.now() < session.exp - 60e3) return session;
  if (!env.GARMIN_OAUTH1) throw new Error('GARMIN_OAUTH1 não configurado');
  const o1 = JSON.parse(env.GARMIN_OAUTH1);
  const consumer = await (await fetch('https://thegarth.s3.amazonaws.com/oauth_consumer.json')).json();
  const url = 'https://connectapi.garmin.com/oauth-service/oauth/exchange/user/2.0';
  const auth = await oauth1Header('POST', url, consumer, o1.oauth_token, o1.oauth_token_secret);
  const body = o1.mfa_token ? new URLSearchParams({ mfa_token: o1.mfa_token }) : new URLSearchParams();
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: auth, 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error('troca de token falhou (' + r.status + '): gere os tokens de novo');
  const t = await r.json();
  session = { bearer: t.access_token, exp: Date.now() + (t.expires_in || 3600) * 1000, name: session.name };
  return session;
}

async function garminGet(env, path) {
  const s = await garminSession(env);
  const r = await fetch('https://connectapi.garmin.com' + path, {
    headers: { Authorization: 'Bearer ' + s.bearer, 'User-Agent': UA },
  });
  if (r.status === 401) { session.bearer = null; }
  if (!r.ok) throw new Error('garmin ' + r.status);
  return r.json();
}

/* ---------------- Sono ---------------- */
const h1 = (sec) => (typeof sec === 'number' ? Math.round((sec / 3600) * 10) / 10 : null);

function resumirNoite(date, raw) {
  const d = raw && raw.dailySleepDTO;
  if (!d || !d.sleepTimeSeconds) return null; // noite sem registro
  return {
    data: d.calendarDate || date,
    horas: h1(d.sleepTimeSeconds),
    score: d.sleepScores && d.sleepScores.overall ? d.sleepScores.overall.value : null,
    profundo: h1(d.deepSleepSeconds),
    leve: h1(d.lightSleepSeconds),
    rem: h1(d.remSleepSeconds),
    acordado: h1(d.awakeSleepSeconds),
    dormiu: d.sleepStartTimestampLocal || null, // ms, já no fuso local
    acordou: d.sleepEndTimestampLocal || null,
    fc: raw.restingHeartRate || null,
    hrv: raw.avgOvernightHrv || null,
  };
}

async function handleSono(env, url) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const to = url.searchParams.get('to');
  const from = url.searchParams.get('from');
  if (!re.test(from || '') || !re.test(to || '')) return json({ erro: 'use ?from=YYYY-MM-DD&to=YYYY-MM-DD' }, 400);
  const dias = [];
  for (let d = new Date(from + 'T12:00:00Z'); d <= new Date(to + 'T12:00:00Z') && dias.length < 14; d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push(d.toISOString().slice(0, 10));
  }
  const s = await garminSession(env);
  if (!s.name) {
    const perfil = await garminGet(env, '/userprofile-service/socialProfile');
    session.name = perfil.displayName;
  }
  const noites = await Promise.all(dias.map(async (dia) => {
    try {
      const raw = await garminGet(env, `/wellness-service/wellness/dailySleepData/${session.name}?date=${dia}&nonSleepBufferMinutes=60`);
      return resumirNoite(dia, raw);
    } catch { return null; }
  }));
  return json({ noites: noites.filter(Boolean), atualizadoEm: new Date().toISOString() });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    if (url.pathname !== '/sono' || req.method !== 'GET') return json({ erro: 'não encontrado' }, 404);
    const m = /^Bearer (.+)$/.exec(req.headers.get('Authorization') || '');
    const claims = m && (await verifyFirebaseToken(m[1], env.FIREBASE_PROJECT_ID));
    if (!claims || claims.email !== env.ALLOWED_EMAIL || claims.email_verified !== true) return json({ erro: 'não autorizado' }, 401);
    try {
      return await handleSono(env, url);
    } catch (e) {
      return json({ erro: String(e.message || e) }, 502);
    }
  },
};
