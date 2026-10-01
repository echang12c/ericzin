/* Garmin Sono — ponte entre o LifePlan e o Garmin Connect.
   O LifePlan chama GET /sono?from=YYYY-MM-DD&to=YYYY-MM-DD com o token do
   Firebase (login Google). O Worker confere que é você, usa os tokens do
   Garmin guardados no secret GARMIN_TOKENS e devolve um resumo por noite.
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

/* ---------------- Sessão do Garmin (tokens DI, renováveis) ----------------
   Os tokens vêm de tools/garmin-tokens.py: { di_token, di_refresh_token, di_client_id }.
   Ficam no secret GARMIN_TOKENS (semente) e, a cada renovação, são guardados no KV
   GARMIN_KV, porque o Garmin pode trocar o refresh_token a cada uso. */
const DI_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
const API = 'https://connectapi.garmin.com';
const NATIVE = {
  'User-Agent': 'GCM-Android-5.23',
  'X-Garmin-User-Agent': 'com.garmin.android.apps.connectmobile/5.23; ; Google/sdk_gphone64_arm64/google; Android/33; Dalvik/2.1.0',
  'X-Garmin-Paired-App-Version': '10861',
  'X-Garmin-Client-Platform': 'Android',
  'X-App-Ver': '10861',
  'X-Lang': 'en',
  'X-GCExperience': 'GC5',
  'Accept-Language': 'en-US,en;q=0.9',
};
let tokens = null; // cache em memória
let displayName = null;

function jwtExp(t) {
  try { return JSON.parse(td.decode(b64uToBytes(t.split('.')[1]))).exp * 1000; } catch { return 0; }
}

async function carregarTokens(env) {
  if (tokens) return tokens;
  let salvo = null;
  if (env.GARMIN_KV) { try { salvo = JSON.parse(await env.GARMIN_KV.get('tokens')); } catch { salvo = null; } }
  if (!salvo) {
    if (!env.GARMIN_TOKENS) throw new Error('GARMIN_TOKENS não configurado');
    salvo = JSON.parse(env.GARMIN_TOKENS);
  }
  tokens = salvo;
  return tokens;
}

async function renovar(env) {
  const t = await carregarTokens(env);
  if (!t.di_refresh_token || !t.di_client_id) throw new Error('sem refresh token: gere os tokens de novo');
  const r = await fetch(DI_TOKEN_URL, {
    method: 'POST',
    headers: {
      ...NATIVE,
      Authorization: 'Basic ' + btoa(t.di_client_id + ':'),
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: t.di_client_id, refresh_token: t.di_refresh_token }),
  });
  if (!r.ok) { tokens = null; throw new Error('renovação do token falhou (' + r.status + '): gere os tokens de novo'); }
  const j = await r.json();
  tokens = {
    di_token: j.access_token,
    di_refresh_token: j.refresh_token || t.di_refresh_token,
    di_client_id: t.di_client_id,
  };
  if (env.GARMIN_KV) await env.GARMIN_KV.put('tokens', JSON.stringify(tokens));
  return tokens;
}

async function garminGet(env, path, tentou) {
  let t = await carregarTokens(env);
  if (!t.di_token || jwtExp(t.di_token) < Date.now() + 15 * 60e3) t = await renovar(env);
  const r = await fetch(API + path, { headers: { ...NATIVE, Authorization: 'Bearer ' + t.di_token, Accept: 'application/json' } });
  if (r.status === 401 && !tentou) { await renovar(env); return garminGet(env, path, true); }
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
  if (!displayName) {
    const perfil = await garminGet(env, '/userprofile-service/socialProfile');
    displayName = perfil.displayName;
  }
  const noites = await Promise.all(dias.map(async (dia) => {
    try {
      const raw = await garminGet(env, `/wellness-service/wellness/dailySleepData/${displayName}?date=${dia}&nonSleepBufferMinutes=60`);
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
