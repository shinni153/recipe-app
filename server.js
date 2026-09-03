require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const cheerio = require("cheerio");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json({ limit: "100mb" }));

const SUPADATA_API_KEY = process.env.SUPADATA_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const RECIPE_PROMPT = `## 절대 규칙 (가장 중요)
- 인분(servings)은 영상에서 직접 확인된 경우만 숫자로, 아니면 반드시 '1회분'으로만 표시
- 재료 수치는 아래 정보들 중에서 확인된 숫자만 사용할 것
- 어디에서도 확인되지 않은 수치는 절대 추측하거나 만들지 말 것
- 수치가 불명확하면 "적당량"으로 표시할 것

## 재료 수치 우선순위 (매우 중요)
1. "유튜브 설명란" 텍스트에 재료와 정확한 수치가 적혀있으면 그것을 최우선으로 사용할 것
2. 설명란에 없으면 영상 화면에 보이는 수치를 사용할 것
3. 설명란과 화면 둘 다 없을 때만, "상위 댓글" 중 작성자(보통 영상 제작자)가 직접 남긴 것으로 보이는 정확한 계량 정보를 참고할 것. 단, 댓글은 신뢰도가 낮으니 명확한 수치(예: "밀가루 200g")가 있을 때만 사용하고, 애매하면 무시할 것
4. 위 어디에도 없으면 "적당량"으로 표시할 것

이 유튜브 영상을 분석해서 나오는 레시피를 추출해줘.
영상 화면에 표시되는 재료 수치, 텍스트, 자막을 모두 읽고, 아래 제공되는 유튜브 설명란과 상위 댓글도 함께 참고해서 최대한 정확하게 추출해줘.
## 레시피 분리 기준 (매우 중요)
독립적인 레시피로 분리할 것:
- 완성 요리의 핵심이 되는 베이스 (반죽/도우, 육수/브로스, 빵/시트 등)
  → 단, 베이스 없이 바로 완성 요리만 나오는 경우엔 분리하지 마
- 위 베이스를 활용해서 만드는 완성 요리들 (종류별로 각각)

절대 독립 레시피로 분리하지 말 것:
- 토핑/고명 준비 (볶기, 절이기, 캐러멜라이즈 등)
- 소스/양념 만들기 (토마토소스, 크림소스, 양념장 등)
- 재료 손질/전처리
→ 이런 중간 과정들은 완성 요리 레시피의 steps 안에 자연스럽게 녹여줘

## 적용 예시
- 피자 영상: [피자 도우] + [마르게리따 피자] + [페퍼로니 피자]
- 라멘 영상: [돈코츠 육수] + [쇼유 라멘] + [미소 라멘]
- 파스타 영상: [생면 반죽] + [까르보나라] + [봉골레]
- 만두 영상: [만두피 반죽] + [고기만두] + [김치만두]
- 케이크 영상: [제누아즈 시트] + [생크림 케이크] + [티라미수]
- 단일 요리 영상: 레시피 1개만 추출

## 재료 분량 규칙
- 베이스 레시피: 영상 전체 기준 분량 (절대 1/N으로 나누지 마)
- 완성 요리 레시피: 해당 요리 기준 인분으로 표시
- 각 완성 요리에는 베이스 재료도 포함해서 처음부터 끝까지 만들 수 있게 해줘

## 필요 도구 태깅 (매우 중요)
이 레시피에 필요한 도구를 아래 마스터 리스트에서만 골라 배열로 반환할 것.
리스트에 없는 도구가 필요하면 배열에 넣지 말고 required_tools_freetext에 원문 그대로 적을 것.
필요한 도구가 하나도 없으면 required_tools는 빈 배열로.

도구 마스터 리스트:
oven, air_fryer, microwave, induction, thermometer, stand_mixer, hand_mixer,
dough_kneader, whisk, blender, food_processor, kitchen_scale, measuring_cup,
fridge_freezer, piping_bag, silicone_mold, rolling_pin, sieve, spatula,
parchment_paper, pressure_cooker, earthenware_pot, steamer, grill_pan,
mortar_pestle, wok, cleaver, bamboo_steamer, ladle, rice_cooker, sushi_mat,
donabe, japanese_knife, mandoline_slicer

## 필요 특수재료 태깅 (중요)
소금/설탕/밀가루처럼 흔한 재료 말고, 없으면 대체가 필요할 만한 특수재료만 아래 마스터 리스트에서 골라 배열로 반환할 것.
리스트에 없는 특수재료가 필요하면 배열에 넣지 말고 required_ingredients_freetext에 원문 그대로 적을 것.
특수재료가 하나도 없으면 required_ingredients_special은 빈 배열로.

특수재료 마스터 리스트:
mascarpone, cream_cheese, heavy_cream, sour_cream, ricotta,
dark_chocolate, white_chocolate, cocoa_powder,
pistachio_paste, almond_flour, hazelnut_praline,
rum, brandy, coffee_liqueur,
gelatin, vanilla_bean, instant_yeast, doubanjiang, oyster_sauce, mirin

## 조리 단계 구조화 (쿠킹모드용, 중요)
각 조리 단계는 다음 규칙에 따라 구조화해서 반환할 것:
- duration_seconds: 해당 단계에 명확한 소요 시간이 있으면 초 단위 숫자로 (예: "10분간 끓인다" → 600). 시간이 명시되지 않았거나 애매하면 null.
- temperature_celsius: 오븐/에어프라이어 등 명확한 온도 지시가 있으면 섭씨 숫자로 (예: "180도로 예열" → 180). 없으면 null.
- video_timestamp: 실제 영상을 직접 보고 분석하는 경우에만, 그 단계가 시작되는 영상 재생 시점을 "mm:ss" 형식으로. 자막(텍스트)만 받아서 분석하는 경우이거나 시점을 확신할 수 없으면 반드시 null로 반환 (추측 금지).
- ingredients_used: 그 단계에서 실제로 사용하는 재료명 배열 (재료 목록의 name과 최대한 일치시킬 것). 없으면 빈 배열.

## 출력 형식
반드시 JSON 배열만 반환. 다른 텍스트 없이 JSON만.

[
  {
    "title": "요리명",
    "description": "한줄 설명",
    "servings": "동영상, 설명란, 댓글 중에서 명확히 확인 가능한 인분 수만 숫자로 표시. 불명확하거나 언급 없으면 반드시 '1회분'으로만 표시. 절대 추측 금지.",
    "time": "총 조리시간",
    "ingredients": [{"name": "재료명", "amount": "분량"}],
    "steps": [
      {
        "description": "1단계 설명 (중간 준비 과정 포함, 상세하게)",
        "duration_seconds": 300,
        "temperature_celsius": null,
        "video_timestamp": "02:15",
        "ingredients_used": ["이 단계에서 쓰는 재료명"]
      }
    ],
    "nutrition": {"calories": "kcal", "carbs": "g", "protein": "g", "fat": "g"},
    "required_tools": ["stand_mixer", "oven"],
    "required_tools_freetext": null,
    "required_ingredients_special": [],
    "required_ingredients_freetext": null
  }
]

nutrition은 재료 기반으로 반드시 예상 수치를 계산해서 실제 숫자로 채워줘. N/A 금지.
steps는 최소 8단계 이상, 베이스 만들기부터 완성까지 전체 과정 상세하게.`;

// ── 도구 key → 한글 라벨 (대체법 프롬프트용) ───────────────────
const TOOL_LABEL_MAP_KO = {
  oven: "오븐", air_fryer: "에어프라이어", microwave: "전자레인지", induction: "인덕션/가스레인지",
  thermometer: "온도계", stand_mixer: "스탠드믹서", hand_mixer: "핸드믹서", dough_kneader: "반죽기",
  whisk: "거품기", blender: "블렌더/믹서기", food_processor: "푸드프로세서", kitchen_scale: "계량저울",
  measuring_cup: "계량컵/스푼", fridge_freezer: "냉장/냉동고", piping_bag: "짤주머니",
  silicone_mold: "실리콘틀", rolling_pin: "밀대", sieve: "체", spatula: "스패출러/주걱",
  parchment_paper: "유산지", pressure_cooker: "압력밥솥", earthenware_pot: "뚝배기", steamer: "찜기",
  grill_pan: "불판/그릴팬", mortar_pestle: "절구", wok: "웍", cleaver: "중식칼",
  bamboo_steamer: "대나무찜기", ladle: "중식국자", rice_cooker: "전기밥솥", sushi_mat: "김발",
  donabe: "도나베", japanese_knife: "일식칼", mandoline_slicer: "채칼/만돌린",
};

