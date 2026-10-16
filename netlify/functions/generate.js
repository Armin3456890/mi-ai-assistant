
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

async function translatePrompt(prompt, kind = "image") {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("کلید GROQ_API_KEY در Netlify تنظیم نشده است.");
  }

  const instruction = kind === "video"
    ? "Convert the user's request into a detailed English text-to-video prompt. Describe the scene, motion, camera movement, lighting and visual style. Preserve the user's meaning. Return only the prompt."
    : "Convert the user's request into a detailed English image-generation prompt. Preserve the original meaning and visual details. Return only the prompt.";

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
          { role: "system", content: instruction },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 350
      })
    }
  );

  const data = await readResponse(response);

  if (!response.ok) {
    throw new Error(
      `خطای آماده‌سازی توضیح (${response.status}): ` +
      (data.error?.message || data.error || "خطای Groq")
    );
  }

  const translated = data.choices?.[0]?.message?.content?.trim();

  if (!translated) {
    throw new Error("توضیح انگلیسی تولید نشد.");
  }

  return translated;
}

// ساخت تصویر
async function generateImage(prompt) {
  const apiKey = process.env.POLLINATIONS_API_KEY;

  if (!apiKey) {
    throw new Error("کلید POLLINATIONS_API_KEY در Netlify پیدا نشد.");
  }

  const englishPrompt = await translatePrompt(prompt, "image");

  const url = new URL(
    "https://gen.pollinations.ai/image/" +
    encodeURIComponent(englishPrompt)
  );

  url.searchParams.set("model", "flux");
  url.searchParams.set("width", "768");
  url.searchParams.set("height", "768");
  url.searchParams.set("nologo", "true");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "image/*"
    }
  });

  if (!response.ok) {
    throw new Error(
      `خطای سرویس تصویر (${response.status}): ` +
      (await response.text()).slice(0, 500)
    );
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.startsWith("image/")) {
    throw new Error("سرویس تصویر خروجی تصویری برنگرداند.");
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());

  if (!imageBuffer.length) {
    throw new Error("تصویر دریافتی خالی است.");
  }

  return {
    image: `data:${contentType};base64,${imageBuffer.toString("base64")}`,
    provider: "Pollinations",
    prompt: englishPrompt
  };
}

// ساخت ویدئو
async function generateVideo(prompt) {
  const apiKey = process.env.POLLINATIONS_API_KEY;

  if (!apiKey) {
    throw new Error("کلید POLLINATIONS_API_KEY در Netlify پیدا نشد.");
  }

  const englishPrompt = await translatePrompt(prompt, "video");

  const url = new URL(
    "https://gen.pollinations.ai/video/" +
    encodeURIComponent(englishPrompt)
  );

  url.searchParams.set("model", "google/veo-3.1-fast");
  url.searchParams.set("duration", "4");
  url.searchParams.set("aspectRatio", "16:9");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "video/mp4"
    }
  });

  if (!response.ok) {
    throw new Error(
      `خطای سرویس ویدئو (${response.status}): ` +
      (await response.text()).slice(0, 700)
    );
  }

  const contentType = response.headers.get("content-type") || "";

  if (
    !contentType.startsWith("video/") &&
    !contentType.includes("octet-stream")
  ) {
    throw new Error(
      "سرویس ویدئو به‌جای فایل ویدئویی، نوع محتوای دیگری فرستاد."
    );
  }

  const videoBuffer = Buffer.from(await response.arrayBuffer());

  if (!videoBuffer.length) {
    throw new Error("فایل ویدئوی دریافتی خالی است.");
  }

  // پاسخ تابع Netlify محدودیت حجم دارد.
  // فایل بزرگ‌تر را رد می‌کنیم تا خطای مبهم ایجاد نشود.
  if (videoBuffer.length > 4 * 1024 * 1024) {
    throw new Error(
      "حجم ویدئو برای پاسخ مستقیم Netlify زیاد است. " +
      "باید روش تحویل فایل را تغییر دهیم."
    );
  }

  return {
    statusCode: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "video/mp4",
      "Content-Disposition": 'inline; filename="mi-ai-video.mp4"',
      "Cache-Control": "no-store"
    },
    isBase64Encoded: true,
    body: videoBuffer.toString("base64")
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
    { role: "user", content: prompt }
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
      return reply({
        error: "لطفاً ابتدا توضیحات را وارد کن."
      }, 400);
    }

    if (action === "image") {
      return reply(await generateImage(prompt));
    }

    if (action === "video") {
      return await generateVideo(prompt);
    }

    if (action === "chat" || action === "text") {
      return reply(
        await generateChat(
          prompt,
          body.history || body.messages || []
        )
      );
    }

    return reply({
      error: `عملیات «${action}» هنوز پیاده‌سازی نشده است.`
    }, 400);

  } catch (error) {
    return reply({
      error: error?.message || "خطای ناشناخته در سرور mi.AI"
    }, 500);
  }
};
