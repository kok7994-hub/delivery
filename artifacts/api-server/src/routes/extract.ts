import { Router } from "express";
import OpenAI from "openai";
import { ExtractAddressesBody } from "@workspace/api-zod";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

router.post("/extract/addresses", async (req, res) => {
  const body = ExtractAddressesBody.parse(req.body);

  const prompt = `이 이미지는 배달 목록 또는 송장입니다. 이미지에서 배달지 정보를 모두 추출해주세요.

각 배달지에 대해 다음 정보를 JSON 배열로 반환해주세요:
- address: 전체 주소 (필수)
- recipientName: 수신자 이름 (있는 경우)
- items: 배달 물품 목록 (있는 경우, 쉼표로 구분)
- notes: 배달 메모나 주의사항 (있는 경우)

반드시 다음 JSON 형식으로만 응답하세요:
{
  "stops": [
    {
      "address": "서울시 강남구 테헤란로 123",
      "recipientName": "홍길동",
      "items": "물품1, 물품2",
      "notes": "경비실 맡겨주세요"
    }
  ],
  "rawText": "이미지에서 읽은 전체 텍스트"
}

주소가 없으면 stops를 빈 배열로 반환하세요.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${body.mimeType};base64,${body.imageBase64}`,
            },
          },
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  let parsed: { stops?: unknown[]; rawText?: string };
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { stops: [], rawText: content };
  }

  res.json({
    stops: Array.isArray(parsed.stops) ? parsed.stops : [],
    rawText: parsed.rawText ?? null,
  });
});

export default router;