// ── 특수재료 key → 한글 라벨 (대체법 프롬프트용) ───────────────
const INGREDIENT_LABEL_MAP_KO = {
  mascarpone: "마스카포네", cream_cheese: "크림치즈", heavy_cream: "헤비크림",
  sour_cream: "사워크림", ricotta: "리코타치즈",
  dark_chocolate: "다크초콜릿", white_chocolate: "화이트초콜릿", cocoa_powder: "코코아파우더",
  pistachio_paste: "피스타치오 페이스트", almond_flour: "아몬드가루", hazelnut_praline: "헤이즐넛 프랄린",
  rum: "럼", brandy: "브랜디", coffee_liqueur: "커피 리큐르",
  gelatin: "젤라틴", vanilla_bean: "바닐라빈", instant_yeast: "인스턴트 이스트",
  doubanjiang: "두반장", oyster_sauce: "굴소스", mirin: "미림",
};

// ── 유튜브 썸네일 URL 생성 ───────────────────────────────────
function getThumbnailUrl(videoId) {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

// ── ISO 8601 duration 파싱 (PT10M49S → 649초) ─────────────────
function parseDuration(isoDuration) {
  const match = (isoDuration || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

// ── 영상 길이 기준 필요 토큰 계산 ──────────────────────────────
function calculateTokenCost(durationSeconds) {
  if (durationSeconds <= 180) return 1;
  if (durationSeconds <= 600) return 2;
  if (durationSeconds <= 1200) return 3;
  return 4;
}

// ── mp4/mov 파일의 moov.mvhd 박스만 읽어서 영상 길이(초) 계산 ──
// 외부 패키지/ffmpeg 불필요, ISO/IEC 14496-12 박스 구조를 직접 파싱
function getMp4DurationSeconds(buffer) {
  function findBox(buf, boxType, start, end) {
    let offset = start;
    while (offset + 8 <= end) {
      let size = buf.readUInt32BE(offset);
      const type = buf.toString("ascii", offset + 4, offset + 8);
      let headerSize = 8;
      if (size === 1) {
        const high = buf.readUInt32BE(offset + 8);
        const low = buf.readUInt32BE(offset + 12);
        size = high * 2 ** 32 + low;
        headerSize = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (type === boxType) return { start: offset, headerSize, size };
      if (size <= 0) break; // 손상된 파일 방지
      offset += size;
    }
    return null;
  }

  const moov = findBox(buffer, "moov", 0, buffer.length);
  if (!moov) throw new Error("moov 박스를 찾을 수 없어요");
  const mvhd = findBox(buffer, "mvhd", moov.start + moov.headerSize, moov.start + moov.size);
  if (!mvhd) throw new Error("mvhd 박스를 찾을 수 없어요");

  const base = mvhd.start + mvhd.headerSize;
  const version = buffer.readUInt8(base);
  let timescale, duration;
  if (version === 1) {
    timescale = buffer.readUInt32BE(base + 20);
    const high = buffer.readUInt32BE(base + 24);
    const low = buffer.readUInt32BE(base + 28);
    duration = high * 2 ** 32 + low;
  } else {
    timescale = buffer.readUInt32BE(base + 12);
    duration = buffer.readUInt32BE(base + 16);
  }
  if (!timescale) throw new Error("timescale이 0이에요");
  return duration / timescale;
}

// ── 유튜브 설명란 + 영상 길이 가져오기 ─────────────────────────
async function getVideoInfo(videoId) {
  if (!YOUTUBE_API_KEY) return { description: "", durationSeconds: 0 };
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`
    );
    if (!res.ok) return { description: "", durationSeconds: 0 };
    const data = await res.json();
    const item = data.items?.[0];
    const description = item?.snippet?.description || "";
    const durationSeconds = parseDuration(item?.contentDetails?.duration);
    return { description, durationSeconds };
  } catch (e) {
    return { description: "", durationSeconds: 0 };
  }
}

// ── 상위 댓글 가져오기 ───────────────────────────────────────
async function getTopComments(videoId, maxResults = 2) {
  if (!YOUTUBE_API_KEY) return "";
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=${maxResults}&order=relevance&key=${YOUTUBE_API_KEY}`
    );
    if (!res.ok) return "";
    const data = await res.json();
    const comments = (data.items || [])
      .map(item => item.snippet.topLevelComment.snippet.textDisplay)
      .filter(Boolean);
    return comments.join("\n---\n");
  } catch (e) {
    return "";
  }
}

// ── KST 기준 오늘 날짜 ──────────────────────────────────────
function todayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// ── 토큰 잔액 조회 (없으면 생성) ────────────────────────────
async function getOrCreateUserTokens(user_id) {
  let { data, error } = await supabase.from("user_tokens").select("*").eq("user_id", user_id).single();
  if (!data) {
    const { data: created, error: createError } = await supabase
      .from("user_tokens").insert([{ user_id, token_count: 10, last_checkin_date: todayKST(), streak_count: 1 }])
      .select().single();
    if (createError) throw createError;
    return created;
  }
  if (error) throw error;
  return data;
}

async function deductTokens(user_id, amount) {
  const { data, error } = await supabase.from("user_tokens").select("token_count").eq("user_id", user_id).single();
  if (error) throw error;
  const newCount = Math.max(0, (data?.token_count || 0) - amount);
  const { error: updateError } = await supabase.from("user_tokens")
    .update({ token_count: newCount, updated_at: new Date().toISOString() }).eq("user_id", user_id);
  if (updateError) throw updateError;
  return newCount;
}

async function getTranscriptSupadata(videoId) {
  const res = await fetch(`https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}`, {
    headers: { "x-api-key": SUPADATA_API_KEY }
  });
  if (!res.ok) throw new Error(`Supadata 오류: ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).map(c => c.text).join(" ").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("자막이 없어요.");
  return text;
}

function normalizeServings(parsed) {
  parsed.forEach(recipe => {
    const s = String(recipe.servings || '');
    if (!s || s === 'undefined' || isNaN(parseFloat(s))) recipe.servings = '1회분';
  });
  return parsed;
}

function buildReferenceBlock(description, comments) {
  const descBlock = description
    ? `\n\n## 유튜브 설명란 (본문)\n${description.slice(0, 4000)}`
    : `\n\n## 유튜브 설명란 (본문)\n(설명란 정보 없음)`;
  const commentBlock = comments
    ? `\n\n## 상위 댓글 (참고용, 신뢰도 낮음 - 명확한 수치만 참고)\n${comments.slice(0, 2000)}`
    : `\n\n## 상위 댓글\n(댓글 정보 없음)`;
  return descBlock + commentBlock;
}

async function analyzeVideoWithGemini(youtubeUrl, description = "", comments = "") {
  const referenceBlock = buildReferenceBlock(description, comments);
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: RECIPE_PROMPT + referenceBlock },
        { fileData: { mimeType: "video/mp4", fileUri: youtubeUrl } }
      ]}],
      generationConfig: { temperature: 1 }
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Gemini 오류: ${JSON.stringify(err?.error?.message || err)}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  if (!clean) throw new Error("Gemini 응답이 비어있어요.");
  const parsed = JSON.parse(clean);
  const result = Array.isArray(parsed) ? parsed : [parsed];
  return normalizeServings(result);
}

