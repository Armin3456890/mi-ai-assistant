const fetch = globalThis.fetch;

const corsHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function reply(data, statusCode = 200) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(data),
  };
}

function getPrompt(body) {
  return String(
    body?.prompt ??
    body?.message ??
    body?.text ??
    body?.input ??
    ""
  ).trim();
}

async function readResponse(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 1200) };
  }
}

// تبدیل توضیح فارسی تصویر به انگلیسی با Groq
async function translateImagePrompt(prompt) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("کلید GROQ_API_KEY در Netlify تنظیم نشده است.");
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [
          {
            role: "system",
            content:
              "Convert the user's image request into a detailed English image-generation prompt. Preserve the original meaning and visual details. Return only the English prompt, without explanations."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 300
      })
    }
  );

  const data = await readResponse(response);

  if (!response.ok) {
    throw new Error(
      `خطای تبدیل توضیح تصویر (${response.status}): ` +
      (data.error?.message || data.error || "خطای Groq")
    );
  }

  const translated = data.choices?.[0]?.message?.content?.trim();

  if (!translated) {
    throw new Error("توضیح انگلیسی تصویر ساخته نشد.");
  }

  return translated;
}

// ساخت تصویر
async function generateImage(prompt) {
  const apiKey = process.env.POLLINATIONS_API_KEY;

  if (!apiKey) {
    throw new Error(
      "کلید POLLINATIONS_API_KEY در تنظیمات Netlify پیدا نشد."
    );
  }

  const englishPrompt = await translateImagePrompt(prompt);

  const url = new URL(
    "https://gen.pollinations.ai/image/" +
    encodeURIComponent(englishPrompt)
  );

  url.searchParams.set("model", "flux");
  url.searchParams.set("width", "768");
  url.searchParams.set("height", "768");
  url.searchParams.set("nologo", "true");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "image/*"
    }
  });

  if (!response.ok) {
    const details = await response.text();

    throw new Error(
      `خطای سرویس تصویر (${response.status}): ` +
      details.slice(0, 500)
    );
  }

  const contentType =
    response.headers.get("content-type") || "";

  if (!contentType.startsWith("image/")) {
    const details = await response.text();

    throw new Error(
      "سرویس تصویر به‌جای عکس، پاسخ دیگری فرستاد: " +
      details.slice(0, 300)
    );
  }

  const imageBuffer = Buffer.from(
    await response.arrayBuffer()
  );

  if (!imageBuffer.length) {
    throw new Error("تصویر دریافتی خالی است.");
  }

  return {
    image:
      `data:${contentType};base64,` +
      imageBuffer.toString("base64"),
    provider: "Pollinations",
    prompt: englishPrompt
  };
}

// پاسخ متنی چت
async function generateChat(prompt, history = []) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("کلید GROQ_API_KEY در Netlify تنظیم نشده است.");
  }

  const messages = [
    {
      role: "system",
      content:
        "تو دستیار هوش مصنوعی mi.AI هستی. به زبان کاربر، معمولاً فارسی، واضح و مفید پاسخ بده."
    },
    ...(Array.isArray(history)
      ? history
          .filter(
            item =>
              item &&
              ["user", "assistant"].includes(item.role) &&
              typeof item.content === "string"
          )
          .slice(-12)
      : []),
    {
      role: "user",
      content: prompt
    }
  ];

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages,
        temperature: 0.7,
        max_tokens: 1200
      })
    }
  );

  const data = await readResponse(response);

  if (!response.ok) {
    throw new Error(
      `خطای چت (${response.status}): ` +
      (data.error?.message || data.error || "خطای Groq")
    );
  }

  const text = data.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error("پاسخ متنی دریافت نشد.");
  }

  return { reply: text, response: text };
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return reply({
      error: "این مسیر فقط درخواست POST می‌پذیرد."
    }, 405);
  }

  try {
    let body;

    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return reply({ error: "بدنهٔ درخواست JSON معتبر نیست." }, 400);
    }

    const action = String(body.action || "chat").toLowerCase();
    const prompt = getPrompt(body);

    if (!prompt) {
      return reply({ error: "لطفاً ابتدا پیام یا توضیح تصویر را بنویس." }, 400);
    }

    if (action === "image") {
      const result = await generateImage(prompt);
      return reply(result);
    }

    if (action === "chat" || action === "text") {
      const result = await generateChat(
        prompt,
        body.history || body.messages || []
      );
      return reply(result);
    }

    return reply({
      error: `عملیات «${action}» هنوز در این تابع پیاده‌سازی نشده است.`
    }, 400);

  } catch (error) {
    return reply({
      error: error?.message || "خطای ناشناخته در سرور mi.AI"
    }, 500);
  }
};
