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
    "nutrition": {"calories": "kcal", "carbs": "g", "protein": "g", "fat": "g"}
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
  if (durationSeconds <= 180) return 1;   // 3분 이하
  if (durationSeconds <= 600) return 2;   // 10분 이하
  if (durationSeconds <= 1200) return 3;  // 20분 이하
  return 4;                                // 20분 초과
}

// ── 유튜브 설명란 + 영상 길이 가져오기 ─────────────────────────
async function getVideoInfo(videoId) {
  if (!YOUTUBE_API_KEY) {
    console.log("⚠️ YOUTUBE_API_KEY가 없어요.");
    return { description: "", durationSeconds: 0 };
  }
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`
    );
    if (!res.ok) {
      console.log("⚠️ YouTube Data API 오류:", res.status);
      return { description: "", durationSeconds: 0 };
    }
    const data = await res.json();
    const item = data.items?.[0];
    const description = item?.snippet?.description || "";
    const durationSeconds = parseDuration(item?.contentDetails?.duration);
    console.log("📄 설명란 길이:", description.length, "자 / 영상 길이:", durationSeconds, "초");
    return { description, durationSeconds };
  } catch (e) {
    console.log("⚠️ 영상 정보 가져오기 실패:", e.message);
    return { description: "", durationSeconds: 0 };
  }
}

// ── 상위 댓글 가져오기 (관련성순 상위 2개) ─────────────────────
async function getTopComments(videoId, maxResults = 2) {
  if (!YOUTUBE_API_KEY) return "";
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=${maxResults}&order=relevance&key=${YOUTUBE_API_KEY}`
    );
    if (!res.ok) {
      console.log("⚠️ 댓글 가져오기 실패 (또는 댓글 사용 안함):", res.status);
      return "";
    }
    const data = await res.json();
    const comments = (data.items || [])
      .map(item => item.snippet.topLevelComment.snippet.textDisplay)
      .filter(Boolean);
    console.log("💬 상위 댓글", comments.length, "개 가져옴");
    return comments.join("\n---\n");
  } catch (e) {
    console.log("⚠️ 댓글 가져오기 실패:", e.message);
    return "";
  }
}

// ── KST 기준 오늘 날짜 (YYYY-MM-DD) ────────────────────────────
function todayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// ── 토큰 잔액 조회 (없으면 생성) ────────────────────────────────
async function getOrCreateUserTokens(user_id) {
  let { data, error } = await supabase
    .from("user_tokens")
    .select("*")
    .eq("user_id", user_id)
    .single();

  if (!data) {
    const { data: created, error: createError } = await supabase
      .from("user_tokens")
      .insert([{ user_id, token_count: 2, last_checkin_date: todayKST(), streak_count: 1 }])
      .select()
      .single();
    if (createError) throw createError;
    return created;
  }
  if (error) throw error;
  return data;
}

// ── 토큰 차감 ──────────────────────────────────────────────────
async function deductTokens(user_id, amount) {
  const { data, error } = await supabase
    .from("user_tokens")
    .select("token_count")
    .eq("user_id", user_id)
    .single();
  if (error) throw error;
  const newCount = Math.max(0, (data?.token_count || 0) - amount);
  const { error: updateError } = await supabase
    .from("user_tokens")
    .update({ token_count: newCount, updated_at: new Date().toISOString() })
    .eq("user_id", user_id);
  if (updateError) throw updateError;
  return newCount;
}

// ── Supadata 자막 추출 ───────────────────────────────────────
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

// ── servings 후처리 (안전장치) ────────────────────────────────
function normalizeServings(parsed) {
  parsed.forEach(recipe => {
    const s = String(recipe.servings || '');
    if (!s || s === 'undefined' || isNaN(parseFloat(s))) {
      recipe.servings = '1회분';
    }
  });
  return parsed;
}

// ── 설명란/댓글 참고 블록 만들기 ────────────────────────────────
function buildReferenceBlock(description, comments) {
  const descBlock = description
    ? `\n\n## 유튜브 설명란 (본문)\n${description.slice(0, 4000)}`
    : `\n\n## 유튜브 설명란 (본문)\n(설명란 정보 없음)`;
  const commentBlock = comments
    ? `\n\n## 상위 댓글 (참고용, 신뢰도 낮음 - 명확한 수치만 참고)\n${comments.slice(0, 2000)}`
    : `\n\n## 상위 댓글\n(댓글 정보 없음)`;
  return descBlock + commentBlock;
}

