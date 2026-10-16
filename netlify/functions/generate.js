exports.handler = async function (event) {
const headers = {
"Content-Type": "application/json; charset=utf-8",
"Access-Control-Allow-Origin": "*",
"Access-Control-Allow-Headers": "Content-Type",
"Access-Control-Allow-Methods": "POST, OPTIONS"
};

const respond = (statusCode, data) => ({
statusCode,
headers,
body: JSON.stringify(data)
});

if (event.httpMethod === "OPTIONS") {
return { statusCode: 204, headers, body: "" };
}

if (event.httpMethod !== "POST") {
return respond(405, {
error: "فقط درخواست POST پشتیبانی می‌شود."
});
}

let body;

try {
body = JSON.parse(event.body || "{}");
} catch {
return respond(400, {
error: "داده ارسالی معتبر نیست."
});
}

const action = body.action || body.mode || "chat";
const prompt = String(body.prompt || body.message || "").trim();

if (!prompt) {
return respond(400, {
error: "متن درخواست خالی است."
});
}

try {
// ساخت تصویر؛ فارسی به انگلیسی با Groq
if (action === "image") {
const pollinationsKey = process.env.POLLINATIONS_API_KEY;
const groqKey = process.env.GROQ_API_KEY;

  if (!pollinationsKey) {
    return respond(500, {
      error: "کلید POLLINATIONS_API_KEY در Netlify تنظیم نشده است."
    });
  }

  if (!groqKey) {
    return respond(500, {
      error: "کلید GROQ_API_KEY در Netlify تنظیم نشده است."
    });
  }

  // تبدیل درخواست فارسی به پرامپت تصویری انگلیسی
  const translationResult = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + groqKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [
          {
            role: "system",
            content:
              "Convert the user's image request into a detailed " +
              "English image-generation prompt. Preserve the exact " +
              "meaning, subjects, colors, style and any requested text. " +
              "Do not answer the user. Return only the English prompt."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.4,
        max_tokens: 350
      })
    }
  );

  const translationRaw = await translationResult.text();
  let translationData;

  try {
    translationData = JSON.parse(translationRaw);
  } catch {
    return respond(502, {
      error: "پاسخ مترجم هوشمند قابل خواندن نیست."
    });
  }

  if (!translationResult.ok) {
    return respond(translationResult.status, {
      error:
        translationData.error?.message ||
        "تبدیل متن فارسی به پرامپت انگلیسی ناموفق بود."
    });
  }

  const englishPrompt =
    translationData.choices?.[0]?.message?.content?.trim();

  if (!englishPrompt) {
    return respond(502, {
      error: "پرامپت انگلیسی ساخته نشد."
    });
  }

  // ارسال پرامپت به Pollinations
  const model = "black-forest-labs/flux.1-schnell";
  const imageUrl =
    "https://gen.pollinations.ai/image/" +
    encodeURIComponent(englishPrompt) +
    "?model=" + encodeURIComponent(model) +
    "&width=768&height=768&nologo=true";

  const imageResult = await fetch(imageUrl, {
    method: "GET",
    headers: {
      "Authorization": "Bearer " + pollinationsKey,
      "Accept": "image/*"
    }
  });

  if (!imageResult.ok) {
    const details = await imageResult.text();

    return respond(imageResult.status, {
      error: "سرویس ساخت تصویر خطا داد.",
      details: details.slice(0, 1000)
    });
  }

  const contentType =
    imageResult.headers.get("content-type") || "";

  if (!contentType.startsWith("image/")) {
    return respond(502, {
      error: "سرویس به‌جای تصویر، پاسخ معتبری نداد."
    });
  }

  const imageBuffer = Buffer.from(
    await imageResult.arrayBuffer()
  );

  return respond(200, {
    image:
      "data:" + contentType + ";base64," +
      imageBuffer.toString("base64"),
    provider: "Pollinations",
    prompt: englishPrompt
  });
}

// چت فعلی با Groq؛ ساختار حفظ شده است
if (action === "chat" || action === "text") {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return respond(500, {
      error: "متغیر GROQ_API_KEY در Netlify تنظیم نشده است."
    });
  }

  const result = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [
          {
            role: "system",
            content:
              "تو mi.AI هستی، یک دستیار هوش مصنوعی. " +
              "به فارسی روان پاسخ بده، مگر اینکه کاربر زبان دیگری بخواهد. " +
              "در برنامه‌نویسی دقیق و کاربردی کمک کن."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1800
      })
    }
  );

  const raw = await result.text();
  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    return respond(502, {
      error: "پاسخ Groq قابل خواندن نیست."
    });
  }

  if (!result.ok) {
    return respond(result.status, {
      error:
        data.error?.message ||
        "خطا در دریافت پاسخ از Groq."
    });
  }

  const answer = data.choices?.[0]?.message?.content;

  if (typeof answer !== "string" || !answer.trim()) {
    return respond(502, {
      error: "پاسخ متنی معتبری دریافت نشد."
    });
  }

  return respond(200, {
    answer: answer.trim(),
    provider: "Groq"
  });
}

return respond(400, {
  error: "این عملیات پشتیبانی نمی‌شود: " + action
});

} catch (error) {
return respond(500, {
error: "خطای داخلی سرور.",
details: error.message || "خطای ناشناخته"
});
}
};
