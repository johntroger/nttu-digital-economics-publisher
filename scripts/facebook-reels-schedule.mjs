import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open } from 'node:fs/promises';
import { resolve } from 'node:path';

const page = '817593604765443';
const graph = 'https://graph.facebook.com/v27.0';
const episodes = Array.from({ length: 10 }, (_, i) => String(i + 2).padStart(2, '0'));
const content = new URL('../content/tiktok/', import.meta.url);
const folder = resolve('tmp/facebook-nttu-reels');
const hash = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.replace(/\r\n/g, '\n').trim();
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const ledger = resolve(folder, 'schedule.json');

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadLocalVideo(episode) {
  const filename = suffix => new URL(`tap-${episode}-${suffix}`, content);
  const approval = await readJSON(filename(episode === '02' ? 'buffer-pilot.json' : 'buffer-schedule.json'));
  const r2 = await readJSON(filename('r2-pilot.json'));
  const caption = normalize(await readFile(filename({
    '03': 'ai-caption.txt', '04': 'gioi-thieu-nganh-caption.txt',
  }[episode] ?? 'caption.txt'), 'utf8'));
  const bucket = episode === '02' ? 'nttu-tiktok-tap02-pilot' : 'nttu-tiktok-approved-assets';
  requireThat(approval.channelId === '6af286f062b70b94b0db3094' &&
    approval.episode === episode && r2.episode === episode && r2.bucket === bucket &&
    /^[a-f0-9]{64}$/.test(r2.sha256) && r2.sha256 === approval.sha256 &&
    hash(caption) === approval.captionSha256, `Biên nhận nội dung Tập ${episode} không khớp.`);
  return { episode, url: r2.url, caption, videoSha256: r2.sha256, captionSha256: hash(caption) };
}

