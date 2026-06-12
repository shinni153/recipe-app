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

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const RECIPE_PROMPT = `이 유튜브 영상을 분석해서 나오는 레시피를 추출해줘.
영상 화면에 표시되는 재료 수치, 텍스트, 자막을 모두 읽어서 최대한 정확하게 추출해줘.

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
    "servings": "인분",
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

// ── Gemini 영상 직접 분석 ────────────────────────────────────
async function analyzeVideoWithGemini(youtubeUrl) {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: RECIPE_PROMPT },
        { fileData: { mimeType: "video/mp4", fileUri: youtubeUrl } }
      ]}],
      generationConfig: { temperature: 0.3 }
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Gemini 서버가 일시적으로 혼잡해요. 잠시 후 다시 시도해주세요.`);
  }
  const data = await res.json();
  console.log("Gemini 응답:", JSON.stringify(data).slice(0, 300));
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  if (!clean) throw new Error("Gemini 응답이 비어있어요.");
  const parsed = JSON.parse(clean);
  return Array.isArray(parsed) ? parsed : [parsed];
}

// ── Gemini 자막 텍스트 분석 ──────────────────────────────────
async function analyzeTranscriptWithGemini(transcript) {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: `${RECIPE_PROMPT}\n\n자막:\n${transcript.slice(0, 8000)}` }
      ]}],
      generationConfig: { temperature: 0.3 }
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Gemini 서버가 일시적으로 혼잡해요. 잠시 후 다시 시도해주세요.`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  if (!clean) throw new Error("Gemini 응답이 비어있어요.");
  const parsed = JSON.parse(clean);
  return Array.isArray(parsed) ? parsed : [parsed];
}

// ── 유튜브 레시피 추출 ───────────────────────────────────────
app.post("/api/extract", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL이 없어요." });
  const videoId = url.match(/(?:v=|youtu\.be\/|shorts\/)([^&?/]+)/)?.[1];
  if (!videoId) return res.status(400).json({ error: "유효한 유튜브 URL이 아니에요." });

  const thumbnailUrl = getThumbnailUrl(videoId);

  try {
    console.log("🎬 Gemini 영상 직접 분석 시도");
    const recipes = await analyzeVideoWithGemini(url);
    console.log("✅ Gemini 영상 분석 성공! 레시피", recipes.length, "개");
    return res.json({ recipes, method: "gemini_video", thumbnailUrl });
  } catch (e) {
    console.log("❌ Gemini 영상 분석 실패:", e.message);
  }

  try {
    console.log("📝 Supadata 자막 추출 시도");
    const transcript = await getTranscriptSupadata(videoId);
    console.log("✅ 자막 추출 성공:", transcript.length, "자");
    const recipes = await analyzeTranscriptWithGemini(transcript);
    console.log("✅ Gemini 분석 성공! 레시피", recipes.length, "개");
    return res.json({ recipes, method: "transcript", thumbnailUrl });
  } catch (e) {
    console.log("❌ 실패:", e.message);
    return res.status(500).json({ error: "레시피 추출에 실패했어요: " + e.message });
  }
});

// ── 레시피 저장 ──────────────────────────────────────────────
app.post("/api/save-recipe", async (req, res) => {
  const { recipe, category, source_url, thumbnail_url } = req.body;
  if (!recipe) return res.status(400).json({ error: "레시피가 없어요." });
  try {
    const { data, error } = await supabase.from("recipes").insert([{
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
  const { category } = req.query;
  try {
    let query = supabase.from("recipes").select("*").order("created_at", { ascending: false });
    if (category && category !== "전체") query = query.eq("category", category);
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
    }).eq("id", id).select();
    if (error) throw error;
    console.log("✅ 레시피 수정 성공:", r.title);
    res.json({ success: true, data });
  } catch (e) {
    console.error("수정 실패:", e.message);
    res.status(500).json({ error: "수정 실패: " + e.message });
  }
});

// ── 레시피 삭제 ──────────────────────────────────────────────
app.delete("/api/recipes/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase.from("recipes").delete().eq("id", id);
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
        generationConfig: { temperature: 0.3 }
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