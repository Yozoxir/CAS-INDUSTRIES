const axios = require('axios');
const db = require('./db');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function scrapeTikTok(handle) {
  const clean = handle.replace('@', '');
  try {
    const res = await axios.get('https://www.tiktok.com/@' + clean, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' },
      timeout: 10000,
    });
    const html = res.data;

    const extract = (key) => {
      const m = html.match(new RegExp('"' + key + '":(\\d+)'));
      return m ? parseInt(m[1]) : 0;
    };

    const followers = extract('followerCount') || extract('fans');
    const following = extract('followingCount');
    const likes = extract('heartCount') || extract('heart');
    const videos = extract('videoCount');

    return { followers, following, likes, videos, views: 0, engagement_rate: followers > 0 ? parseFloat(((likes / Math.max(followers, 1)) * 100).toFixed(2)) : 0 };
  } catch(e) {
    console.error('[SCRAPER] TikTok error:', handle, e.message);
    return null;
  }
}

async function scrapeInstagram(handle) {
  const clean = handle.replace('@', '');
  try {
    const res = await axios.get('https://www.instagram.com/' + clean + '/?__a=1&__d=dis', {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      timeout: 10000,
    });
    const data = res.data;
    const user = data?.graphql?.user || data?.data?.user;
    if (!user) return null;

    const followers = user.edge_followed_by?.count || user.follower_count || 0;
    const following = user.edge_follow?.count || user.following_count || 0;
    const posts = user.edge_owner_to_timeline_media?.count || user.media_count || 0;

    return { followers, following, likes: 0, videos: posts, views: 0, engagement_rate: 0 };
  } catch(e) {
    // Fallback: scrape page HTML
    try {
      const res2 = await axios.get('https://www.instagram.com/' + clean + '/', {
        headers: { 'User-Agent': UA },
        timeout: 10000,
      });
      const html = res2.data;
      const m = html.match(/"edge_followed_by":\{"count":(\d+)\}/);
      const followers = m ? parseInt(m[1]) : 0;
      return { followers, following: 0, likes: 0, videos: 0, views: 0, engagement_rate: 0 };
    } catch(e2) {
      console.error('[SCRAPER] Instagram error:', handle, e2.message);
      return null;
    }
  }
}

async function scrapeYouTube(handle) {
  const clean = handle.replace('@', '');
  try {
    const res = await axios.get('https://www.youtube.com/@' + clean, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR' },
      timeout: 10000,
    });
    const html = res.data;

    const subsMatch = html.match(/"subscriberCountText"[^}]*?"simpleText":"([^"]+)"/);
    const videosMatch = html.match(/"videoCountText"[^}]*?"runs":\[{"text":"(\d+)"}/);
    const viewsMatch = html.match(/"viewCountText"[^}]*?"simpleText":"([^"]+)"/);

    const parseCount = (str) => {
      if (!str) return 0;
      const clean2 = str.replace(/[^\d.,KkMmBb]/g, '');
      if (clean2.match(/[Kk]$/)) return Math.round(parseFloat(clean2) * 1000);
      if (clean2.match(/[Mm]$/)) return Math.round(parseFloat(clean2) * 1000000);
      return parseInt(clean2.replace(/[^\d]/g, '')) || 0;
    };

    const followers = parseCount(subsMatch ? subsMatch[1] : '0');
    const videos = videosMatch ? parseInt(videosMatch[1]) : 0;
    const views = parseCount(viewsMatch ? viewsMatch[1] : '0');

    return { followers, following: 0, likes: 0, videos, views, engagement_rate: 0 };
  } catch(e) {
    console.error('[SCRAPER] YouTube error:', handle, e.message);
    return null;
  }
}

async function scrapeAccount(accountId, platform, handle) {
  let data = null;
  if (platform === 'tiktok') data = await scrapeTikTok(handle);
  else if (platform === 'instagram') data = await scrapeInstagram(handle);
  else if (platform === 'youtube') data = await scrapeYouTube(handle);

  if (!data) return;

  const today = new Date().toISOString().split('T')[0];
  db.prepare(`
    INSERT INTO social_metrics (account_id, followers, following, likes, views, videos, engagement_rate, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(accountId, data.followers, data.following, data.likes, data.views, data.videos, data.engagement_rate, today);

  console.log('[SCRAPER]', platform, handle, '— followers:', data.followers);
}

async function scrapeAll() {
  const accounts = db.prepare('SELECT * FROM social_accounts').all();
  console.log('[SCRAPER] Scraping', accounts.length, 'accounts...');
  for (const acc of accounts) {
    await scrapeAccount(acc.id, acc.platform, acc.handle);
    await sleep(2000);
  }
  console.log('[SCRAPER] Done.');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
module.exports = { scrapeAll, scrapeAccount };
