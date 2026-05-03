/**
 * HolidayFetchService — automatic holiday/festival sync engine.
 *
 * Sources (tried in order):
 *   1. Calendarific API — structured JSON, comprehensive; needs CALENDARIFIC_API_KEY env var
 *   2. Google Calendar ICS — free, no key, comprehensive Indian festival coverage
 *   3. date-holidays npm — offline, national/gazetted holidays only (fallback)
 *
 * All sources write into the `special_days` DB table so the rest of the app
 * reads from one place regardless of which source was used.
 */

import { db } from '../db/index.js';
import { specialDays } from '../db/schema.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import Holidays from 'date-holidays';

// ─── Keyword → industry categories map ───────────────────────────────────────

const KEYWORD_CATEGORIES = {
  diwali:          ['fashion', 'ethnic_wear', 'jewellery', 'gifts', 'beauty', 'home_decor', 'food'],
  dhanteras:       ['jewellery', 'gifts', 'beauty', 'fashion', 'ethnic_wear'],
  holi:            ['fashion', 'ethnic_wear', 'beauty', 'gifts'],
  navratri:        ['fashion', 'ethnic_wear', 'jewellery', 'dance_wear'],
  navaratri:       ['fashion', 'ethnic_wear', 'jewellery'],
  'durga puja':    ['fashion', 'ethnic_wear', 'jewellery', 'beauty'],
  'ganesh chaturthi': ['fashion', 'ethnic_wear', 'jewellery'],
  ganesh:          ['fashion', 'ethnic_wear', 'jewellery'],
  shivratri:       ['fashion', 'ethnic_wear', 'jewellery', 'devotional'],
  janmashtami:     ['fashion', 'ethnic_wear', 'jewellery'],
  'raksha bandhan': ['gifts', 'fashion', 'ethnic_wear', 'jewellery'],
  rakhi:           ['gifts', 'fashion', 'ethnic_wear'],
  onam:            ['ethnic_wear', 'fashion', 'jewellery', 'food'],
  pongal:          ['ethnic_wear', 'fashion', 'food', 'jewellery'],
  sankranti:       ['ethnic_wear', 'fashion', 'food', 'gifts'],
  lohri:           ['ethnic_wear', 'fashion', 'food'],
  ugadi:           ['ethnic_wear', 'fashion', 'food', 'jewellery'],
  'gudi padwa':    ['ethnic_wear', 'fashion', 'food'],
  baisakhi:        ['ethnic_wear', 'fashion'],
  'eid':           ['fashion', 'ethnic_wear', 'food', 'gifts'],
  'id-ul-fitr':    ['fashion', 'ethnic_wear', 'food', 'gifts'],
  'id-ul-zuha':    ['fashion', 'ethnic_wear', 'food', 'gifts'],
  christmas:       ['gifts', 'fashion', 'home_decor', 'food'],
  valentine:       ['gifts', 'jewellery', 'fashion', 'beauty'],
  "mother's day":  ['gifts', 'fashion', 'jewellery', 'beauty'],
  mothers:         ['gifts', 'fashion', 'jewellery', 'beauty'],
  "father's day":  ['gifts', 'fashion', 'accessories'],
  fathers:         ['gifts', 'fashion', 'accessories'],
  'independence':  ['fashion', 'accessories', 'lifestyle'],
  'republic':      ['fashion', 'accessories', 'lifestyle'],
  gandhi:          ['lifestyle', 'sustainable', 'handloom'],
  'wedding':       ['ethnic_wear', 'jewellery', 'fashion', 'beauty'],
  "women's day":   ['fashion', 'beauty', 'jewellery', 'lifestyle'],
  women:           ['fashion', 'beauty', 'jewellery', 'lifestyle'],
  children:        ['kids', 'fashion', 'gifts', 'education'],
  teachers:        ['gifts', 'education', 'fashion'],
  dussehra:        ['ethnic_wear', 'fashion', 'jewellery'],
  vijayadashami:   ['ethnic_wear', 'fashion', 'jewellery'],
  'chhath':        ['ethnic_wear', 'fashion'],
  'guru nanak':    ['ethnic_wear', 'spiritual', 'fashion'],
  'buddha':        ['lifestyle', 'spiritual', 'ethnic_wear'],
  'black friday':  ['electronics', 'fashion', 'gifts', 'shopping'],
  'cyber monday':  ['electronics', 'tech', 'shopping'],
  'great indian':  ['fashion', 'electronics', 'gifts', 'shopping'],
  'big billion':   ['fashion', 'electronics', 'gifts', 'shopping'],
  'new year':      ['fashion', 'beauty', 'gifts', 'lifestyle'],
  'dussehra':      ['ethnic_wear', 'fashion', 'jewellery'],
  'paryushana':    ['fashion', 'spiritual', 'ethnic_wear'],
  'mahavir':       ['lifestyle', 'spiritual'],
  'ambedkar':      ['lifestyle', 'education'],
  'labour day':    ['lifestyle'],
  'environment':   ['lifestyle', 'sustainable'],
  'world':         ['lifestyle'],
};