async function analyzeTranscriptWithGemini(transcript, description = "", comments = "") {
  const referenceBlock = buildReferenceBlock(description, comments);
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${RECIPE_PROMPT}${referenceBlock}\n\n자막:\n${transcript.slice(0, 8000)}` }] }],
      generationConfig: { temperature: 1 }
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Gemini 오류: ${JSON.stringify(err?.error?.message || err)}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  if (!clean) throw new Error("Gemini 응답이 비어있어요.");
  const parsed = JSON.parse(clean);
  const result = Array.isArray(parsed) ? parsed : [parsed];
  return normalizeServings(result);
}

// ── 유튜브 레시피 추출 (토큰 소모) ─────────────────────────────
app.post("/api/extract", async (req, res) => {
  const { url, user_id } = req.body;
  if (!url) return res.status(400).json({ error: "URL이 없어요." });
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });

  const videoId = url.match(/(?:v=|youtu\.be\/|shorts\/)([^&?/]+)/)?.[1];
  if (!videoId) return res.status(400).json({ error: "유효한 유튜브 URL이 아니에요." });

  const thumbnailUrl = getThumbnailUrl(videoId);
  const [{ description, durationSeconds }, comments] = await Promise.all([
    getVideoInfo(videoId), getTopComments(videoId, 2)
  ]);
  const requiredTokens = calculateTokenCost(durationSeconds);

  let userTokens;
  try {
    userTokens = await getOrCreateUserTokens(user_id);
  } catch (e) {
    return res.status(500).json({ error: "토큰 정보를 불러오지 못했어요: " + e.message });
  }
  if (userTokens.token_count < requiredTokens) {
    return res.status(402).json({ error: "토큰이 부족해요.", required_tokens: requiredTokens, current_tokens: userTokens.token_count });
  }

  let recipes, method;
  try {
    recipes = await analyzeVideoWithGemini(url, description, comments);
    method = "gemini_video";
  } catch (e) {
    try {
      const transcript = await getTranscriptSupadata(videoId);
      recipes = await analyzeTranscriptWithGemini(transcript, description, comments);
      method = "transcript";
    } catch (e2) {
      return res.status(500).json({ error: "레시피 추출에 실패했어요: " + e2.message });
    }
  }

  let remainingTokens;
  try {
    remainingTokens = await deductTokens(user_id, requiredTokens);
  } catch (e) {
    remainingTokens = userTokens.token_count;
  }

  return res.json({ recipes, method, thumbnailUrl, tokens_used: requiredTokens, remaining_tokens: remainingTokens });
});

app.get("/api/tokens", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: "user_id가 없어요." });
  try {
    const tokens = await getOrCreateUserTokens(user_id);
    res.json(tokens);
  } catch (e) {
    res.status(500).json({ error: "토큰 조회 실패: " + e.message });
  }
});

app.post("/api/checkin", async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "user_id가 없어요." });
  try {
    const tokens = await getOrCreateUserTokens(user_id);
    const today = todayKST();
    if (tokens.last_checkin_date === today) return res.json({ ...tokens, already_checked_in: true });

    const yesterday = new Date(Date.now() + 9 * 60 * 60 * 1000);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const newStreak = tokens.last_checkin_date === yesterdayStr ? tokens.streak_count + 1 : 1;

    const { data, error } = await supabase.from("user_tokens").update({
      token_count: tokens.token_count + 2, last_checkin_date: today, streak_count: newStreak, updated_at: new Date().toISOString()
    }).eq("user_id", user_id).select().single();
    if (error) throw error;
    res.json({ ...data, already_checked_in: false, tokens_earned: 2 });
  } catch (e) {
    res.status(500).json({ error: "출석 체크 실패: " + e.message });
  }
});

app.post("/api/tokens/watch-ad", async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "user_id가 없어요." });
  try {
    const tokens = await getOrCreateUserTokens(user_id);
    const { data, error } = await supabase.from("user_tokens").update({
      token_count: tokens.token_count + 1, updated_at: new Date().toISOString()
    }).eq("user_id", user_id).select().single();
    if (error) throw error;
    res.json({ ...data, tokens_earned: 1 });
  } catch (e) {
    res.status(500).json({ error: "토큰 지급 실패: " + e.message });
  }
});

app.post("/api/save-recipe", async (req, res) => {
  const { recipe, category, source_url, thumbnail_url, user_id, source_type } = req.body;
  if (!recipe) return res.status(400).json({ error: "레시피가 없어요." });
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { data, error } = await supabase.from("recipes").insert([{
      user_id, title: recipe.title, description: recipe.description, category: category || "기타",
      servings: recipe.servings, time: recipe.time, ingredients: recipe.ingredients, steps: recipe.steps,
      nutrition: recipe.nutrition, source_url: source_url || "", thumbnail_url: thumbnail_url || "",
      required_tools: recipe.required_tools || [], required_tools_freetext: recipe.required_tools_freetext || null,
      required_ingredients_special: recipe.required_ingredients_special || [], required_ingredients_freetext: recipe.required_ingredients_freetext || null,
      source_type: source_type === "manual" ? "manual" : "extracted"
    }]).select();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ error: "저장 실패: " + e.message });
  }
});

// ── 레시피 불러오기: 텍스트/사진으로 이미 적힌 레시피를 "그대로" 구조화 ──
// (완성 사진에서 추론하는 /api/recipe-from-image와 다름 — 여기는 이미 적힌 내용을 옮겨적기만 함)
const IMPORT_PROMPT = `아래는 사용자가 이미 갖고 있던 레시피(메모, 노트, 인쇄물 등)의 원문입니다.
이 레시피를 절대로 추론하거나 각색하지 말고, 적힌 내용을 그대로 구조화해서 옮겨 적어주세요.
원문에 없는 내용을 지어내지 마세요 — 불명확하거나 안 적힌 항목은 빈 값/null로 두세요.

## 필요 도구 태깅
이 레시피에 필요한 도구를 아래 마스터 리스트에서만 골라 배열로 반환할 것 (원문에 도구 언급이 있을 때만).
도구 마스터 리스트:
oven, air_fryer, microwave, induction, thermometer, stand_mixer, hand_mixer,
dough_kneader, whisk, blender, food_processor, kitchen_scale, measuring_cup,
fridge_freezer, piping_bag, silicone_mold, rolling_pin, sieve, spatula,
parchment_paper, pressure_cooker, earthenware_pot, steamer, grill_pan,
mortar_pestle, wok, cleaver, bamboo_steamer, ladle, rice_cooker, sushi_mat,
donabe, japanese_knife, mandoline_slicer
리스트에 없으면 required_tools_freetext에, 없으면 required_tools는 빈 배열.

## 필요 특수재료 태깅
특수재료 마스터 리스트:
mascarpone, cream_cheese, heavy_cream, sour_cream, ricotta,
dark_chocolate, white_chocolate, cocoa_powder,
pistachio_paste, almond_flour, hazelnut_praline,
rum, brandy, coffee_liqueur,
gelatin, vanilla_bean, instant_yeast, doubanjiang, oyster_sauce, mirin
리스트에 없으면 required_ingredients_freetext에, 없으면 required_ingredients_special은 빈 배열.

## 조리 단계
각 단계는 { "description", "duration_seconds", "temperature_celsius", "ingredients_used" } 구조로.
원문에 시간/온도가 명시된 경우에만 숫자로, 안 적혀있으면 null. video_timestamp는 항상 null (원본 영상이 없으므로).

## 출력 형식
반드시 JSON 배열만 반환. 다른 텍스트 없이 JSON만:
[
  {
    "title": "요리명",
    "description": "한줄 설명 (원문에 있으면 그대로, 없으면 빈 문자열)",
    "servings": "원문에 명시된 경우만 숫자, 없으면 '1회분'",
    "time": "원문에 명시된 경우만, 없으면 빈 문자열",
    "ingredients": [{"name": "재료명", "amount": "분량"}],
    "steps": [{"description": "...", "duration_seconds": null, "temperature_celsius": null, "video_timestamp": null, "ingredients_used": []}],
    "nutrition": {"calories": null, "carbs": null, "protein": null, "fat": null},
    "required_tools": [], "required_tools_freetext": null,
    "required_ingredients_special": [], "required_ingredients_freetext": null
  }
]`;

app.post("/api/recipes/parse-import", async (req, res) => {
  const { text, imageBase64, mimeType, images } = req.body;

  const imageList = Array.isArray(images) && images.length > 0
    ? images
    : (imageBase64 ? [{ imageBase64, mimeType }] : []);

  if (!text && imageList.length === 0) return res.status(400).json({ error: "텍스트 또는 이미지가 필요해요." });
  try {
    const multiNote = imageList.length > 1
      ? `\n\n참고: 아래 ${imageList.length}장의 사진은 같은 레시피 노트/메모의 여러 페이지일 수 있습니다. 순서대로 이어지는 내용으로 보고 전부 종합해서 하나의 레시피로 옮겨 적어줘.`
      : "";

    const parts = [{
      text: IMPORT_PROMPT + (text ? `\n\n원본 텍스트:\n${text}` : "\n\n원본은 첨부된 이미지를 참고하세요.") + multiNote
    }];
    imageList.forEach(img => {
      parts.push({ inlineData: { mimeType: img.mimeType || "image/jpeg", data: img.imageBase64 } });
    });

    const res2 = await fetch(GEMINI_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.2 } })
    });
    if (!res2.ok) {
      const err = await res2.json();
      throw new Error(JSON.stringify(err?.error?.message || err));
    }
    const data = await res2.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = responseText.replace(/```json|```/g, "").trim();
    if (!clean) throw new Error("Gemini 응답이 비어있어요.");
    const parsed = JSON.parse(clean);
    const recipes = normalizeServings(Array.isArray(parsed) ? parsed : [parsed]);
    res.json({ recipes });
  } catch (e) {
    res.status(500).json({ error: "레시피 불러오기 실패: " + e.message });
  }
});

// ── 블로그/웹페이지 URL로 레시피 불러오기 (2026-09-01 추가) ──────────
// (레시피 불러오기 = IMPORT_PROMPT와 같은 성격: 이미 적힌 레시피를 "그대로" 옮겨적음, 추론 안 함)
// 다만 블로그 글은 조리 후기/일상 이야기가 레시피 앞뒤로 길게 붙는 경우가 많아서
// 그 부분은 무시하고 실제 레시피(재료/조리법)만 골라내도록 지시문을 별도로 둠.
const WEBPAGE_IMPORT_PROMPT = `아래는 블로그/웹페이지에서 가져온 글 원문입니다 (레시피 외에 일상 이야기, 광고, 댓글 등 관련없는 텍스트가 섞여있을 수 있습니다).

이 글에서 실제 레시피(재료, 조리 순서) 부분만 찾아서 옮겨 적어주세요.
- 레시피와 무관한 일상 이야기, 인사말, 광고, 해시태그, 댓글은 완전히 무시할 것
- 절대로 추론하거나 각색하지 말고, 원문에 적힌 내용을 그대로 구조화해서 옮겨 적을 것
- 원문에 없는 내용을 지어내지 말 것 — 불명확하거나 안 적힌 항목은 빈 값/null로 둘 것
- 이 글에 레시피가 아예 없다고 판단되면, 빈 배열 []을 반환할 것

## 필요 도구 태깅
이 레시피에 필요한 도구를 아래 마스터 리스트에서만 골라 배열로 반환할 것 (원문에 도구 언급이 있을 때만).
도구 마스터 리스트:
oven, air_fryer, microwave, induction, thermometer, stand_mixer, hand_mixer,
dough_kneader, whisk, blender, food_processor, kitchen_scale, measuring_cup,
fridge_freezer, piping_bag, silicone_mold, rolling_pin, sieve, spatula,
parchment_paper, pressure_cooker, earthenware_pot, steamer, grill_pan,
mortar_pestle, wok, cleaver, bamboo_steamer, ladle, rice_cooker, sushi_mat,
donabe, japanese_knife, mandoline_slicer
리스트에 없으면 required_tools_freetext에, 없으면 required_tools는 빈 배열.

## 필요 특수재료 태깅
특수재료 마스터 리스트:
mascarpone, cream_cheese, heavy_cream, sour_cream, ricotta,
dark_chocolate, white_chocolate, cocoa_powder,
pistachio_paste, almond_flour, hazelnut_praline,
rum, brandy, coffee_liqueur,
gelatin, vanilla_bean, instant_yeast, doubanjiang, oyster_sauce, mirin
리스트에 없으면 required_ingredients_freetext에, 없으면 required_ingredients_special은 빈 배열.

## 조리 단계
각 단계는 { "description", "duration_seconds", "temperature_celsius", "ingredients_used" } 구조로.
원문에 시간/온도가 명시된 경우에만 숫자로, 안 적혀있으면 null. video_timestamp는 항상 null.

## 출력 형식
반드시 JSON 배열만 반환. 다른 텍스트 없이 JSON만:
[
  {
    "title": "요리명",
    "description": "한줄 설명 (원문에 있으면 그대로, 없으면 빈 문자열)",
    "servings": "원문에 명시된 경우만 숫자, 없으면 '1회분'",
    "time": "원문에 명시된 경우만, 없으면 빈 문자열",
    "ingredients": [{"name": "재료명", "amount": "분량"}],
    "steps": [{"description": "...", "duration_seconds": null, "temperature_celsius": null, "video_timestamp": null, "ingredients_used": []}],
    "nutrition": {"calories": null, "carbs": null, "protein": null, "fat": null},
    "required_tools": [], "required_tools_freetext": null,
    "required_ingredients_special": [], "required_ingredients_freetext": null
  }
]`;

function isNaverBlogUrl(url) {
  return /blog\.naver\.com/.test(url);
}

// 네이버 블로그 PC 버전은 본문이 iframe 안에서 자바스크립트로 로딩되기 때문에
// 서버에서 그냥 긁으면 빈 껍데기만 나옴 -> 모바일 버전(m.blog.naver.com)은
// 서버가 본문을 직접 렌더링해서 내려주므로 그쪽으로 우회함
function toNaverMobileUrl(url) {
  return url.replace(/^https?:\/\/(?:m\.)?blog\.naver\.com/, "https://m.blog.naver.com");
}

async function fetchWebpageText(url) {
  const targetUrl = isNaverBlogUrl(url) ? toNaverMobileUrl(url) : url;

  const pageRes = await fetch(targetUrl, {
    headers: {
      // 일부 블로그/사이트가 봇(비브라우저) 요청을 차단하므로 일반 브라우저처럼 위장
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!pageRes.ok) throw new Error(`페이지를 불러오지 못했어요 (상태코드 ${pageRes.status})`);
  const html = await pageRes.text();

  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, aside, iframe, noscript, form").remove();

  // 사이트별로 본문이 들어있을 확률이 높은 영역을 순서대로 시도하고,
  // 어디에도 안 맞으면 페이지 전체 텍스트로 폴백
  const candidateSelectors = [
    ".se-main-container",            // 네이버 블로그 스마트에디터(SE3)
    "#postViewArea",                 // 네이버 블로그 구버전 에디터
    ".tt_article_useless_p_margin",  // 티스토리
    ".entry-content",                // 워드프레스류
    "article",
  ];
  let contentText = "";
  for (const sel of candidateSelectors) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 100) {
      contentText = el.text();
      break;
    }
  }
  if (!contentText) contentText = $("body").text();

  return contentText.replace(/\s+/g, " ").trim();
}

app.post("/api/recipes/parse-import-url", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL이 없어요." });

  let pageText;
  try {
    pageText = await fetchWebpageText(url);
  } catch (e) {
    return res.status(500).json({ error: "이 페이지에서 내용을 가져오지 못했어요: " + e.message });
  }
  if (!pageText || pageText.length < 50) {
    return res.status(422).json({ error: "이 페이지에서 레시피 내용을 찾지 못했어요. 비공개 글이거나 페이지 구조가 달라서 인식이 안 될 수 있어요." });
  }

  try {
    const prompt = `${WEBPAGE_IMPORT_PROMPT}\n\n원본 페이지 텍스트:\n${pageText.slice(0, 12000)}`;
    const res2 = await fetch(GEMINI_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } })
    });
    if (!res2.ok) {
      const err = await res2.json();
      throw new Error(JSON.stringify(err?.error?.message || err));
    }
    const data = await res2.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = responseText.replace(/```json|```/g, "").trim();
    if (!clean) throw new Error("Gemini 응답이 비어있어요.");
    const parsed = JSON.parse(clean);
    const recipes = normalizeServings(Array.isArray(parsed) ? parsed : [parsed]);
    if (recipes.length === 0) {
      return res.status(422).json({ error: "이 페이지에서 레시피를 찾지 못했어요." });
    }
    res.json({ recipes });
  } catch (e) {
    res.status(500).json({ error: "레시피 분석 실패: " + e.message });
  }
});

app.get("/api/recipes", async (req, res) => {
  const { category, user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: "user_id가 없어요." });
  try {
    let query = supabase.from("recipes").select("*").eq("user_id", user_id).order("created_at", { ascending: false });
    if (category === "즐겨찾기") query = query.eq("is_favorite", true);
    else if (category && category !== "전체") query = query.eq("category", category);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ recipes: data });
  } catch (e) {
    res.status(500).json({ error: "조회 실패: " + e.message });
  }
});

app.put("/api/recipes/:id", async (req, res) => {
  const { id } = req.params;
  const r = req.body;
  if (!r.user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { data, error } = await supabase.from("recipes").update({
      title: r.title, description: r.description, category: r.category, servings: r.servings,
      time: r.time, ingredients: r.ingredients, steps: r.steps, nutrition: r.nutrition
    }).eq("id", id).eq("user_id", r.user_id).select();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ error: "수정 실패: " + e.message });
  }
});

app.put("/api/recipes/:id/favorite", async (req, res) => {
  const { id } = req.params;
  const { is_favorite, user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { error } = await supabase.from("recipes").update({ is_favorite }).eq("id", id).eq("user_id", user_id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "즐겨찾기 실패: " + e.message });
  }
});

/* ══════════════════════════════════════════════════════════════════
   🔧 쿠킹모드 도구 체크 API
   ══════════════════════════════════════════════════════════════════ */

// ── 보유 도구 전체 조회 ───────────────────────────────────────
app.get("/api/tools", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: "user_id가 없어요." });
  try {
    const { data, error } = await supabase.from("user_tools").select("*").eq("user_id", user_id);
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "도구 조회 실패: " + e.message });
  }
});

// ── 온보딩/설정에서 체크한 도구 전체를 한번에 upsert ──────────────
app.put("/api/tools", async (req, res) => {
  const { user_id, tools } = req.body;
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  if (!Array.isArray(tools)) return res.status(400).json({ error: "tools 배열이 필요해요." });
  try {
    const rows = tools.map(t => ({
      user_id, tool_key: t.tool_key, has_it: t.has_it,
      power_tier: t.power_tier || null, note: t.note || null,
      updated_at: new Date().toISOString()
    }));
    const { data, error } = await supabase.from("user_tools")
      .upsert(rows, { onConflict: "user_id,tool_key" }).select();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "도구 저장 실패: " + e.message });
  }
});

// ── 레시피 필요 도구/재료 vs 보유 도구/재료 대조 ─────────────
// 재료는 사용자가 등록 안 했으면 무조건 통과(배열에서 제외) — 선택 사항이라 절대 진행을 막지 않음
app.get("/api/recipes/:id/tool-check", async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { data: recipe, error: recipeErr } = await supabase.from("recipes")
      .select("required_tools, required_tools_freetext, required_ingredients_special, required_ingredients_freetext")
      .eq("id", id).single();
    if (recipeErr) throw recipeErr;

    const { data: ownedTools, error: toolsErr } = await supabase.from("user_tools")
      .select("tool_key, has_it, power_tier").eq("user_id", user_id);
    if (toolsErr) throw toolsErr;

    const { data: ownedPantry, error: pantryErr } = await supabase.from("user_pantry")
      .select("ingredient_key, has_it").eq("user_id", user_id);
    if (pantryErr) throw pantryErr;

    const ownedToolsMap = Object.fromEntries((ownedTools || []).map(o => [o.tool_key, o]));
    const tools = (recipe.required_tools || []).map(key => ({
      tool_key: key,
      has_it: ownedToolsMap[key]?.has_it ?? false,
      power_tier: ownedToolsMap[key]?.power_tier ?? null
    }));

    const ownedPantryMap = Object.fromEntries((ownedPantry || []).map(o => [o.ingredient_key, o]));
    // 등록 안 한 재료는 결과 배열에서 아예 제외 (모름 = 통과, 절대 ❌로 안 뜸)
    const ingredients = (recipe.required_ingredients_special || [])
      .filter(key => ownedPantryMap[key] !== undefined)
      .map(key => ({ ingredient_key: key, has_it: ownedPantryMap[key].has_it }));

    res.json({
      tools, tools_freetext: recipe.required_tools_freetext,
      ingredients, ingredients_freetext: recipe.required_ingredients_freetext
    });
  } catch (e) {
    res.status(500).json({ error: "도구/재료 대조 실패: " + e.message });
  }
});

// ── 대체법 조회 (캐시 우선, 신규/캐시 무관하게 토큰 1개 차감) ──────
app.post("/api/recipes/:id/tool-alternative", async (req, res) => {
  const { id } = req.params;
  const { user_id, kind } = req.body;
  const missingKey = req.body.missing_key || req.body.missing_tool_key; // missing_tool_key는 하위호환용
  const itemKind = kind === "ingredient" ? "ingredient" : "tool"; // 기본값 tool (하위호환)
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  if (!missingKey) return res.status(400).json({ error: "missing_key가 없어요." });

  try {
    const userTokens = await getOrCreateUserTokens(user_id);
    if (userTokens.token_count < 1) {
      return res.status(402).json({ error: "토큰이 부족해요.", required_tokens: 1, current_tokens: userTokens.token_count });
    }

    const { data: recipe, error: recipeErr } = await supabase.from("recipes")
      .select("title, ingredients, steps").eq("id", id).single();
    if (recipeErr || !recipe) return res.status(404).json({ error: "레시피를 찾을 수 없어요." });

    const { data: cached } = await supabase.from("tool_alternatives")
      .select("alternative_text").eq("recipe_id", id).eq("kind", itemKind).eq("tool_key", missingKey).single();

    const labelMap = itemKind === "ingredient" ? INGREDIENT_LABEL_MAP_KO : TOOL_LABEL_MAP_KO;
    const koLabel = labelMap[missingKey] || missingKey;

    let alternative;
    if (cached) {
      alternative = cached.alternative_text;
    } else {
      const prompt = itemKind === "ingredient"
        ? `레시피 "${recipe.title}"를 만드는데 "${koLabel}"이(가) 없어요.
이 재료 없이 만들거나 다른 재료로 대체하는 방법을 2~3문장으로 간결하게 알려줘. 다른 텍스트 없이 대체 방법 설명만 반환해줘.

재료: ${JSON.stringify(recipe.ingredients || [])}
조리 과정: ${JSON.stringify(recipe.steps || [])}`
        : `레시피 "${recipe.title}"를 만드는데 "${koLabel}"이(가) 없어요.
이 도구 없이 만들 수 있는 대체 방법을 2~3문장으로 간결하게 알려줘. 다른 텍스트 없이 대체 방법 설명만 반환해줘.

재료: ${JSON.stringify(recipe.ingredients || [])}
조리 과정: ${JSON.stringify(recipe.steps || [])}`;

      const res2 = await fetch(GEMINI_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4 }
        })
      });
      if (!res2.ok) {
        const err = await res2.json();
        throw new Error(JSON.stringify(err?.error?.message || err));
      }
      const data = await res2.json();
      alternative = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
      if (!alternative) throw new Error("Gemini 응답이 비어있어요.");

      await supabase.from("tool_alternatives")
        .insert([{ recipe_id: id, kind: itemKind, tool_key: missingKey, alternative_text: alternative }]);
    }

    const remainingTokens = await deductTokens(user_id, 1);
    res.json({ alternative, remaining_tokens: remainingTokens });
  } catch (e) {
    res.status(500).json({ error: "대체법 조회 실패: " + e.message });
  }
});

// ── 보유 재료 전체 조회 ───────────────────────────────────────
app.get("/api/pantry", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: "user_id가 없어요." });
  try {
    const { data, error } = await supabase.from("user_pantry").select("*").eq("user_id", user_id);
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "재료 조회 실패: " + e.message });
  }
});

// ── 보유 재료 전체 upsert ──────────────────────────────────
app.put("/api/pantry", async (req, res) => {
  const { user_id, ingredients } = req.body;
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  if (!Array.isArray(ingredients)) return res.status(400).json({ error: "ingredients 배열이 필요해요." });
  try {
    const rows = ingredients.map(i => ({
      user_id, ingredient_key: i.ingredient_key, has_it: i.has_it,
      note: i.note || null, updated_at: new Date().toISOString()
    }));
    const { data, error } = await supabase.from("user_pantry")
      .upsert(rows, { onConflict: "user_id,ingredient_key" }).select();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "재료 저장 실패: " + e.message });
  }
});

app.get("/api/history", async (req, res) => {
  const { user_id } = req.query;
  try {
    const { data, error } = await supabase.from("recipes")
      .select("id, title, thumbnail_url, source_url, created_at").eq("user_id", user_id)
      .order("created_at", { ascending: false }).limit(5);
    if (error) throw error;
    const history = (data || []).map(r => ({ ...r, time_ago: timeAgo(r.created_at) }));
    res.json({ history });
  } catch (e) {
    res.json({ history: [] });
  }
});

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 3600) return `${Math.floor(diff/60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
  return `${Math.floor(diff/86400)}일 전`;
}

app.delete("/api/recipes/:id", async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { error } = await supabase.from("recipes").delete().eq("id", id).eq("user_id", user_id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "삭제 실패: " + e.message });
  }
});