// ── Gemini 영상 직접 분석 (+설명란/댓글 참고) ──────────────────
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
  console.log("Gemini 응답:", JSON.stringify(data).slice(0, 300));
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  if (!clean) throw new Error("Gemini 응답이 비어있어요.");
  const parsed = JSON.parse(clean);
  const result = Array.isArray(parsed) ? parsed : [parsed];
  return normalizeServings(result);
}

// ── Gemini 자막 텍스트 분석 (+설명란/댓글 참고) ─────────────────
async function analyzeTranscriptWithGemini(transcript, description = "", comments = "") {
  const referenceBlock = buildReferenceBlock(description, comments);

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: `${RECIPE_PROMPT}${referenceBlock}\n\n자막:\n${transcript.slice(0, 8000)}` }
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

// ── 유튜브 레시피 추출 (토큰 소모) ─────────────────────────────
app.post("/api/extract", async (req, res) => {
  const { url, user_id } = req.body;
  if (!url) return res.status(400).json({ error: "URL이 없어요." });
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });

  const videoId = url.match(/(?:v=|youtu\.be\/|shorts\/)([^&?/]+)/)?.[1];
  if (!videoId) return res.status(400).json({ error: "유효한 유튜브 URL이 아니에요." });

  const thumbnailUrl = getThumbnailUrl(videoId);
  const [{ description, durationSeconds }, comments] = await Promise.all([
    getVideoInfo(videoId),
    getTopComments(videoId, 2)
  ]);
  const requiredTokens = calculateTokenCost(durationSeconds);

  // 토큰 잔액 먼저 확인
  let userTokens;
  try {
    userTokens = await getOrCreateUserTokens(user_id);
  } catch (e) {
    return res.status(500).json({ error: "토큰 정보를 불러오지 못했어요: " + e.message });
  }

  if (userTokens.token_count < requiredTokens) {
    return res.status(402).json({
      error: "토큰이 부족해요.",
      required_tokens: requiredTokens,
      current_tokens: userTokens.token_count
    });
  }

  // 추출 시도 (여기서 실패하면 토큰 차감 안 함)
  let recipes, method;
  try {
    console.log("🎬 Gemini 영상 직접 분석 시도");
    recipes = await analyzeVideoWithGemini(url, description, comments);
    method = "gemini_video";
    console.log("✅ Gemini 영상 분석 성공! 레시피", recipes.length, "개");
  } catch (e) {
    console.log("❌ Gemini 영상 분석 실패:", e.message);
    try {
      console.log("📝 Supadata 자막 추출 시도");
      const transcript = await getTranscriptSupadata(videoId);
      console.log("✅ 자막 추출 성공:", transcript.length, "자");
      recipes = await analyzeTranscriptWithGemini(transcript, description, comments);
      method = "transcript";
      console.log("✅ Gemini 분석 성공! 레시피", recipes.length, "개");
    } catch (e2) {
      console.log("❌ 최종 실패:", e2.message);
      return res.status(500).json({ error: "레시피 추출에 실패했어요: " + e2.message });
    }
  }

  // 여기까지 왔으면 추출 성공 → 토큰 차감
  let remainingTokens;
  try {
    remainingTokens = await deductTokens(user_id, requiredTokens);
  } catch (e) {
    console.log("⚠️ 토큰 차감 실패 (추출은 성공):", e.message);
    remainingTokens = userTokens.token_count;
  }

  return res.json({
    recipes,
    method,
    thumbnailUrl,
    tokens_used: requiredTokens,
    remaining_tokens: remainingTokens
  });
});

// ── 토큰 잔액 조회 ───────────────────────────────────────────
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

// ── 출석 체크인 (하루 1회, 2토큰 지급) ─────────────────────────
app.post("/api/checkin", async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "user_id가 없어요." });
  try {
    const tokens = await getOrCreateUserTokens(user_id);
    const today = todayKST();

    if (tokens.last_checkin_date === today) {
      return res.json({ ...tokens, already_checked_in: true });
    }

    const yesterday = new Date(Date.now() + 9 * 60 * 60 * 1000);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const newStreak = tokens.last_checkin_date === yesterdayStr ? tokens.streak_count + 1 : 1;

    const { data, error } = await supabase
      .from("user_tokens")
      .update({
        token_count: tokens.token_count + 2,
        last_checkin_date: today,
        streak_count: newStreak,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", user_id)
      .select()
      .single();
    if (error) throw error;

    res.json({ ...data, already_checked_in: false, tokens_earned: 2 });
  } catch (e) {
    res.status(500).json({ error: "출석 체크 실패: " + e.message });
  }
});

