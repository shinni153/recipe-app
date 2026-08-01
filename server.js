require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

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

required_ingredients_special과 required_ingredients_freetext는 지금은 항상 빈 배열/null로 반환할 것 (재료 마스터 리스트 준비 전).

## 출력 형식
반드시 JSON 배열만 반환. 다른 텍스트 없이 JSON만.

[
  {
    "title": "요리명",
    "description": "한줄 설명",
    "servings": "동영상, 설명란, 댓글 중에서 명확히 확인 가능한 인분 수만 숫자로 표시. 불명확하거나 언급 없으면 반드시 '1회분'으로만 표시. 절대 추측 금지.",
    "time": "총 조리시간",
    "ingredients": [{"name": "재료명", "amount": "분량"}],
    "steps": ["1단계 (중간 준비 과정 포함, 상세하게)", "2단계", ...],
    "nutrition": {"calories": "kcal", "carbs": "g", "protein": "g", "fat": "g"},
    "required_tools": ["stand_mixer", "oven"],
    "required_tools_freetext": null,
    "required_ingredients_special": [],
    "required_ingredients_freetext": null
  }
]

nutrition은 재료 기반으로 반드시 예상 수치를 계산해서 실제 숫자로 채워줘. N/A 금지.
steps는 최소 8단계 이상, 베이스 만들기부터 완성까지 전체 과정 상세하게.`;

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
      .from("user_tokens").insert([{ user_id, token_count: 2, last_checkin_date: todayKST(), streak_count: 1 }])
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
  const { recipe, category, source_url, thumbnail_url, user_id } = req.body;
  if (!recipe) return res.status(400).json({ error: "레시피가 없어요." });
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { data, error } = await supabase.from("recipes").insert([{
      user_id, title: recipe.title, description: recipe.description, category: category || "기타",
      servings: recipe.servings, time: recipe.time, ingredients: recipe.ingredients, steps: recipe.steps,
      nutrition: recipe.nutrition, source_url: source_url || "", thumbnail_url: thumbnail_url || "",
      required_tools: recipe.required_tools || [], required_tools_freetext: recipe.required_tools_freetext || null,
      required_ingredients_special: recipe.required_ingredients_special || [], required_ingredients_freetext: recipe.required_ingredients_freetext || null
    }]).select();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ error: "저장 실패: " + e.message });
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

// ── 레시피 필요 도구 vs 보유 도구 대조 ─────────────────────────
app.get("/api/recipes/:id/tool-check", async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { data: recipe, error: recipeErr } = await supabase.from("recipes")
      .select("required_tools, required_tools_freetext").eq("id", id).single();
    if (recipeErr) throw recipeErr;

    const { data: owned, error: toolsErr } = await supabase.from("user_tools")
      .select("tool_key, has_it, power_tier").eq("user_id", user_id);
    if (toolsErr) throw toolsErr;

    const ownedMap = Object.fromEntries((owned || []).map(o => [o.tool_key, o]));
    const result = (recipe.required_tools || []).map(key => ({
      tool_key: key,
      has_it: ownedMap[key]?.has_it ?? false,
      power_tier: ownedMap[key]?.power_tier ?? null
    }));

    res.json({ tools: result, freetext: recipe.required_tools_freetext });
  } catch (e) {
    res.status(500).json({ error: "도구 대조 실패: " + e.message });
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

app.post("/api/recipe-from-image", async (req, res) => {
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "이미지가 없어요." });
  try {
    const imagePrompt = `이 음식 사진을 보고 레시피를 추론해줘. 반드시 JSON 배열 형식으로만 반환해줘. 다른 텍스트 없이 JSON만:
[{"title":"요리명","description":"한줄설명","servings":"인분","time":"조리시간","ingredients":[{"name":"재료명","amount":"분량"}],"steps":["1단계","2단계"],"nutrition":{"calories":"kcal","carbs":"g","protein":"g","fat":"g"}}]`;
    const res2 = await fetch(GEMINI_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: imagePrompt }, { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } }] }],
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