// ── 사진으로 레시피 추론 (여러 장 지원) ─────────────────────────
// 기존 { imageBase64, mimeType } 단일 방식도 그대로 지원(하위호환),
// 새로운 { images: [{imageBase64, mimeType}, ...] } 배열 방식도 지원.


// ── 카카오 로그인: 토큰 검증 + Supabase 계정 연결 ──────────────────
// Supabase가 카카오를 기본 지원 안 해서, 카카오ID 기반으로 고정된(결정적) 비밀번호를
// 서버만 아는 비밀키로 생성해 Supabase 이메일/비밀번호 로그인처럼 처리합니다.
// kakao_user_map 테이블(kakao_id -> supabase_user_id)로 매핑해서,
// 로그인마다 전체 유저를 훑는 listUsers()를 다시 부르지 않도록 했습니다.
// listUsers()는 매핑이 아직 없는 유저(최초 로그인 또는 이 테이블 도입 전 가입자)에 한해서만,
// 그것도 딱 한 번만 호출됩니다.
function deriveKakaoPassword(kakaoUserId) {
  return crypto
    .createHmac("sha256", SUPABASE_SECRET_KEY + ":kakao-auth")
    .update(String(kakaoUserId))
    .digest("hex");
}

async function findKakaoMapping(kakaoId) {
  const { data, error } = await supabase
    .from("kakao_user_map")
    .select("supabase_user_id")
    .eq("kakao_id", String(kakaoId))
    .maybeSingle();
  if (error) throw error;
  return data?.supabase_user_id || null;
}