// ── 광고 시청 후 토큰 지급 (+1, 무제한) ────────────────────────
app.post("/api/tokens/watch-ad", async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "user_id가 없어요." });
  try {
    const tokens = await getOrCreateUserTokens(user_id);
    const { data, error } = await supabase
      .from("user_tokens")
      .update({
        token_count: tokens.token_count + 1,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", user_id)
      .select()
      .single();
    if (error) throw error;
    res.json({ ...data, tokens_earned: 1 });
  } catch (e) {
    res.status(500).json({ error: "토큰 지급 실패: " + e.message });
  }
});

// ── 레시피 저장 ──────────────────────────────────────────────
app.post("/api/save-recipe", async (req, res) => {
  const { recipe, category, source_url, thumbnail_url, user_id } = req.body;
  if (!recipe) return res.status(400).json({ error: "레시피가 없어요." });
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { data, error } = await supabase.from("recipes").insert([{
      user_id:       user_id,
      title:         recipe.title,
      description:   recipe.description,
      category:      category || "기타",
      servings:      recipe.servings,
      time:          recipe.time,
      ingredients:   recipe.ingredients,
      steps:         recipe.steps,
      nutrition:     recipe.nutrition,
      source_url:    source_url || "",
      thumbnail_url: thumbnail_url || ""
    }]).select();
    if (error) throw error;
    console.log("✅ 레시피 저장 성공:", recipe.title);
    res.json({ success: true, data });
  } catch (e) {
    console.error("저장 실패:", e.message);
    res.status(500).json({ error: "저장 실패: " + e.message });
  }
});


// ── 레시피 목록 조회 ─────────────────────────────────────────
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

// ── 레시피 수정 ──────────────────────────────────────────────
app.put("/api/recipes/:id", async (req, res) => {
  const { id } = req.params;
  const r = req.body;
  if (!r.user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { data, error } = await supabase.from("recipes").update({
      title:       r.title,
      description: r.description,
      category:    r.category,
      servings:    r.servings,
      time:        r.time,
      ingredients: r.ingredients,
      steps:       r.steps,
      nutrition:   r.nutrition
    }).eq("id", id).eq("user_id", r.user_id).select();
    if (error) throw error;
    console.log("✅ 레시피 수정 성공:", r.title);
    res.json({ success: true, data });
  } catch (e) {
    console.error("수정 실패:", e.message);
    res.status(500).json({ error: "수정 실패: " + e.message });
  }
});

// ── 즐겨찾기 토글 ────────────────────────────────────────────
app.put("/api/recipes/:id/favorite", async (req, res) => {
  const { id } = req.params;
  const { is_favorite, user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "로그인 정보가 없어요." });
  try {
    const { error } = await supabase.from("recipes")
      .update({ is_favorite })
      .eq("id", id)
      .eq("user_id", user_id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "즐겨찾기 실패: " + e.message });
  }
});

// ── 추출 히스토리 조회 ───────────────────────────────────────
app.get("/api/history", async (req, res) => {
  const { user_id } = req.query;
  try {
    const { data, error } = await supabase
      .from("recipes")
      .select("id, title, thumbnail_url, source_url, created_at")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    const history = (data||[]).map(r => ({
      ...r,
      time_ago: timeAgo(r.created_at)
    }));
    res.json({ history });
  } catch(e) {
    res.json({ history: [] });
  }
});

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 3600) return `${Math.floor(diff/60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
  return `${Math.floor(diff/86400)}일 전`;
}

// ── 레시피 삭제 ──────────────────────────────────────────────
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

// ── 이미지로 레시피 추출 ─────────────────────────────────────
app.post("/api/recipe-from-image", async (req, res) => {
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "이미지가 없어요." });
  try {
    const imagePrompt = `이 음식 사진을 보고 레시피를 추론해줘. 반드시 JSON 배열 형식으로만 반환해줘. 다른 텍스트 없이 JSON만:
[{"title":"요리명","description":"한줄설명","servings":"인분","time":"조리시간","ingredients":[{"name":"재료명","amount":"분량"}],"steps":["1단계","2단계"],"nutrition":{"calories":"kcal","carbs":"g","protein":"g","fat":"g"}}]`;
    const res2 = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: imagePrompt },
          { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } }
        ]}],
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

app.listen(3000, () => console.log("✅ 서버 실행 중: http://localhost:3000"));