// ─── Emoji map ─────────────────────────────────────────────────────────────────

const EMOJI_MAP = {
  diwali: '✨', dhanteras: '🪙', holi: '🎨', navratri: '🪔', navaratri: '🪔',
  'durga puja': '🌺', ganesh: '🐘', shivratri: '🔱', janmashtami: '🦚',
  'raksha bandhan': '🎀', rakhi: '🎀', onam: '🌸', pongal: '🍚',
  sankranti: '🪁', lohri: '🔥', ugadi: '🌿', 'gudi padwa': '🌿',
  baisakhi: '💛', eid: '🌙', christmas: '🎄', valentine: '❤️',
  mothers: '💐', fathers: '👔', independence: '🇮🇳', republic: '🇮🇳',
  gandhi: '🕊️', women: '👩', children: '🧒', teachers: '📚',
  dussehra: '🏹', vijayadashami: '🏹', 'new year': '🎆',
  wedding: '💍', 'black friday': '🛍️', 'big billion': '🛍️',
  'great indian': '🛒', 'guru nanak': '🙏', 'buddha purnima': '☮️',
  chhath: '🌅',
};

// ─── Color map by category ────────────────────────────────────────────────────

const COLOR_MAP = {
  festival: '#F59E0B',
  national: '#F97316',
  international: '#8B5CF6',
  shopping: '#FF6900',
  wedding: '#BE185D',
  tech: '#3B82F6',
  sports: '#10B981',
  'hindu holiday': '#F59E0B',
  'islamic holiday': '#10B981',
  'christian holiday': '#DC2626',
  'sikh holiday': '#FBBF24',
  'jain holiday': '#A78BFA',
  'buddhist holiday': '#6366F1',
};

// ─── Helper functions ─────────────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function getIndustryCategories(name, description = '') {
  const text = `${name} ${description}`.toLowerCase();
  const cats = new Set();
  for (const [kw, categories] of Object.entries(KEYWORD_CATEGORIES)) {
    if (text.includes(kw)) categories.forEach((c) => cats.add(c));
  }
  // Generic fallback
  if (cats.size === 0) cats.add('lifestyle');
  return [...cats];
}

function getTags(name, description = '') {
  const cats = getIndustryCategories(name, description);
  const text = name.toLowerCase();
  const extra = [];
  if (text.includes('festival') || text.includes('puja') || text.includes('jayanti')) extra.push('ethnic', 'traditional');
  if (text.includes('day')) extra.push('celebration');
  return [...new Set([...cats, ...extra])];
}

function getEmoji(name) {
  const n = name.toLowerCase();
  for (const [kw, emoji] of Object.entries(EMOJI_MAP)) {
    if (n.includes(kw)) return emoji;
  }
  return '📅';
}

function getColor(primaryType = '', name = '') {
  const type = primaryType.toLowerCase();
  const n = name.toLowerCase();
  if (n.includes('diwali') || n.includes('navratri') || n.includes('holi')) return '#F59E0B';
  if (n.includes('eid') || n.includes('id-ul')) return '#10B981';
  if (n.includes('christmas')) return '#DC2626';
  if (n.includes('valentine')) return '#EF4444';
  if (n.includes('independence') || n.includes('republic')) return '#F97316';
  return COLOR_MAP[type] ?? COLOR_MAP.festival;
}