async function saveKakaoMapping(kakaoId, supabaseUserId) {
  const { error } = await supabase
    .from("kakao_user_map")
    .insert([{ kakao_id: String(kakaoId), supabase_user_id: supabaseUserId }]);
  if (error) throw error;
}

app.post("/api/auth/kakao", async (req, res) => {
  const { accessToken } = req.body;
  if (!accessToken) return res.status(400).json({ error: "카카오 토큰이 없어요." });

  try {
    // 1) 카카오 서버에 토큰 검증 + 사용자 정보 요청
    const kakaoRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!kakaoRes.ok) return res.status(401).json({ error: "유효하지 않은 카카오 토큰이에요." });
    const kakaoUser = await kakaoRes.json();
    const kakaoId = kakaoUser.id;
    const kakaoEmail = kakaoUser.kakao_account?.email;
    const nickname = kakaoUser.kakao_account?.profile?.nickname || null;

    const password = deriveKakaoPassword(kakaoId);

    // 2) 매핑 테이블에서 카카오ID로 바로 조회 (listUsers() 없이 즉시 확인)
    let supabaseUserId = await findKakaoMapping(kakaoId);
    let email;

    if (supabaseUserId) {
      // 이미 매핑된 기존 유저: Supabase에 등록된 현재 이메일을 그대로 사용, 비밀번호만 재설정(idempotent)
      const { data: userData, error: getErr } = await supabase.auth.admin.getUserById(supabaseUserId);
      if (getErr || !userData?.user) throw getErr || new Error("매핑된 유저를 찾을 수 없어요.");
      email = userData.user.email;
      await supabase.auth.admin.updateUserById(supabaseUserId, { password });
    } else {
      // 매핑이 없는 경우: 최초 로그인이거나, 매핑 테이블 도입 전 가입한 레거시 유저일 수 있음
      email = kakaoEmail || `kakao_${kakaoId}@recipex.internal`;

      // 레거시 유저 확인 (이 경로는 매핑이 없을 때만, 유저 1인당 딱 한 번만 탐)
      const { data: userList, error: listErr } = await supabase.auth.admin.listUsers();
      if (listErr) throw listErr;
      const legacy = userList?.users?.find(u => u.email === email);

      if (legacy) {
        supabaseUserId = legacy.id;
        await supabase.auth.admin.updateUserById(supabaseUserId, { password });
      } else {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { provider: "kakao", kakao_id: kakaoId, nickname },
        });
        if (createErr) throw createErr;
        supabaseUserId = created.user.id;
      }

      // 다음부터는 listUsers() 없이 바로 찾을 수 있도록 매핑 저장
      await saveKakaoMapping(kakaoId, supabaseUserId);
    }

    res.json({ email, hashedPassword: password });
  } catch (e) {
    res.status(500).json({ error: "카카오 로그인 처리 실패: " + e.message });
  }
});