async function verifyVideo(video, episode) {
  const { url: source, caption, videoSha256, captionSha256 } = video;
  requireThat(video.episode === episode && /^[a-f0-9]{64}$/.test(videoSha256) &&
    typeof caption === 'string' && hash(caption) === captionSha256, 'Nội dung Reel không khớp.');
  const url = new URL(source);
  requireThat(url.origin === `https://${url.hostname}` && /^pub-[a-f0-9]+\.r2\.dev$/.test(url.hostname) &&
    !url.username && !url.password && !url.search && !url.hash &&
    url.pathname === `/tap-${episode}-${videoSha256}.mp4`, `URL R2 Tập ${episode} không hợp lệ.`);
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  const length = Number(response.headers.get('content-length'));
  requireThat(response.ok && response.headers.get('content-type') === 'video/mp4' &&
    length > 0 && length <= 5_000_000, `R2 không trả đúng MP4 Tập ${episode}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  requireThat(bytes.length === length && hash(bytes) === videoSha256, `SHA-256 Tập ${episode} không khớp.`);
}

function buildSchedule(videos, now) {
  const vietnamDate = new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
  let first = Date.parse(`${vietnamDate}T20:00:00+07:00`);
  if (first < now + 30 * 60_000) first += 86_400_000;
  return videos.map(({ caption, ...video }, i) => ({
    ...video, scheduledAt: new Date(first + i * 86_400_000).toISOString(), state: 'pending',
  }));
}

async function request(url, init, label) {
  let response;
  try {
    response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(25_000) });
  } catch {
    throw new Error(`${label}: không nhận được phản hồi. Đối soát biên nhận trước khi thử lại.`);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.error) {
    const code = Number.isInteger(body?.error?.code) ? ` / Meta ${body.error.code}` : '';
    throw new Error(`${label}: HTTP ${response.status}${code}.`);
  }
  return body;
}

function metaClient(token, secret) {
  const proof = createHmac('sha256', secret).update(token).digest('hex');
  const auth = { Authorization: `Bearer ${token}` };
  return {
    async read(path, params) {
      const query = new URLSearchParams({ ...params, appsecret_proof: proof });
      return request(`${graph}/${path}?${query}`, { headers: auth }, 'Đọc Meta Graph API');
    },
    async reel(params, label) {
      return request(`${graph}/${page}/video_reels`, {
        method: 'POST', headers: auth,
        body: new URLSearchParams({ ...params, appsecret_proof: proof }),
      }, label);
    },
    async upload(url, source) {
      return request(url, {
        method: 'POST', headers: { Authorization: `OAuth ${token}`, file_url: source },
      }, 'Tải Reel từ R2');
    },
  };
}

async function scheduledPosts(meta) {
  const posts = [];
  let after;
  for (let n = 0; n < 5; n++) {
    const result = await meta.read(`${page}/scheduled_posts`, {
      fields: 'id,message,scheduled_publish_time', limit: '50', ...(after ? { after } : {}),
    });
    requireThat(Array.isArray(result.data), 'Không đọc được danh sách bài đã lên lịch.');
    posts.push(...result.data);
    if (!result.paging?.next) return posts;
    after = result.paging.cursors?.after;
    requireThat(after, 'Thiếu con trỏ đọc lịch Meta.');
  }
  throw new Error('Cần đọc thêm lịch Meta để kiểm tra trùng.');
}

const epoch = value => /^\d+$/.test(String(value)) ? Number(value) * 1000 : Date.parse(value);
const dateLabel = timestamp => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
}).format(new Date(timestamp));

async function save(plan) {
  const temporary = resolve(folder, 'schedule.next.json');
  await writeFile(temporary, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
  await rename(temporary, ledger);
}

async function verifySchedule(meta, entry, caption) {
  const at = Date.parse(entry.scheduledAt);
  for (let attempt = 0; attempt < 12; attempt++) {
    const posts = await scheduledPosts(meta);
    const matching = posts.filter(post => epoch(post.scheduled_publish_time) === at &&
      typeof post.message === 'string' && normalize(post.message) === caption);
    requireThat(matching.length <= 1, `Tập ${entry.episode} có lịch trùng trên Meta.`);
    if (matching.length === 1) return matching[0].id;
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  throw new Error(`Meta chưa hiển thị giờ đăng Tập ${entry.episode}. Giữ ID Reel để đối soát.`);
}

async function scheduleOne(meta, entry, video, plan) {
  const at = Date.parse(entry.scheduledAt);
  const existing = await scheduledPosts(meta);
  requireThat(!existing.some(post => epoch(post.scheduled_publish_time) === at ||
    (typeof post.message === 'string' && normalize(post.message) === video.caption)),
  `Tập ${entry.episode} trùng giờ hoặc mô tả với bài đã lên lịch.`);
  requireThat(at > Date.now() + 15 * 60_000, `Khung giờ Tập ${entry.episode} quá gần.`);
  entry.state = 'starting';
  await save(plan);
  const start = await meta.reel({ upload_phase: 'start' }, 'Tạo phiên tải Reel');
  requireThat(typeof start.video_id === 'string' && /^\d{5,25}$/.test(start.video_id),
    'Meta không trả ID Reel hợp lệ.');
  entry.videoId = start.video_id;
  entry.state = 'uploading';
  await save(plan);
  const upload = new URL(start.upload_url);
  requireThat(upload.origin === 'https://rupload.facebook.com' && !upload.username && !upload.password &&
    !upload.search && !upload.hash && new RegExp(`^/video-upload/v\\d+\\.\\d+/${entry.videoId}$`).test(upload.pathname),
  'Địa chỉ tải lên Meta không hợp lệ.');
  const result = await meta.upload(upload.href, video.url);
  requireThat(result.success === true, 'Meta chưa xác nhận đã nhận MP4.');
  entry.state = 'submitting';
  await save(plan);
  const finish = await meta.reel({
    upload_phase: 'finish', video_id: entry.videoId, video_state: 'SCHEDULED',
    scheduled_publish_time: String(at / 1000), description: video.caption, is_ai_generated: 'true',
  }, 'Đặt lịch Reel');
  requireThat(finish.success === true, 'Meta chưa xác nhận yêu cầu đặt lịch.');
  entry.state = 'verifying';
  if (typeof finish.post_id === 'string') entry.responsePostId = finish.post_id;
  await save(plan);
  entry.postId = await verifySchedule(meta, entry, video.caption);
  entry.state = 'scheduled';
  await save(plan);
  console.log(`Tập ${entry.episode} | ${dateLabel(entry.scheduledAt)} | ${entry.postId}`);
}

async function main() {
  const [mode = '--preview', ...extra] = process.argv.slice(2);
  requireThat(['--preview', '--apply', '--manifest'].includes(mode) && extra.length === 0, 'Dùng --preview, --manifest hoặc --apply.');
  const encodedManifest = process.env.FACEBOOK_REELS_MANIFEST;
  const videos = encodedManifest
    ? JSON.parse(Buffer.from(encodedManifest, 'base64').toString('utf8'))
    : await Promise.all(episodes.map(loadLocalVideo));
  requireThat(Array.isArray(videos) && videos.length === episodes.length, 'Danh sách tập không khớp.');
  for (const [i, episode] of episodes.entries()) await verifyVideo(videos[i], episode);
  if (mode === '--manifest') {
    await mkdir(folder, { recursive: true });
    await writeFile(resolve(folder, 'manifest.b64'), Buffer.from(JSON.stringify(videos)).toString('base64'), { flag: 'wx' });
    return;
  }
  const newPlan = () => ({ page, timezone: 'Asia/Ho_Chi_Minh', items: buildSchedule(videos, Date.now()) });
  if (mode === '--preview') {
    console.log(newPlan().items.map(entry => `Tập ${entry.episode} | ${dateLabel(entry.scheduledAt)}`).join('\n'));
    return;
  }
  const token = process.env.META_PAGE_ACCESS_TOKEN?.trim();
  const secret = process.env.META_APP_SECRET?.trim();
  requireThat(token && secret, 'Thiếu Page Access Token hoặc App Secret của Meta.');
  const meta = metaClient(token, secret);
  const account = await meta.read('me', { fields: 'id' });
  requireThat(account.id === page, 'Page Access Token không thuộc fanpage Ngành Kinh tế số – NTTU.');
  await mkdir(folder, { recursive: true });
  const lock = await open(resolve(folder, 'apply.lock'), 'wx');
  try {
    let plan = await readJSON(ledger).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!plan) {
      requireThat(process.env.GITHUB_RUN_ATTEMPT !== undefined ? process.env.GITHUB_RUN_ATTEMPT === '1' : true,
        'Không chạy lại một lượt GitHub đã gửi yêu cầu. Đối soát biên nhận trước.');
      plan = newPlan();
      await save(plan);
    }
    requireThat(plan.page === page && plan.items.length === videos.length, 'Biên nhận Facebook không khớp lô.');
    for (const [i, entry] of plan.items.entries()) {
      const video = videos[i];
      requireThat(entry.episode === video.episode && entry.videoSha256 === video.videoSha256 &&
        entry.captionSha256 === video.captionSha256 && entry.url === video.url &&
        entry.scheduledAt.endsWith('T13:00:00.000Z'), 'Biên nhận video hoặc giờ đăng không khớp.');
      if (entry.state === 'scheduled') continue;
      if (entry.state === 'verifying' || entry.state === 'submitting') {
        entry.postId = await verifySchedule(meta, entry, video.caption);
        entry.state = 'scheduled';
        await save(plan);
      } else {
        requireThat(entry.state === 'pending', `Tập ${entry.episode} cần đối soát lần tải trước.`);
        await scheduleOne(meta, entry, video, plan);
      }
    }
    console.log(`Đã xác nhận ${plan.items.length} Reel trên Meta. Biên nhận: ${ledger}`);
  } finally {
    await lock.close();
    const { unlink } = await import('node:fs/promises');
    await unlink(resolve(folder, 'apply.lock'));
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