function getCategory(primaryType = '', name = '') {
  const t = primaryType.toLowerCase();
  const n = name.toLowerCase();
  if (n.includes('sale') || n.includes('friday') || n.includes('billion') || n.includes('festival sale')) return 'shopping';
  if (t.includes('national') || t.includes('gazetted')) return 'national';
  if (t.includes('hindu') || t.includes('islamic') || t.includes('sikh') || t.includes('jain') || t.includes('buddhist')) return 'festival';
  if (t.includes('christian')) return 'international';
  if (t.includes('observance') || t.includes('international')) return 'international';
  return 'festival';
}

// ─── ICS Parser ───────────────────────────────────────────────────────────────
// Minimal parser for VEVENT blocks — no extra npm package needed.

function parseICS(text) {
  const events = [];
  const blocks = text.split('BEGIN:VEVENT').slice(1);
  for (const block of blocks) {
    const get = (key) => {
      const match = block.match(new RegExp(`${key}[^:]*:([^\\r\\n]+)`));
      return match ? match[1].trim() : null;
    };
    const summary = get('SUMMARY');
    if (!summary) continue;

    // DTSTART may be DATE or DATETIME
    const dtRaw = get('DTSTART') ?? get('DTSTART;VALUE=DATE') ?? '';
    const dateStr = dtRaw.replace(/T.*/, '');
    if (!dateStr || dateStr.length < 8) continue;

    const isoDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    const dtEndRaw = get('DTEND') ?? get('DTEND;VALUE=DATE') ?? '';
    const endDateStr = dtEndRaw.replace(/T.*/, '');
    // DTEND in ICS all-day events is exclusive (next day), so subtract 1 day
    let endIso = null;
    if (endDateStr && endDateStr.length >= 8) {
      const d = new Date(`${endDateStr.slice(0, 4)}-${endDateStr.slice(4, 6)}-${endDateStr.slice(6, 8)}`);
      d.setDate(d.getDate() - 1);
      const adjusted = d.toISOString().split('T')[0];
      endIso = adjusted !== isoDate ? adjusted : null;
    }

    events.push({
      name: summary.replace(/\\,/g, ',').replace(/\\n/g, ' '),
      date: isoDate,
      end_date: endIso,
      description: get('DESCRIPTION')?.replace(/\\n/g, ' ').replace(/\\,/g, ',') ?? '',
    });
  }
  return events;
}

// ─── Service class ────────────────────────────────────────────────────────────

class HolidayFetchService {
  // ── Google Calendar ICS (free, no key) ─────────────────────────────────────