// ── 사진으로 레시피 추론 (여러 장 지원) ─────────────────────────
// 기존 { imageBase64, mimeType } 단일 방식도 그대로 지원(하위호환),
// 새로운 { images: [{imageBase64, mimeType}, ...] } 배열 방식도 지원.
app.post("/api/recipe-from-image", async (req, res) => {
  const { imageBase64, mimeType, images } = req.body;

  const imageList = Array.isArray(images) && images.length > 0
    ? images
    : (imageBase64 ? [{ imageBase64, mimeType }] : []);

  if (imageList.length === 0) return res.status(400).json({ error: "이미지가 없어요." });

  try {
    const multiNote = imageList.length > 1
      ? `\n\n참고: 아래 ${imageList.length}장의 사진은 같은 음식(또는 조리 과정)을 여러 각도나 단계에서 찍은 것일 수 있습니다. 모든 사진을 함께 참고해서 하나의 레시피로 종합 추론해줘.`
      : "";

    const imagePrompt = `이 음식 사진을 보고 레시피를 추론해줘. 반드시 JSON 배열 형식으로만 반환해줘. 다른 텍스트 없이 JSON만:
[{"title":"요리명","description":"한줄설명","servings":"인분","time":"조리시간","ingredients":[{"name":"재료명","amount":"분량"}],"steps":["1단계","2단계"],"nutrition":{"calories":"kcal","carbs":"g","protein":"g","fat":"g"}}]${multiNote}`;

    const imageParts = imageList.map(img => ({
      inlineData: { mimeType: img.mimeType || "image/jpeg", data: img.imageBase64 }
    }));

    const res2 = await fetch(GEMINI_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: imagePrompt }, ...imageParts] }],
        generationConfig: { temperature: 1 }
      })
    });
    const data = await res2.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    if (!clean) throw new Error("응답이 비어있어요.");
    const parsed = JSON.parse(clean);
    res.json({ recipes: Array.isArray(parsed) ? parsed : [parsed] });
  } catch (e) {
    res.status(500).json({ error: "이미지 분석 실패: " + e.message });
  }
});

// ── 로컬 동영상 업로드 레시피 분석 (토큰 소모, 유튜브 추출과 동일한 길이별 차등) ──
app.post("/api/recipe-from-video", async (req, res) => {
  const { videoBase64, mimeType, user_id } = req.body;
  if (!videoBase64) return res.status(400).json({ error: "영상이 없어요." });
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });

  const buffer = Buffer.from(videoBase64, "base64");

  // 영상 길이 파악 (mp4/mov 컨테이너의 moov 박스만 읽음, ffmpeg 불필요)
  let durationSeconds = 0;
  try {
    durationSeconds = Math.round(getMp4DurationSeconds(buffer));
    if (!durationSeconds) throw new Error("길이 파악 실패");
  } catch (e) {
    durationSeconds = 180; // 길이 파악 실패 시 최소 구간(1토큰) 기준으로 처리
  }
  const requiredTokens = calculateTokenCost(durationSeconds);

  let userTokens;
  try {
    userTokens = await getOrCreateUserTokens(user_id);
  } catch (e) {
    return res.status(500).json({ error: "토큰 정보를 불러오지 못했어요: " + e.message });
  }
  if (userTokens.token_count < requiredTokens) {
    return res.status(402).json({ error: "토큰이 부족해요.", required_tokens: requiredTokens, current_tokens: userTokens.token_count });
  }

  try {
    const res2 = await fetch(GEMINI_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: RECIPE_PROMPT },
          { inlineData: { mimeType: mimeType || "video/mp4", data: videoBase64 } }
        ]}],
        generationConfig: { temperature: 1 }
      })
    });
    if (!res2.ok) {
      const err = await res2.json();
      throw new Error(JSON.stringify(err?.error?.message || err));
    }
    const data = await res2.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    if (!clean) throw new Error("Gemini 응답이 비어있어요.");
    const parsed = JSON.parse(clean);
    const recipes = normalizeServings(Array.isArray(parsed) ? parsed : [parsed]);

    let remainingTokens;
    try {
      remainingTokens = await deductTokens(user_id, requiredTokens);
    } catch (e) {
      remainingTokens = userTokens.token_count;
    }

    res.json({ recipes, method: "gemini_video_upload", tokens_used: requiredTokens, remaining_tokens: remainingTokens });
  } catch (e) {
    res.status(500).json({ error: "영상 분석에 실패했어요: " + e.message });
  }
});

/* ══════════════════════════════════════════════════════════════════
   🍧 메뉴개발노트 API
   ══════════════════════════════════════════════════════════════════ */

// ── 재료 배열 diff → 변경 태그 감지 ────────────────────────────
function detectChangeTags(prevIng, prevSteps, currIng, currSteps) {
  const tags = [];
  if (prevIng === null) return ["최초"];
  const ingChanged = JSON.stringify(prevIng) !== JSON.stringify(currIng);
  const procChanged = JSON.stringify(prevSteps) !== JSON.stringify(currSteps);
  if (ingChanged) tags.push("재료");
  if (procChanged) tags.push("공정");
  if (!ingChanged && !procChanged) tags.push("동일");
  return tags;
}

