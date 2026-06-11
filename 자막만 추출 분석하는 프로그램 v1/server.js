require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SUPADATA_API_KEY = process.env.SUPADATA_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const RECIPE_PROMPT = `아래 내용에서 레시피를 모두 추출해줘. 

중요한 규칙:
- 영상에 공통 베이스(예: 피자 도우, 육수, 소스 등)가 있고 그걸 활용한 여러 요리가 나오면, 각 요리의 ingredients에 공통 재료도 포함시켜서 완전한 레시피로 만들어줘.
- 각 요리는 처음부터 끝까지 만들 수 있는 완전한 레시피여야 해.
- 조리 방법도 도우/베이스 만들기부터 완성까지 전체 과정을 포함해줘.
- 반드시 JSON 배열 형식으로만 반환해줘. 다른 텍스트 없이 JSON만 반환해야 해.
- 절대로 플레이스홀더나 예시값("000kcal", "00g", "몇인분" 등)을 쓰지 말고 실제 값으로 채워줘.

각 레시피 규칙:
- title: 실제 요리 이름
- description: 요리에 대한 한줄 설명
- servings: 실제 인분 수 (예: "2인분", "4인분")
- time: 실제 총 조리 시간 (도우/베이스 포함)
- ingredients: 처음부터 끝까지 필요한 모든 재료와 실제 분량. 영상에서 정확한 수치(g, ml, 개, 큰술 등)가 언급된 경우 반드시 그 숫자로 표시해줘. 수치가 전혀 언급되지 않은 경우에만 "적당량"으로 표시해줘. 절대로 수치를 임의로 만들어 넣지 마.
- steps: 베이스/도우 만들기부터 완성까지 전체 단계를 상세하게 (최소 8단계 이상)
- nutrition: 예상 영양 정보를 실제 숫자로

JSON 형식 (배열로 반환):
[
  {
    "title": "실제 요리명",
    "description": "실제 한줄설명",
    "servings": "실제 인분",
    "time": "실제 총 조리시간",
    "ingredients": [{"name": "실제 재료명", "amount": "실제 분량"}],
    "steps": ["도우/베이스 만들기 1단계", "2단계", "토핑 올리기", "굽기"],
    "nutrition": {"calories": "실제kcal", "carbs": "실제g", "protein": "실제g", "fat": "실제g"}
  }
]`;

// Supadata로 유튜브 자막 추출
async function getTranscript(videoId) {
  console.log("Supadata로 자막 추출 시도:", videoId);
  const res = await fetch(`https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}`, {
    headers: { "x-api-key": SUPADATA_API_KEY }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supadata 오류: ${res.status} - ${err}`);
  }
  const data = await res.json();
  const text = (data.content || []).map(c => c.text).join(" ").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("자막이 없는 영상이에요.");
  return text;
}

async function callGroq(content) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content }],
      temperature: 0.3,
      max_tokens: 4000
    })
  });
  const data = await res.json();
  console.log("Groq 응답 앞부분:", JSON.stringify(data).slice(0, 300));
  const text = data.choices?.[0]?.message?.content || "";
  const clean = text.replace(/```json|```/g, "").trim();
  if (!clean) throw new Error("Groq 응답이 비어있어요.");
  const parsed = JSON.parse(clean);
  return Array.isArray(parsed) ? parsed : [parsed];
}

// 유튜브 자막 추출
app.post("/api/transcript", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL이 없어요." });
  try {
    const videoId = url.match(/(?:v=|youtu\.be\/|shorts\/)([^&?/]+)/)?.[1];
    if (!videoId) return res.status(400).json({ error: "유효한 유튜브 URL이 아니에요." });
    const text = await getTranscript(videoId);
    console.log("✅ 자막 길이:", text.length, "자");
    console.log("자막 앞부분:", text.slice(0, 300));
    res.json({ transcript: text });
  } catch (e) {
    console.error("자막 추출 실패:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// 자막으로 레시피 추출
app.post("/api/recipe", async (req, res) => {
  const { transcript } = req.body;
  if (!transcript) return res.status(400).json({ error: "자막 텍스트가 없어요." });
  try {
    const recipes = await callGroq(`${RECIPE_PROMPT}\n\n자막:\n${transcript.slice(0, 8000)}`);
    res.json({ recipes });
  } catch (e) {
    res.status(500).json({ error: "레시피 분석 실패: " + e.message });
  }
});

// 이미지로 레시피 추출
app.post("/api/recipe-from-image", async (req, res) => {
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "이미지가 없어요." });
  try {
    const res2 = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.2-11b-vision-preview",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: RECIPE_PROMPT },
            { type: "image_url", image_url: { url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}` } }
          ]
        }],
        temperature: 0.3
      })
    });
    const data = await res2.json();
    const text = data.choices?.[0]?.message?.content || "";
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