  async fetchGoogleCalendarICS(calendarId = 'en.indian%23holiday%40group.v.calendar.google.com') {
    const url = `https://calendar.google.com/calendar/ical/${calendarId}/public/basic.ics`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Not a valid ICS response');
      return parseICS(text);
    } catch (err) {
      throw new Error(`Google Calendar ICS fetch failed: ${err.message}`);
    }
  }

  // ── Calendarific API (needs CALENDARIFIC_API_KEY) ──────────────────────────

  async fetchCalendarific(country, year, apiKey) {
    const url = `https://calendarific.com/api/v2/holidays?api_key=${apiKey}&country=${country}&year=${year}&type=national,religious,observance`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Calendarific HTTP ${res.status}`);
    const data = await res.json();
    if (data.meta?.code !== 200) throw new Error(data.meta?.error_detail ?? 'Calendarific error');
    return data.response?.holidays ?? [];
  }

  // ── date-holidays fallback ─────────────────────────────────────────────────

  fetchDateHolidays(country, year) {
    const hd = new Holidays(country);
    const holidays = hd.getHolidays(year) ?? [];
    return holidays.map((h) => ({
      name: h.name,
      date: h.date.split(' ')[0],
      end_date: null,
      description: h.note ?? '',
      primaryType: h.type,
    }));
  }

  // ── Normalize any source event to our DB schema ────────────────────────────

  normalizeToSpecialDay(raw, source, year) {
    const name = raw.name;
    const primaryType = raw.primary_type ?? raw.primaryType ?? '';
    const date = raw.date?.iso ?? raw.date;
    if (!date || !name) return null;

    const key = `${source}_${slugify(name)}_${year}`;
    return {
      id: uuidv4(),
      key,
      name,
      emoji: getEmoji(name),
      category: getCategory(primaryType, name),
      date,
      end_date: raw.end_date ?? null,
      color: getColor(primaryType, name),
      region: 'IN',
      tags: getTags(name, raw.description ?? ''),
      industry_categories: getIndustryCategories(name, raw.description ?? ''),
      content_ideas: [],
      source,
      is_active: true,
    };
  }

  // ── Sync holidays for a specific country + year ────────────────────────────

  async syncForYear(country = 'IN', year = new Date().getFullYear()) {
    const { env } = await import('../config/env.js');
    let rawEvents = [];
    let source = 'date-holidays';

    // Try Calendarific first (richest data)
    if (env.CALENDARIFIC_API_KEY) {
      try {
        const rows = await this.fetchCalendarific(country, year, env.CALENDARIFIC_API_KEY);
        rawEvents = rows;
        source = 'calendarific';
      } catch (err) {
        console.warn(`[HolidayFetch] Calendarific failed, falling back to Google ICS: ${err.message}`);
      }
    }

    // Try Google Calendar ICS (free, comprehensive)
    if (rawEvents.length === 0) {
      try {
        const calId = country === 'IN'
          ? 'en.indian%23holiday%40group.v.calendar.google.com'
          : `en.${country.toLowerCase()}%23holiday%40group.v.calendar.google.com`;
        const allIcsEvents = await this.fetchGoogleCalendarICS(calId);
        rawEvents = allIcsEvents.filter((e) => e.date.startsWith(String(year)));
        source = 'google_ics';
      } catch (err) {
        console.warn(`[HolidayFetch] Google ICS failed, falling back to date-holidays: ${err.message}`);
      }
    }

    // Final fallback: date-holidays (national/gazetted only)
    if (rawEvents.length === 0) {
      rawEvents = this.fetchDateHolidays(country, year);
      source = 'date-holidays';
    }

    // Normalize and upsert
    const normalized = rawEvents
      .map((r) => this.normalizeToSpecialDay(r, source, year))
      .filter(Boolean);

    let inserted = 0;
    for (const day of normalized) {
      try {
        await db
          .insert(specialDays)
          .values(day)
          .onConflictDoUpdate({
            target: specialDays.key,
            set: {
              name: day.name,
              emoji: day.emoji,
              category: day.category,
              date: day.date,
              end_date: day.end_date,
              color: day.color,
              tags: day.tags,
              industry_categories: day.industry_categories,
              source: day.source,
              updated_at: new Date(),
            },
          });
        inserted++;
      } catch {
        // Skip invalid rows silently
      }
    }

    return { year, country, source, total: rawEvents.length, inserted };
  }

  // ── Ensure current year + next year are populated ─────────────────────────

  async ensurePopulated(country = 'IN') {
    const currentYear = new Date().getFullYear();
    const years = [currentYear, currentYear + 1];
    const results = [];

    for (const year of years) {
      // Check if we already have data for this year
      const existing = await db
        .select({ id: specialDays.id })
        .from(specialDays)
        .where(
          and(
            sql`extract(year from ${specialDays.date}::date) = ${year}`,
            eq(specialDays.is_active, true),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        try {
          const result = await this.syncForYear(country, year);
          results.push(result);
          console.info(`[HolidayFetch] Synced ${result.inserted} events for ${year} from ${result.source}`);
        } catch (err) {
          console.error(`[HolidayFetch] Failed to sync ${year}: ${err.message}`);
        }
      }
    }
    return results;
  }
}

export const holidayFetchService = new HolidayFetchService();