// ── "300g", "7~8개 (약 390g)" 같은 텍스트에서 수량/단위 분리 ─────
function splitAmountUnit(text) {
  const raw = String(text || '').trim();
  const m = raw.match(/^([\d.,~]+)\s*([a-zA-Zㄱ-힣]*)/);
  if (m && m[1]) {
    const numPart = m[1].split('~')[0].replace(/,/g, '');
    const amount = parseFloat(numPart);
    if (!isNaN(amount)) return { amount, unit: m[2] || '', rawText: raw };
  }
  return { amount: 0, unit: '', rawText: raw };
}

// ── 레시피 추출 결과 → 메뉴개발노트 생성 (핵심 연동) ─────────────
app.post("/api/menu/from-recipe", async (req, res) => {
  const { recipe_id, user_id, menu_name } = req.body;
  if (!recipe_id) return res.status(400).json({ error: "recipe_id가 없어요." });
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { data: recipe, error: recipeErr } = await supabase.from("recipes")
      .select("*").eq("id", recipe_id).eq("user_id", user_id).single();
    if (recipeErr || !recipe) return res.status(404).json({ error: "레시피를 찾을 수 없어요." });

    const menuName = menu_name || recipe.title;
    const { data: menu, error: menuErr } = await supabase.from("menu_items")
      .insert([{ user_id, name: menuName, category: recipe.category || "", target_cost_ratio: 30 }])
      .select().single();
    if (menuErr) throw menuErr;

    const { data: base, error: baseErr } = await supabase.from("menu_bases")
      .insert([{ menu_item_id: menu.id, name: menuName + " 베이스", source_recipe_id: recipe.id }])
      .select().single();
    if (baseErr) throw baseErr;

    const convertedIngredients = (recipe.ingredients || []).map(i => {
      const { amount, unit, rawText } = splitAmountUnit(i.amount);
      return { name: i.name, amount, unit, costPerUnit: 0, original_text: rawText };
    });

    const { data: version, error: verErr } = await supabase.from("base_versions")
      .insert([{
        base_id: base.id, version_date: todayKST(),
        ingredients: convertedIngredients, process_steps: recipe.steps || [],
        change_tags: ["최초"]
      }]).select().single();
    if (verErr) throw verErr;

    await supabase.from("launch_checklists").insert([{ menu_item_id: menu.id }]);

    res.json({ success: true, menu, base, version });
  } catch (e) {
    res.status(500).json({ error: "메뉴개발노트 생성 실패: " + e.message });
  }
});

// ── 메뉴 목록 조회 ───────────────────────────────────────────
app.get("/api/menu", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: "user_id가 없어요." });
  try {
    const { data: menus, error } = await supabase.from("menu_items")
      .select("*").eq("user_id", user_id).order("created_at", { ascending: false });
    if (error) throw error;

    const menuIds = menus.map(m => m.id);
    const { data: bases } = menuIds.length
      ? await supabase.from("menu_bases").select("id, menu_item_id").in("menu_item_id", menuIds)
      : { data: [] };
    const baseIds = (bases || []).map(b => b.id);
    const { data: versions } = baseIds.length
      ? await supabase.from("base_versions").select("id, base_id").in("base_id", baseIds)
      : { data: [] };

    const result = menus.map(m => {
      const myBaseIds = (bases || []).filter(b => b.menu_item_id === m.id).map(b => b.id);
      const myVersionCount = (versions || []).filter(v => myBaseIds.includes(v.base_id)).length;
      return { ...m, base_count: myBaseIds.length, version_count: myVersionCount };
    });
    res.json({ menus: result });
  } catch (e) {
    res.status(500).json({ error: "조회 실패: " + e.message });
  }
});

// ── 메뉴 상세 (베이스+버전 전부) ─────────────────────────────
app.get("/api/menu/:id", async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: "user_id가 없어요." });
  try {
    const { data: menu, error: menuErr } = await supabase.from("menu_items")
      .select("*").eq("id", id).eq("user_id", user_id).single();
    if (menuErr || !menu) return res.status(404).json({ error: "메뉴를 찾을 수 없어요." });

    const { data: bases } = await supabase.from("menu_bases").select("*").eq("menu_item_id", id);
    const baseIds = (bases || []).map(b => b.id);
    const { data: versions } = baseIds.length
      ? await supabase.from("base_versions").select("*").in("base_id", baseIds).order("version_date", { ascending: true })
      : { data: [] };
    const { data: checklist } = await supabase.from("launch_checklists").select("*").eq("menu_item_id", id).single();

    const basesWithVersions = (bases || []).map(b => ({
      ...b, versions: (versions || []).filter(v => v.base_id === b.id)
    }));
    res.json({ menu, bases: basesWithVersions, checklist });
  } catch (e) {
    res.status(500).json({ error: "조회 실패: " + e.message });
  }
});

// ── 메뉴 정보 수정 ───────────────────────────────────────────
app.put("/api/menu/:id", async (req, res) => {
  const { id } = req.params;
  const { user_id, name, category, season, target_price, target_cost_ratio } = req.body;
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { data, error } = await supabase.from("menu_items")
      .update({ name, category, season, target_price, target_cost_ratio })
      .eq("id", id).eq("user_id", user_id).select().single();
    if (error) throw error;
    res.json({ success: true, menu: data });
  } catch (e) {
    res.status(500).json({ error: "수정 실패: " + e.message });
  }
});

// ── 메뉴 삭제 (베이스/버전/평가/체크리스트 전부 cascade) ────────
app.delete("/api/menu/:id", async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { error } = await supabase.from("menu_items").delete().eq("id", id).eq("user_id", user_id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "삭제 실패: " + e.message });
  }
});

// ── 빈 베이스 추가 ───────────────────────────────────────────
app.post("/api/menu/:menuId/base", async (req, res) => {
  const { menuId } = req.params;
  const { name, user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { data: menu } = await supabase.from("menu_items").select("id").eq("id", menuId).eq("user_id", user_id).single();
    if (!menu) return res.status(404).json({ error: "메뉴를 찾을 수 없어요." });
    const { data: base, error } = await supabase.from("menu_bases").insert([{ menu_item_id: menuId, name }]).select().single();
    if (error) throw error;
    const { data: version } = await supabase.from("base_versions")
      .insert([{ base_id: base.id, version_date: todayKST(), ingredients: [], process_steps: [], change_tags: ["최초"] }])
      .select().single();
    res.json({ success: true, base, version });
  } catch (e) {
    res.status(500).json({ error: "베이스 추가 실패: " + e.message });
  }
});

// ── 베이스 삭제 ──────────────────────────────────────────────
app.delete("/api/menu/base/:baseId", async (req, res) => {
  const { baseId } = req.params;
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    // 소유권 확인 (join 경유)
    const { data: base } = await supabase.from("menu_bases").select("id, menu_item_id").eq("id", baseId).single();
    if (!base) return res.status(404).json({ error: "베이스를 찾을 수 없어요." });
    const { data: menu } = await supabase.from("menu_items").select("id").eq("id", base.menu_item_id).eq("user_id", user_id).single();
    if (!menu) return res.status(403).json({ error: "권한이 없어요." });

    const { error } = await supabase.from("menu_bases").delete().eq("id", baseId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "삭제 실패: " + e.message });
  }
});

// ── 새 버전 저장 (자동 diff 태그 포함) ───────────────────────
app.post("/api/menu/base/:baseId/version", async (req, res) => {
  const { baseId } = req.params;
  const { ingredients, process_steps, version_date, user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { data: lastVer } = await supabase.from("base_versions")
      .select("*").eq("base_id", baseId).order("version_date", { ascending: false }).limit(1).single();

    const tags = detectChangeTags(
      lastVer ? lastVer.ingredients : null, lastVer ? lastVer.process_steps : [],
      ingredients, process_steps
    );

    const { data, error } = await supabase.from("base_versions").insert([{
      base_id: baseId, version_date: version_date || todayKST(),
      ingredients: ingredients || [], process_steps: process_steps || [], change_tags: tags
    }]).select().single();
    if (error) throw error;
    res.json({ success: true, version: data });
  } catch (e) {
    res.status(500).json({ error: "버전 저장 실패: " + e.message });
  }
});

// ── 버전 수정 (재료/공정 편집) ────────────────────────────────
app.put("/api/menu/version/:versionId", async (req, res) => {
  const { versionId } = req.params;
  const { ingredients, process_steps } = req.body;
  try {
    const { data, error } = await supabase.from("base_versions")
      .update({ ingredients, process_steps }).eq("id", versionId).select().single();
    if (error) throw error;
    res.json({ success: true, version: data });
  } catch (e) {
    res.status(500).json({ error: "버전 수정 실패: " + e.message });
  }
});

