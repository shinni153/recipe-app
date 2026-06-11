require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SUPADATA_API_KEY = process.env.SUPADATA_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const RECIPE_PROMPT = `이 유튜브 영상을 분석해서 나오는 모든 레시피를 추출해줘.
영상 화면에 표시되는 재료 수치, 텍스트, 자막을 모두 읽어서 최대한 정확하게 추출해줘.
여러 요리가 나오면 각각 따로 추출해줘.

반드시 JSON 배열 형식으로만 반환해줘. 다른 텍스트 없이 JSON만 반환해야 해.

규칙:
- title: 실제 요리 이름
- description: 요리에 대한 한줄 설명
- servings: 실제 인분 수 (예: "2인분")
- time: 실제 총 조리 시간
- ingredients: 영상에서 보이거나 언급된 실제 재료와 정확한 분량. 수치가 없으면 "적당량"
- steps: 베이스/도우 만들기부터 완성까지 전체 단계 상세하게 (최소 8단계)
- nutrition: 영상에 영양 정보가 없어도 재료와 분량을 기반으로 반드시 예상 수치를 계산해서 실제 숫자로 채워줘. 절대 N/A로 남기지 마. (예: {"calories": "450kcal", "carbs": "60g", "protein": "15g", "fat": "12g"})

JSON 형식:
[
  {
    "title": "실제 요리명",
    "description": "실제 한줄설명",
    "servings": "실제 인분",
    "time": "실제 총 조리시간",
    "ingredients": [{"name": "실제 재료명", "amount": "실제 분량"}],
    "steps": ["전체 과정 1단계", "2단계"],
    "nutrition": {"calories": "실제kcal", "carbs": "실제g", "protein": "실제g", "fat": "실제g"}
  }
]`;

// Supadata로 자막 추출
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

// Gemini로 유튜브 영상 직접 분석
async function analyzeVideoWithGemini(youtubeUrl) {
  console.log("Gemini로 영상 직접 분석 시작:", youtubeUrl);
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: RECIPE_PROMPT },
          { fileData: { mimeType: "video/mp4", fileUri: youtubeUrl } }
        ]
      }],
      generationConfig: { temperature: 0.3 }
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
  return Array.isArray(parsed) ? parsed : [parsed];
}

// Gemini로 자막 텍스트 분석
async function analyzeTranscriptWithGemini(transcript) {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `${RECIPE_PROMPT}\n\n자막:\n${transcript.slice(0, 8000)}` }]
      }],
      generationConfig: { temperature: 0.3 }
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Gemini 오류: ${JSON.stringify(err?.error?.message || err)}`);
  }
  const data = await res.json();
  console.log("Gemini 자막 분석 응답:", JSON.stringify(data).slice(0, 300));
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  if (!clean) throw new Error("Gemini 응답이 비어있어요.");
  const parsed = JSON.parse(clean);
  return Array.isArray(parsed) ? parsed : [parsed];
}

// 유튜브 레시피 추출 (Gemini 영상 분석 우선, 실패시 Supadata+Groq)
app.post("/api/extract", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL이 없어요." });

  const videoId = url.match(/(?:v=|youtu\.be\/|shorts\/)([^&?/]+)/)?.[1];
  if (!videoId) return res.status(400).json({ error: "유효한 유튜브 URL이 아니에요." });

  // 방법 1: Gemini 영상 직접 분석
  try {
    console.log("🎬 방법1: Gemini 영상 직접 분석 시도");
    const recipes = await analyzeVideoWithGemini(url);
    console.log("✅ Gemini 영상 분석 성공! 레시피", recipes.length, "개");
    return res.json({ recipes, method: "gemini_video" });
  } catch (e) {
    console.log("❌ Gemini 영상 분석 실패:", e.message);
  }

  // 방법 2: Supadata 자막 + Groq 분석
  try {
    console.log("📝 방법2: Supadata 자막 추출 시도");
    const transcript = await getTranscriptSupadata(videoId);
    console.log("✅ 자막 추출 성공:", transcript.length, "자");
    const recipes = await analyzeTranscriptWithGemini(transcript);
    console.log("✅ Groq 분석 성공! 레시피", recipes.length, "개");
    return res.json({ recipes, method: "transcript", transcript });
  } catch (e) {
    console.log("❌ Supadata+Groq 실패:", e.message);
    return res.status(500).json({ error: "레시피 추출에 실패했어요: " + e.message });
  }
});

// 자막 텍스트만 확인용
app.post("/api/transcript", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL이 없어요." });
  try {
    const videoId = url.match(/(?:v=|youtu\.be\/|shorts\/)([^&?/]+)/)?.[1];
    if (!videoId) return res.status(400).json({ error: "유효한 유튜브 URL이 아니에요." });
    const transcript = await getTranscriptSupadata(videoId);
    console.log("자막 길이:", transcript.length, "자");
    res.json({ transcript });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 이미지로 레시피 추출 (Gemini Vision)
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
        contents: [{
          parts: [
            { text: imagePrompt },
            { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } }
          ]
        }],
        generationConfig: { temperature: 0.3 }
      })
    });
    const data = await res2.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    if (!clean) throw new Error("응답이 비어있어요.");
    const parsed = JSON.parse(clean);
    const recipes = Array.isArray(parsed) ? parsed : [parsed];
    res.json({ recipes });
  } catch (e) {
    res.status(500).json({ error: "이미지 분석 실패: " + e.message });
  }
});

app.listen(3000, () => console.log("✅ 서버 실행 중: http://localhost:3000"));