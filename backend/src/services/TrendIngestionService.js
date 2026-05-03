import RSSParser from 'rss-parser';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { eq, and, gte, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { trendCandidates, channels } from '../db/schema.js';

const rss = new RSSParser({ timeout: 8000 });

// YouTube category IDs to monitor for format/viral trends
const YOUTUBE_CATEGORIES = [
  { id: '24', name: 'Entertainment' },   // viral clips, memes, format trends
  { id: '28', name: 'Science & Tech' },  // product launches
  { id: '22', name: 'People & Blogs' },  // lifestyle, creator trends
];

// Hacker News: only store genuinely viral stories
const HN_STORY_LIMIT = 30;
const HN_MIN_SCORE = 200;

// Wikipedia top articles: minimum daily views to qualify as a trend signal
const WIKIPEDIA_MIN_VIEWS = 50000;
// Min percentile rank (out of 1000) to qualify — top 10% of ranked articles
const WIKIPEDIA_TOP_N = 100;


// Fallback subreddits used only when AI generation fails
const REDDIT_FALLBACK = ['entrepreneur', 'startups', 'marketing', 'technology', 'business'];
// Cache TTL — regenerate subreddits after 7 days
const SUBREDDIT_CACHE_DAYS = 7;

// Fallback Google News keywords when AI generation fails
const NEWS_KEYWORD_FALLBACK = ['startup trends', 'marketing strategy', 'business growth', 'digital marketing'];

const FRESHNESS_HOURS = 48;

export class TrendIngestionService {
  // Main entry: universal signals only — Google Trends, Wikipedia, HN (viral threshold)
  // Brand-specific news (Google News + Reddit) runs per-channel in the scheduler
  async runAll() {
    const results = await Promise.allSettled([
      this.ingestGoogleTrends(),
      this.ingestWikipediaTrending(),
      this.ingestHackerNews(),
    ]);

    const summary = { ingested: 0, skipped: 0, errors: [] };
    for (const r of results) {
      if (r.status === 'fulfilled') {
        summary.ingested += r.value.ingested;
        summary.skipped += r.value.skipped;
      } else {
        summary.errors.push(r.reason?.message ?? String(r.reason));
      }
    }
    return summary;
  }

  // --- RSS ingestion ---
  async ingestRSS(feeds = RSS_FEEDS) {
    let ingested = 0, skipped = 0;

    for (const feed of feeds) {
      try {
        const parsed = await rss.parseURL(feed.url);
        const cutoff = this._freshnessCutoff();

        for (const item of parsed.items ?? []) {
          const pubDate = item.pubDate ? new Date(item.pubDate) : null;
          if (pubDate && pubDate < cutoff) { skipped++; continue; }

          const externalId = item.guid || item.link || item.title;
          const saved = await this._upsertCandidate({
            source_type: 'rss',
            source_name: feed.name,
            external_id: externalId,
            title: item.title ?? '(no title)',
            summary: this._stripHtml(item.contentSnippet || item.content || item.summary || ''),
            url: item.link ?? null,
            image_url: item.enclosure?.url ?? null,
            published_at: pubDate,
            raw_data: { categories: item.categories },
          });
          if (saved) ingested++; else skipped++;
        }
      } catch (err) {
        // Log per-feed errors without aborting the whole run
        console.error(`[TrendIngestion] RSS ${feed.name} failed:`, err.message);
      }
    }

    return { ingested, skipped };
  }

  // --- Google Trends RSS (real-time trending searches) ---
  async ingestGoogleTrends(geo = 'US') {
    let ingested = 0, skipped = 0;
    try {
      const url = `https://trends.google.com/trending/rss?geo=${geo}`;
      const parsed = await rss.parseURL(url);

      for (const item of parsed.items ?? []) {
        const traffic = item['ht:approx_traffic'] ?? item['approx_traffic'] ?? '0';
        const velocityScore = this._parseTraffic(String(traffic));

        const saved = await this._upsertCandidate({
          source_type: 'google_trends',
          source_name: `Google Trends (${geo})`,
          external_id: item.title,
          title: item.title,
          summary: item['ht:news_item_title'] ?? item.title,
          url: item.link ?? null,
          image_url: item['ht:picture'] ?? null,
          published_at: item.pubDate ? new Date(item.pubDate) : new Date(),
          raw_data: { traffic, news_items: item['ht:news_item'] },
          velocity_score: velocityScore,
          lifecycle_stage: velocityScore > 50000 ? 'peak' : velocityScore > 10000 ? 'sprout' : 'seed',
        });
        if (saved) ingested++; else skipped++;
      }
    } catch (err) {
      console.error('[TrendIngestion] Google Trends failed:', err.message);
    }
    return { ingested, skipped };
  }

  // --- Single AI call: generate subreddits + Google News keywords for a channel ---
  async getBrandSourcesForChannel(channel) {
    const assets = channel.brand_assets ?? {};
    const cachedAt = assets.brand_sources_updated_at;
    const cacheExpired = !cachedAt || Date.now() - new Date(cachedAt).getTime() > SUBREDDIT_CACHE_DAYS * 24 * 60 * 60 * 1000;

    if (assets.reddit_subreddits?.length && assets.google_news_keywords?.length && !cacheExpired) {
      return { subreddits: assets.reddit_subreddits, keywords: assets.google_news_keywords };
    }

    if (!process.env.OPENAI_API_KEY) {
      console.warn('[TrendIngestion] No OPENAI_API_KEY — using fallbacks');
      return { subreddits: REDDIT_FALLBACK, keywords: NEWS_KEYWORD_FALLBACK };
    }

    const brandContext = [
      `Brand: ${channel.brand_name}`,
      channel.industry         ? `Industry: ${channel.industry}`               : null,
      channel.niche            ? `Niche: ${channel.niche}`                     : null,
      channel.target_audience  ? `Target audience: ${channel.target_audience}` : null,
      channel.products?.length ? `Products: ${channel.products.join(', ')}`    : null,
      channel.tone             ? `Tone: ${channel.tone}`                       : null,
    ].filter(Boolean).join('\n');

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `You are a content strategist. Given a brand profile, return two things:
1. 8-12 subreddits where the brand's target audience is most active (real, active, 100k+ members, no generic ones like memes/funny, names only without r/ prefix)
2. 5-8 Google News search keywords that surface relevant trending news for their content strategy (2-4 words each, specific not broad)

Return JSON: { "subreddits": ["name1", ...], "keywords": ["keyword1", ...] }`,
            },
            { role: 'user', content: brandContext },
          ],
        }),
      });

      if (!res.ok) throw new Error(`OpenAI ${res.status}`);
      const data = await res.json();
      const result = JSON.parse(data.choices[0].message.content);
      const subreddits = result.subreddits ?? REDDIT_FALLBACK;
      const keywords = result.keywords ?? NEWS_KEYWORD_FALLBACK;

      await db.update(channels).set({
        brand_assets: {
          ...assets,
          reddit_subreddits: subreddits,
          google_news_keywords: keywords,
          brand_sources_updated_at: new Date().toISOString(),
        },
        updated_at: new Date(),
      }).where(eq(channels.id, channel.id));

      console.log(`[TrendIngestion] Brand sources for ${channel.brand_name} — subreddits: ${subreddits.join(', ')} | keywords: ${keywords.join(', ')}`);
      return { subreddits, keywords };
    } catch (err) {
      console.error('[TrendIngestion] Brand source generation failed:', err.message);
      return { subreddits: REDDIT_FALLBACK, keywords: NEWS_KEYWORD_FALLBACK };
    }
  }

  // --- Reddit ingestion for a specific channel ---
  async ingestRedditForChannel(channel) {
    const { subreddits } = await this.getBrandSourcesForChannel(channel);
    return this.ingestReddit(subreddits);
  }

  // --- Reddit hot posts ---
  async ingestReddit(subreddits = REDDIT_FALLBACK) {
    let ingested = 0, skipped = 0;

    for (const sub of subreddits) {
      try {
        const { data } = await axios.get(
          `https://www.reddit.com/r/${sub}/hot.json?limit=25`,
          { headers: { 'User-Agent': 'PhotonX-GrowthOS/1.0' }, timeout: 8000 },
        );

        for (const post of data?.data?.children ?? []) {
          const p = post.data;
          if (p.stickied || p.score < 500) { skipped++; continue; }

          // upvotes-per-hour as velocity proxy
          const ageHours = (Date.now() / 1000 - p.created_utc) / 3600;
          const velocity = ageHours > 0 ? p.score / ageHours : p.score;

          // Skip posts older than freshness window
          const pubDate = new Date(p.created_utc * 1000);
          if (pubDate < this._freshnessCutoff()) { skipped++; continue; }

          const saved = await this._upsertCandidate({
            source_type: 'reddit',
            source_name: `r/${sub}`,
            external_id: p.id,
            title: p.title,
            summary: p.selftext ? p.selftext.slice(0, 500) : p.title,
            url: p.url ?? `https://reddit.com${p.permalink}`,
            image_url: p.thumbnail?.startsWith('http') ? p.thumbnail : null,
            published_at: pubDate,
            raw_data: { score: p.score, num_comments: p.num_comments, subreddit: sub, flair: p.link_flair_text },
            velocity_score: Math.round(velocity),
            lifecycle_stage: velocity > 5000 ? 'peak' : velocity > 1000 ? 'sprout' : 'seed',
          });
          if (saved) ingested++; else skipped++;
        }
      } catch (err) {
        console.error(`[TrendIngestion] Reddit r/${sub} failed:`, err.message);
      }
    }
    return { ingested, skipped };
  }

  // --- Google News ingestion for a specific channel ---
  async ingestGoogleNewsForChannel(channel) {
    const { keywords } = await this.getBrandSourcesForChannel(channel);
    return this.ingestGoogleNews(keywords);
  }

  // --- Google News RSS per keyword ---
  async ingestGoogleNews(keywords = NEWS_KEYWORD_FALLBACK) {
    let ingested = 0, skipped = 0;

    for (const keyword of keywords) {
      try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=en-US&gl=US&ceid=US:en`;
        const parsed = await rss.parseURL(url);

        for (const item of parsed.items ?? []) {
          const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
          if (pubDate < this._freshnessCutoff()) { skipped++; continue; }

          // Recency-based velocity: 100 if <6h old, 50 if <24h, 20 if older
          const ageHours = (Date.now() - pubDate.getTime()) / 3600000;
          const velocity = ageHours < 6 ? 100 : ageHours < 24 ? 50 : 20;

          const saved = await this._upsertCandidate({
            source_type: 'google_news',
            source_name: `Google News: ${keyword}`,
            external_id: item.guid ?? item.link,
            title: item.title,
            summary: item.contentSnippet ?? item.title,
            url: item.link ?? null,
            image_url: null,
            published_at: pubDate,
            raw_data: { keyword, source: item.source ?? null },
            velocity_score: velocity,
            lifecycle_stage: ageHours < 6 ? 'peak' : ageHours < 24 ? 'sprout' : 'seed',
          });
          if (saved) ingested++; else skipped++;
        }
      } catch (err) {
        console.error(`[TrendIngestion] Google News "${keyword}" failed:`, err.message);
      }
    }
    return { ingested, skipped };
  }

  // --- Product Hunt (daily product launches) ---
  async ingestProductHunt() {
    if (!process.env.PRODUCT_HUNT_TOKEN) {
      console.warn('[TrendIngestion] Product Hunt skipped — PRODUCT_HUNT_TOKEN not set (get one free at producthunt.com/v2/oauth/applications)');
      return { ingested: 0, skipped: 0 };
    }
    let ingested = 0, skipped = 0;
    try {
      const query = `{
        posts(first: 20, order: VOTES) {
          edges {
            node {
              id name tagline description
              votesCount
              url
              thumbnail { url }
              topics { edges { node { name } } }
              createdAt
            }
          }
        }
      }`;

      const { data } = await axios.post(
        'https://api.producthunt.com/v2/api/graphql',
        { query },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(process.env.PRODUCT_HUNT_TOKEN
              ? { Authorization: `Bearer ${process.env.PRODUCT_HUNT_TOKEN}` }
              : {}),
          },
          timeout: 10000,
        },
      );

      for (const edge of data?.data?.posts?.edges ?? []) {
        const p = edge.node;
        const topics = p.topics?.edges?.map((e) => e.node.name) ?? [];

        const saved = await this._upsertCandidate({
          source_type: 'product_hunt',
          source_name: 'Product Hunt',
          external_id: p.id,
          title: p.name,
          summary: `${p.tagline}. ${p.description ?? ''}`.trim(),
          url: p.url,
          image_url: p.thumbnail?.url ?? null,
          published_at: p.createdAt ? new Date(p.createdAt) : new Date(),
          raw_data: { votes: p.votesCount, topics },
          velocity_score: p.votesCount ?? 0,
          lifecycle_stage: p.votesCount > 500 ? 'sprout' : 'seed',
        });
        if (saved) ingested++; else skipped++;
      }
    } catch (err) {
      console.error('[TrendIngestion] Product Hunt failed:', err.message);
    }
    return { ingested, skipped };
  }

  // ---------------------------------------------------------------------------
  // --- Wikipedia Trending — organic viral character/event detection ----------
  // ---------------------------------------------------------------------------
  // Fetches the top 1000 most-viewed articles for today from Wikimedia REST API.
  // Articles in the top WIKIPEDIA_TOP_N with >= WIKIPEDIA_MIN_VIEWS are ingested.
  // No API key required. Best signal for the "Punch the macaque" / "Werner Herzog
  // penguin" pattern: a new entity enters the top 100 views within 24-48 h.
  async ingestWikipediaTrending() {
    let ingested = 0, skipped = 0;
    try {
      const now = new Date();
      // Use yesterday's date — today's metrics finalize at end of day
      const d = new Date(now - 24 * 60 * 60 * 1000);
      const yyyy = d.getUTCFullYear();
      const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd   = String(d.getUTCDate()).padStart(2, '0');

      const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${yyyy}/${mm}/${dd}`;
      const { data } = await axios.get(url, {
        headers: { 'User-Agent': 'PhotonX-GrowthOS/1.0 (trends@photonx.io)' },
        timeout: 10000,
      });

      const articles = data?.items?.[0]?.articles ?? [];

      // Only check top N articles to avoid noise
      for (const article of articles.slice(0, WIKIPEDIA_TOP_N)) {
        if (article.views < WIKIPEDIA_MIN_VIEWS) { skipped++; continue; }

        // Skip utility pages (Main_Page, Special:, etc.)
        const title = article.article;
        if (/^(Main_Page|Special:|Wikipedia:|File:|Template:|Help:|Portal:|Talk:)/i.test(title)) {
          skipped++; continue;
        }

        const humanTitle = title.replace(/_/g, ' ');
        const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;

        // velocity_score = rank position (1 = top) inverted so rank 1 → highest score
        // We use views directly as a meaningful numeric signal
        const velocityScore = article.views;
        const lifecycle =
          article.rank <= 10 ? 'peak' :
          article.rank <= 50 ? 'sprout' : 'seed';

        const saved = await this._upsertCandidate({
          source_type: 'wikipedia',
          source_name: 'Wikipedia Trending',
          external_id: `wiki_${yyyy}${mm}${dd}_${title}`,
          title: humanTitle,
          summary: `#${article.rank} most-viewed Wikipedia article — ${article.views.toLocaleString()} views on ${yyyy}-${mm}-${dd}`,
          url: wikiUrl,
          image_url: null,
          published_at: new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`),
          raw_data: { rank: article.rank, views: article.views, date: `${yyyy}-${mm}-${dd}` },
          velocity_score: velocityScore,
          lifecycle_stage: lifecycle,
        });
        if (saved) ingested++; else skipped++;
      }
    } catch (err) {
      console.error('[TrendIngestion] Wikipedia Trending failed:', err.message);
    }
    return { ingested, skipped };
  }

  // ---------------------------------------------------------------------------
  // --- Hacker News Firebase API — tech/product launch velocity ---------------
  // ---------------------------------------------------------------------------
  // Free, no auth. Fetches top story IDs then resolves each in parallel (batched).
  // velocity_score = points / age_in_hours → catches stories that explode fast
  // vs slow burners. A story at 800pts in 2h is a fundamentally different signal
  // than 800pts over 12h.
  async ingestHackerNews() {
    let ingested = 0, skipped = 0;
    try {
      const { data: ids } = await axios.get(
        'https://hacker-news.firebaseio.com/v0/topstories.json',
        { timeout: 8000 },
      );

      const topIds = (ids ?? []).slice(0, HN_STORY_LIMIT);

      // Resolve stories in parallel (max 10 at a time to be polite)
      const BATCH = 10;
      for (let i = 0; i < topIds.length; i += BATCH) {
        const batch = topIds.slice(i, i + BATCH);
        const stories = await Promise.all(
          batch.map((id) =>
            axios
              .get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeout: 6000 })
              .then((r) => r.data)
              .catch(() => null),
          ),
        );

        for (const story of stories) {
          if (!story || story.type !== 'story' || !story.title) { skipped++; continue; }
          if ((story.score ?? 0) < HN_MIN_SCORE) { skipped++; continue; }

          const pubDate = story.time ? new Date(story.time * 1000) : new Date();
          if (pubDate < this._freshnessCutoff()) { skipped++; continue; }

          const ageHours = (Date.now() / 1000 - (story.time ?? 0)) / 3600;
          const velocity = ageHours > 0.1 ? Math.round(story.score / ageHours) : story.score;

          const saved = await this._upsertCandidate({
            source_type: 'hacker_news',
            source_name: 'Hacker News',
            external_id: String(story.id),
            title: story.title,
            summary: story.text
              ? this._stripHtml(story.text).slice(0, 500)
              : `${story.score} points · ${story.descendants ?? 0} comments · ${story.url ?? ''}`,
            url: story.url ?? `https://news.ycombinator.com/item?id=${story.id}`,
            image_url: null,
            published_at: pubDate,
            raw_data: {
              score: story.score,
              comments: story.descendants,
              age_hours: Math.round(ageHours * 10) / 10,
              by: story.by,
            },
            velocity_score: velocity,
            lifecycle_stage: velocity > 500 ? 'peak' : velocity > 100 ? 'sprout' : 'seed',
          });
          if (saved) ingested++; else skipped++;
        }
      }
    } catch (err) {
      console.error('[TrendIngestion] Hacker News failed:', err.message);
    }
    return { ingested, skipped };
  }

  // ---------------------------------------------------------------------------
  // --- YouTube Trending — video format + visual template detection ------------
  // ---------------------------------------------------------------------------
  // Requires YOUTUBE_API_KEY (free tier: 10K units/day; this call costs 1 unit/request).
  // Fetches mostPopular chart per category. The title + thumbnail combo reveals
  // which visual format template is trending before it becomes a meme template.
  async ingestYouTubeTrending(categories = YOUTUBE_CATEGORIES) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.warn('[TrendIngestion] YouTube Trending skipped — YOUTUBE_API_KEY not set');
      return { ingested: 0, skipped: 0 };
    }

    let ingested = 0, skipped = 0;

    for (const cat of categories) {
      try {
        const { data } = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
          params: {
            key: apiKey,
            chart: 'mostPopular',
            videoCategoryId: cat.id,
            regionCode: 'US',
            part: 'snippet,statistics,contentDetails',
            maxResults: 20,
          },
          timeout: 10000,
        });

        for (const item of data?.items ?? []) {
          const s = item.snippet;
          const stats = item.statistics ?? {};
          const views = parseInt(stats.viewCount ?? '0', 10);
          const likes = parseInt(stats.likeCount ?? '0', 10);
          const pubDate = s.publishedAt ? new Date(s.publishedAt) : new Date();

          if (pubDate < this._freshnessCutoff()) { skipped++; continue; }

          // Velocity: views ÷ age in hours
          const ageHours = (Date.now() - pubDate.getTime()) / (1000 * 3600);
          const velocity = ageHours > 0.1 ? Math.round(views / ageHours) : views;

          const saved = await this._upsertCandidate({
            source_type: 'youtube_trending',
            source_name: `YouTube Trending (${cat.name})`,
            external_id: item.id,
            title: s.title,
            summary: s.description?.slice(0, 500) ?? s.title,
            url: `https://www.youtube.com/watch?v=${item.id}`,
            image_url: s.thumbnails?.high?.url ?? s.thumbnails?.default?.url ?? null,
            published_at: pubDate,
            raw_data: {
              views,
              likes,
              comments: parseInt(stats.commentCount ?? '0', 10),
              channel: s.channelTitle,
              category: cat.name,
              duration: item.contentDetails?.duration,
              tags: s.tags?.slice(0, 10) ?? [],
            },
            velocity_score: velocity,
            lifecycle_stage: velocity > 100000 ? 'peak' : velocity > 20000 ? 'sprout' : 'seed',
          });
          if (saved) ingested++; else skipped++;
        }
      } catch (err) {
        console.error(`[TrendIngestion] YouTube Trending (${cat.name}) failed:`, err.message);
      }
    }
    return { ingested, skipped };
  }

  // ---------------------------------------------------------------------------
  // --- Spotify Viral Charts — audio format signals ---------------------------
  // ---------------------------------------------------------------------------
  // Public CSV endpoint — no auth required. Nearly every viral TikTok/Reels
  // format is tied to a specific audio track. When a track spikes here, the
  // associated video format typically follows within 24-72 hours.
  async ingestSpotifyViral() {
    let ingested = 0, skipped = 0;
    try {
      const { data: csvText } = await axios.get(
        'https://charts.spotify.com/charts/view/viral-global-daily/latest',
        {
          headers: {
            'Accept': 'text/csv',
            'User-Agent': 'PhotonX-GrowthOS/1.0 (trends@photonx.io)',
          },
          timeout: 10000,
          responseType: 'text',
        },
      );

      // CSV format: rank,uri,artist_names,track_name,peak_rank,previous_rank,weeks_on_chart,streams
      const lines = csvText.trim().split('\n');
      // Skip header row(s) — Spotify CSVs sometimes have 2 header rows
      const dataLines = lines.filter((l) => l && !/^rank|^#/i.test(l.trim()));

      for (const line of dataLines.slice(0, 50)) {
        const cols = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
        const [rank, uri, artistNames, trackName, peakRank, previousRank, weeksOnChart, streams] = cols;
        if (!trackName || !artistNames) { skipped++; continue; }

        const rankNum = parseInt(rank, 10);
        const prevRankNum = parseInt(previousRank, 10);
        if (isNaN(rankNum)) { skipped++; continue; }

        // Movement: how much did the rank improve? Large positive jump = fast mover
        const rankDelta = isNaN(prevRankNum) ? 0 : prevRankNum - rankNum; // positive = rising

        // Extract Spotify track ID from uri (spotify:track:XXXX)
        const trackId = uri?.split(':')?.pop() ?? null;
        const trackUrl = trackId
          ? `https://open.spotify.com/track/${trackId}`
          : 'https://charts.spotify.com/charts/view/viral-global-daily/latest';

        const lifecycle =
          rankNum <= 5 ? 'peak' :
          rankNum <= 20 ? 'sprout' : 'seed';

        const saved = await this._upsertCandidate({
          source_type: 'spotify_viral',
          source_name: 'Spotify Viral Global',
          external_id: `spotify_viral_${trackId ?? `${artistNames}_${trackName}`.replace(/\s+/g, '_')}`,
          title: `${trackName} — ${artistNames}`,
          summary: `Viral Spotify chart rank #${rankNum}. ${weeksOnChart ? `${weeksOnChart} weeks on chart.` : ''} Streams: ${streams ?? 'N/A'}. ${rankDelta > 0 ? `↑${rankDelta} positions this week.` : ''}`.trim(),
          url: trackUrl,
          image_url: null,
          published_at: new Date(),
          raw_data: {
            rank: rankNum,
            peak_rank: parseInt(peakRank, 10) || null,
            previous_rank: prevRankNum || null,
            rank_delta: rankDelta,
            weeks_on_chart: parseInt(weeksOnChart, 10) || null,
            streams: streams ?? null,
            artist: artistNames,
            track: trackName,
            spotify_uri: uri ?? null,
          },
          velocity_score: rankDelta > 0 ? rankDelta * 100 : Math.max(0, 50 - rankNum) * 100,
          lifecycle_stage: lifecycle,
        });
        if (saved) ingested++; else skipped++;
      }
    } catch (err) {
      console.error('[TrendIngestion] Spotify Viral failed:', err.message);
    }
    return { ingested, skipped };
  }

  // --- X / Twitter account monitoring — per channel ---
  async ingestTwitterAccountsForChannel(channel) {
    const handles = channel.brand_assets?.tracked_x_accounts ?? [];
    if (!handles.length) return { ingested: 0, skipped: 0 };
    return this._ingestTwitterAccounts(handles, channel.organization_id);
  }

  async _ingestTwitterAccounts(handles, organizationId = null) {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
      console.warn('[TrendIngestion] Twitter account monitoring skipped — X_BEARER_TOKEN not set');
      return { ingested: 0, skipped: 0 };
    }

    let ingested = 0, skipped = 0;

    // Resolve up to 100 handles to user IDs in one request
    const cleanHandles = handles.map((h) => h.replace(/^@/, '')).slice(0, 100);
    let userMap = {};
    try {
      const res = await fetch(
        `https://api.twitter.com/2/users/by?usernames=${cleanHandles.join(',')}&user.fields=id,name,username`,
        { headers: { Authorization: `Bearer ${bearerToken}` }, signal: AbortSignal.timeout(10000) },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.title ?? `HTTP ${res.status}`);
      for (const u of data.data ?? []) userMap[u.username.toLowerCase()] = u;
    } catch (err) {
      console.error('[TrendIngestion] Twitter user lookup failed:', err.message);
      return { ingested: 0, skipped: 0 };
    }

    for (const handle of cleanHandles) {
      const user = userMap[handle.toLowerCase()];
      if (!user) { skipped++; continue; }

      try {
        const res = await fetch(
          `https://api.twitter.com/2/users/${user.id}/tweets` +
            `?max_results=10&exclude=retweets,replies` +
            `&tweet.fields=created_at,public_metrics,entities`,
          { headers: { Authorization: `Bearer ${bearerToken}` }, signal: AbortSignal.timeout(10000) },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.title ?? `HTTP ${res.status}`);

        for (const tweet of data.data ?? []) {
          const pubDate = tweet.created_at ? new Date(tweet.created_at) : new Date();
          if (pubDate < this._freshnessCutoff()) { skipped++; continue; }

          const metrics = tweet.public_metrics ?? {};
          const engagement = (metrics.like_count ?? 0) + (metrics.retweet_count ?? 0) * 3 + (metrics.reply_count ?? 0);
          const ageHours = (Date.now() - pubDate.getTime()) / 3600000;
          const velocity = ageHours > 0.1 ? Math.round(engagement / ageHours) : engagement;

          const saved = await this._upsertCandidate({
            source_type: 'twitter',
            source_name: `@${user.username}`,
            external_id: tweet.id,
            title: tweet.text.slice(0, 200),
            summary: tweet.text,
            url: `https://x.com/${user.username}/status/${tweet.id}`,
            image_url: null,
            published_at: pubDate,
            raw_data: { ...metrics, author: user.username, author_name: user.name },
            velocity_score: velocity,
            lifecycle_stage: velocity > 1000 ? 'peak' : velocity > 200 ? 'sprout' : 'seed',
            organization_id: organizationId,
          });
          if (saved) ingested++; else skipped++;
        }
      } catch (err) {
        console.error(`[TrendIngestion] Twitter @${handle} failed:`, err.message);
        skipped++;
      }
    }
    return { ingested, skipped };
  }

  // --- Watched websites — per channel (RSS first, falls back to headline scraping) ---
  async ingestWatchedWebsitesForChannel(channel) {
    const urls = channel.brand_assets?.watched_websites ?? [];
    if (!urls.length) return { ingested: 0, skipped: 0 };
    return this._ingestWatchedWebsites(urls, channel.organization_id);
  }

  async _ingestWatchedWebsites(urls, organizationId = null) {
    let ingested = 0, skipped = 0;

    for (const rawUrl of urls.slice(0, 20)) {
      const base = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
      const tried = await this._tryRssForSite(base, organizationId);
      if (tried !== null) {
        ingested += tried.ingested;
        skipped += tried.skipped;
        continue;
      }
      // RSS not found — scrape headlines from the page
      try {
        const { data: html } = await axios.get(base, {
          headers: { 'User-Agent': 'Virlo-GrowthOS/1.0' },
          timeout: 10000,
          responseType: 'text',
        });
        const headlines = this._extractHeadlines(html, base);
        for (const h of headlines) {
          const saved = await this._upsertCandidate({
            source_type: 'website',
            source_name: new URL(base).hostname,
            external_id: h.url,
            title: h.title,
            summary: h.title,
            url: h.url,
            image_url: null,
            published_at: new Date(),
            raw_data: { source_url: base },
            velocity_score: 20,
            lifecycle_stage: 'seed',
            organization_id: organizationId,
          });
          if (saved) ingested++; else skipped++;
        }
      } catch (err) {
        console.error(`[TrendIngestion] Website scrape failed (${base}):`, err.message);
        skipped++;
      }
    }
    return { ingested, skipped };
  }

  async _tryRssForSite(baseUrl, organizationId) {
    const origin = new URL(baseUrl).origin;
    const candidates = [
      `${baseUrl}/feed`,
      `${baseUrl}/rss`,
      `${baseUrl}/feed.xml`,
      `${baseUrl}/atom.xml`,
      `${baseUrl}/rss.xml`,
      `${origin}/feed`,
      `${origin}/rss`,
    ];

    for (const feedUrl of candidates) {
      try {
        const parsed = await rss.parseURL(feedUrl);
        if (!parsed?.items?.length) continue;

        let ingested = 0, skipped = 0;
        for (const item of parsed.items.slice(0, 20)) {
          const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
          if (pubDate < this._freshnessCutoff()) { skipped++; continue; }
          const ageHours = (Date.now() - pubDate.getTime()) / 3600000;
          const velocity = ageHours < 6 ? 100 : ageHours < 24 ? 50 : 20;

          const saved = await this._upsertCandidate({
            source_type: 'website',
            source_name: new URL(baseUrl).hostname,
            external_id: item.guid ?? item.link,
            title: item.title,
            summary: item.contentSnippet ?? item.title,
            url: item.link ?? null,
            image_url: null,
            published_at: pubDate,
            raw_data: { feed_url: feedUrl, source_url: baseUrl },
            velocity_score: velocity,
            lifecycle_stage: ageHours < 6 ? 'peak' : ageHours < 24 ? 'sprout' : 'seed',
            organization_id: organizationId,
          });
          if (saved) ingested++; else skipped++;
        }
        return { ingested, skipped };
      } catch {
        // Try next candidate
      }
    }
    return null; // No RSS found
  }

  _extractHeadlines(html, baseUrl) {
    const origin = new URL(baseUrl).origin;
    const headlines = [];
    // Match <a href="...">text</a> inside h1/h2/h3/article tags
    const blockRe = /<(?:h[123]|article)[^>]*>([\s\S]*?)<\/(?:h[123]|article)>/gi;
    let block;
    while ((block = blockRe.exec(html)) !== null && headlines.length < 15) {
      const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i;
      const m = linkRe.exec(block[1]);
      if (!m) continue;
      const rawHref = m[1];
      const title = m[2].replace(/<[^>]+>/g, '').trim();
      if (!title || title.length < 10) continue;
      const url = rawHref.startsWith('http') ? rawHref : `${origin}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
      headlines.push({ title, url });
    }
    return headlines;
  }

  // --- Brand-specific ingestion: custom keywords + competitor mentions via Tavily ---
  async ingestBrandKeywords(channel, tavilyApiKey) {
    if (!tavilyApiKey) return { ingested: 0, skipped: 0 };

    const keywords = [
      ...(channel.tracked_keywords ?? []),
      ...(channel.competitors ?? []).map((c) => `${c} news`),
      channel.brand_name,
    ].filter(Boolean);

    let ingested = 0, skipped = 0;

    for (const keyword of keywords.slice(0, 5)) {
      try {
        const { data } = await axios.post(
          'https://api.tavily.com/search',
          { query: keyword, search_depth: 'basic', max_results: 5, include_answer: false },
          { headers: { Authorization: `Bearer ${tavilyApiKey}` }, timeout: 10000 },
        );

        for (const result of data?.results ?? []) {
          const saved = await this._upsertCandidate({
            source_type: 'rss',
            source_name: `Tavily: ${keyword}`,
            external_id: result.url,
            title: result.title,
            summary: result.content?.slice(0, 600) ?? '',
            url: result.url,
            image_url: null,
            published_at: result.published_date ? new Date(result.published_date) : new Date(),
            raw_data: { keyword, score: result.score },
            organization_id: channel.organization_id,
          });
          if (saved) ingested++; else skipped++;
        }
      } catch (err) {
        console.error(`[TrendIngestion] Tavily "${keyword}" failed:`, err.message);
      }
    }
    return { ingested, skipped };
  }

  // --- List candidates with optional filters ---
  async listCandidates({ classification, lifecycle_stage, limit = 50, since } = {}) {
    const conditions = [];
    if (classification) conditions.push(eq(trendCandidates.classification, classification));
    if (lifecycle_stage) conditions.push(eq(trendCandidates.lifecycle_stage, lifecycle_stage));
    if (since) conditions.push(gte(trendCandidates.ingested_at, since));

    const query = db.select().from(trendCandidates);
    if (conditions.length) query.where(and(...conditions));
    return query.orderBy(trendCandidates.ingested_at).limit(limit);
  }

  // --- Internal helpers ---

  async _upsertCandidate(data) {
    const { source_type, external_id } = data;
    if (!external_id) return false;

    // Check if already exists
    const [existing] = await db
      .select({ id: trendCandidates.id })
      .from(trendCandidates)
      .where(and(
        eq(trendCandidates.source_type, source_type),
        eq(trendCandidates.external_id, String(external_id).slice(0, 512)),
      ));

    if (existing) return false;

    const now = new Date();
    await db.insert(trendCandidates).values({
      id: uuidv4(),
      organization_id: data.organization_id ?? null,
      source_type: data.source_type,
      source_name: data.source_name,
      external_id: String(external_id).slice(0, 512),
      title: data.title?.slice(0, 1000) ?? '(no title)',
      summary: data.summary?.slice(0, 2000) ?? null,
      url: data.url ?? null,
      image_url: data.image_url ?? null,
      published_at: data.published_at ?? now,
      classification: data.classification ?? null,
      emotional_dna: data.emotional_dna ?? null,
      lifecycle_stage: data.lifecycle_stage ?? 'seed',
      // Cap at 9_999_999 to fit even pre-migration numeric(14,2) columns safely
      velocity_score: String(Math.min(Number(data.velocity_score ?? 0), 9_999_999)),
      platform_count: data.platform_count ?? 1,
      raw_data: data.raw_data ?? null,
      ingested_at: now,
      created_at: now,
    });
    return true;
  }

  _freshnessCutoff() {
    return new Date(Date.now() - FRESHNESS_HOURS * 60 * 60 * 1000);
  }

  _parseTraffic(str) {
    const num = parseInt(str.replace(/[^0-9]/g, ''), 10);
    return isNaN(num) ? 0 : num;
  }

  _stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}

export const trendIngestionService = new TrendIngestionService();