// ── 평가 로그 추가 ───────────────────────────────────────────
app.post("/api/menu/version/:versionId/evaluation", async (req, res) => {
  const { versionId } = req.params;
  const { rating, problem_notes, next_direction } = req.body;
  try {
    const { data, error } = await supabase.from("evaluation_logs")
      .insert([{ base_version_id: versionId, rating, problem_notes, next_direction }]).select().single();
    if (error) throw error;
    res.json({ success: true, evaluation: data });
  } catch (e) {
    res.status(500).json({ error: "평가 저장 실패: " + e.message });
  }
});

// ── 원가 계산 ────────────────────────────────────────────────
app.get("/api/menu/:menuId/cost", async (req, res) => {
  const { menuId } = req.params;
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { data: menu } = await supabase.from("menu_items").select("*").eq("id", menuId).eq("user_id", user_id).single();
    if (!menu) return res.status(404).json({ error: "메뉴를 찾을 수 없어요." });

    const { data: bases } = await supabase.from("menu_bases").select("id, name").eq("menu_item_id", menuId);
    let totalCost = 0;
    const breakdown = [];
    for (const b of (bases || [])) {
      const { data: versions } = await supabase.from("base_versions")
        .select("*").eq("base_id", b.id).order("version_date", { ascending: false }).limit(1);
      const latest = versions?.[0];
      if (!latest) continue;
      const cost = (latest.ingredients || []).reduce((s, i) => s + (parseFloat(i.amount)||0) * (parseFloat(i.costPerUnit)||0), 0);
      totalCost += cost;
      breakdown.push({ base_name: b.name, version_date: latest.version_date, cost });
    }
    const ratio = menu.target_price ? (totalCost / menu.target_price * 100) : 0;
    res.json({ total_cost: totalCost, target_price: menu.target_price, ratio, breakdown });
  } catch (e) {
    res.status(500).json({ error: "원가 계산 실패: " + e.message });
  }
});

// ── 출시 체크리스트 업데이트 ───────────────────────────────────
app.put("/api/menu/:menuId/checklist", async (req, res) => {
  const { menuId } = req.params;
  const { user_id, ...fields } = req.body;
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { data: menu } = await supabase.from("menu_items").select("id").eq("id", menuId).eq("user_id", user_id).single();
    if (!menu) return res.status(404).json({ error: "메뉴를 찾을 수 없어요." });
    const { data, error } = await supabase.from("launch_checklists")
      .update({ ...fields, updated_at: new Date().toISOString() }).eq("menu_item_id", menuId).select().single();
    if (error) throw error;
    res.json({ success: true, checklist: data });
  } catch (e) {
    res.status(500).json({ error: "체크리스트 업데이트 실패: " + e.message });
  }
});

// ── 🤖 자유 형식 레시피 노트 → Gemini 실제 파싱 (프로토타입의 진짜 버전) ──
app.post("/api/menu/parse-freeform", async (req, res) => {
  let text = req.body?.text;
  console.log("📥 parse-freeform 수신 타입:", typeof text, Array.isArray(text) ? `(배열, 길이 ${text.length})` : "");
  if (Array.isArray(text)) text = text.join("\n");
  if (typeof text !== "string") text = text ? JSON.stringify(text) : "";
  if (!text) return res.status(400).json({ error: "텍스트가 없어요." });

  const PARSE_PROMPT = `아래는 요식업 종사자가 몇 년에 걸쳐 자유롭게 적어온 레시피 개발 노트야.
날짜 형식이 제각각이거나(예: 20.3.25, 211101, 260506), 재료명과 수량이 붙어있거나,
중간에 손상되거나 읽기 힘든 텍스트, 메모성 문장(예: "다음엔 조금 더 넣기")이 섞여있을 수 있어.

다음 원칙으로 구조화해줘:
1. 날짜별로 버전을 구분해줘 (날짜를 찾을 수 없으면 순서대로 "버전1", "버전2"...)
2. 각 버전의 재료명과 수량(g, ml, 개 등)을 최대한 정확히 추출해줘
3. 헤더 한 번 쓰고 그 다음 숫자만 나열하는 표 형식이 있으면, 그 헤더 순서를 기억해서 이후 숫자 줄에 적용해줘
4. 재료/수량이 아니라 메모나 후기로 보이는 문장은 "notes"에 별도로 담고 재료로 넣지 마
5. 손상되거나 확신이 안 서는 부분은 무리해서 추측하지 말고 "ambiguous"에 원문 그대로 남겨줘
6. 절대 재료나 수량을 창작하지 마. 원문에 없는 값은 만들지 마

반드시 아래 JSON 형식으로만 반환해줘. 다른 텍스트 없이 JSON만:
{
  "menu_name_guess": "메뉴명 추정 (있으면)",
  "versions": [
    { "label": "날짜 또는 버전 라벨", "ingredients": [{"name":"재료명","amount":숫자,"unit":"단위"}] }
  ],
  "notes": ["메모로 판단된 문장들"],
  "ambiguous": ["확신 없어서 제외한 원문 줄들"]
}

노트 원문:
${text.slice(0, 12000)}`;

  try {
    const res2 = await fetch(GEMINI_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PARSE_PROMPT }] }],
        generationConfig: { temperature: 0.2 }
      })
    });
    if (!res2.ok) {
      const err = await res2.json();
      throw new Error(JSON.stringify(err?.error?.message || err));
    }
    const data = await res2.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = responseText.replace(/```json|```/g, "").trim();
    if (!clean) throw new Error("Gemini 응답이 비어있어요.");
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: "AI 분석 실패: " + e.message });
  }
});

// ── 날짜 라벨(YYYY.MM.DD, "20XX.MM.DD" 등)에서 실제 날짜만 추출 ──
function parseLabelDate(label) {
  const m = String(label || '').match(/(\d{4}|\d{2}|20XX)\.(\d{1,2})\.(\d{1,2})/);
  if (!m) return null;
  let yy = m[1];
  if (yy === '20XX') yy = '2020';
  else if (yy.length === 2) yy = '20' + yy;
  return `${yy}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
}

// ── 🤖 자유형식 파싱 결과 → 실제 메뉴개발노트로 저장 ──────────────
app.post("/api/menu/save-freeform", async (req, res) => {
  const { user_id, menu_name, versions } = req.body;
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  if (!menu_name) return res.status(400).json({ error: "메뉴명이 없어요." });
  if (!Array.isArray(versions) || versions.length === 0) return res.status(400).json({ error: "저장할 버전이 없어요." });

  try {
    const { data: menu, error: menuErr } = await supabase.from("menu_items")
      .insert([{ user_id, name: menu_name, target_cost_ratio: 30 }])
      .select().single();
    if (menuErr) throw menuErr;

    const { data: base, error: baseErr } = await supabase.from("menu_bases")
      .insert([{ menu_item_id: menu.id, name: menu_name + " 베이스" }])
      .select().single();
    if (baseErr) throw baseErr;

    await supabase.from("launch_checklists").insert([{ menu_item_id: menu.id }]);

    let prevIngredients = null;
    let lastDate = '2019-12-31'; // 최초 날짜 없는 항목의 기준점
    const insertedVersions = [];
    for (let i = 0; i < versions.length; i++) {
      const v = versions[i];
      const ingredients = (v.ingredients || []).map(ing => ({
        name: ing.name, amount: parseFloat(ing.amount) || 0, unit: ing.unit || "", costPerUnit: 0
      }));
      const tags = detectChangeTags(prevIngredients, [], ingredients, []);

      let versionDate = parseLabelDate(v.label);
      if (!versionDate) {
        // 날짜를 못 찾은 라벨(예: "버전1")은 바로 이전 버전 다음날로 배치해서 순서 유지
        const nd = new Date(lastDate + "T00:00:00");
        nd.setDate(nd.getDate() + 1);
        versionDate = nd.toISOString().slice(0, 10);
      }
      lastDate = versionDate;

      const { data: verData, error: verErr } = await supabase.from("base_versions").insert([{
        base_id: base.id,
        version_date: versionDate,
        display_label: v.label,
        ingredients, process_steps: [], change_tags: tags
      }]).select().single();
      if (verErr) throw verErr;
      insertedVersions.push(verData);
      prevIngredients = ingredients;
    }

    res.json({ success: true, menu, base, version_count: insertedVersions.length });
  } catch (e) {
    res.status(500).json({ error: "저장 실패: " + e.message });
  }
});

app.listen(3000, () => console.log("✅ 서버 실행 중: http://localhost:3000"));