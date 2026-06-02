const axios = require('axios');
const db = require('./db');

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const MEMBER_ROLE_ID = process.env.DISCORD_MEMBER_ROLE_ID;
const NOTIF_CHANNEL = process.env.DISCORD_NOTIF_CHANNEL;

async function getDMChannel(discordId) {
  try {
    const cached = db.prepare('SELECT channel_id FROM dm_channels WHERE discord_id = ?').get(discordId);
    if (cached) return cached.channel_id;
    const res = await axios.post('https://discord.com/api/v10/users/@me/channels',
      { recipient_id: discordId },
      { headers: { Authorization: 'Bot ' + BOT_TOKEN, 'Content-Type': 'application/json' } }
    );
    db.prepare('INSERT OR REPLACE INTO dm_channels (discord_id, channel_id) VALUES (?, ?)').run(discordId, res.data.id);
    return res.data.id;
  } catch(e) { return null; }
}

async function sendDM(discordId, content) {
  const ch = await getDMChannel(discordId);
  if (!ch) return false;
  try {
    await axios.post('https://discord.com/api/v10/channels/' + ch + '/messages',
      { content },
      { headers: { Authorization: 'Bot ' + BOT_TOKEN, 'Content-Type': 'application/json' } }
    );
    return true;
  } catch(e) { return false; }
}

async function sendMessage(channelId, content) {
  if (!channelId || !BOT_TOKEN) return;
  try {
    await axios.post('https://discord.com/api/v10/channels/' + channelId + '/messages',
      { content },
      { headers: { Authorization: 'Bot ' + BOT_TOKEN, 'Content-Type': 'application/json' } }
    );
  } catch(e) { console.error('[BOT] sendMessage error:', e.message); }
}

async function addMemberToGuild(discordId, accessToken) {
  try {
    if (accessToken) {
      await axios.put('https://discord.com/api/v10/guilds/' + GUILD_ID + '/members/' + discordId,
        { access_token: accessToken, roles: MEMBER_ROLE_ID ? [MEMBER_ROLE_ID] : [] },
        { headers: { Authorization: 'Bot ' + BOT_TOKEN, 'Content-Type': 'application/json' } }
      );
    }
    if (MEMBER_ROLE_ID) {
      await axios.put('https://discord.com/api/v10/guilds/' + GUILD_ID + '/members/' + discordId + '/roles/' + MEMBER_ROLE_ID,
        {},
        { headers: { Authorization: 'Bot ' + BOT_TOKEN, 'Content-Type': 'application/json' } }
      );
    }
    return true;
  } catch(e) {
    console.error('[BOT] addMember error:', e.response?.status);
    return false;
  }
}

async function kickMember(discordId) {
  try {
    await axios.delete('https://discord.com/api/v10/guilds/' + GUILD_ID + '/members/' + discordId,
      { headers: { Authorization: 'Bot ' + BOT_TOKEN } }
    );
    return true;
  } catch(e) { return false; }
}

module.exports = { sendDM, sendMessage, addMemberToGuild, kickMember };
