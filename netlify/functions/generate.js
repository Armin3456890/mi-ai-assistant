
exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  const reply = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data)
  });

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return reply(405, { error: "فقط درخواست POST پشتیبانی می‌شود." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_) {
    return reply(400, { error: "داده ارسالی معتبر نیست." });
  }

  const action = body.action || body.mode || "chat";
  const prompt = String(body.prompt || body.message || "").trim();

  if (!prompt) {
    return reply(400, { error: "متن درخواست خالی است." });
  }

  try {
    // ساخت تصویر با Hugging Face
    if (action === "image") {
      const token = process.env.HF_TOKEN;

      if (!token) {
        return reply(500, {
          error: "متغیر HF_TOKEN در تنظیمات Netlify تنظیم نشده است."
        });
      }

      const imageResponse = await fetch(
        "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-3-medium-diffusers",
        {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "Accept": "image/*"
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              width: 512,
              height: 512
            }
          })
        }
      );

      if (!imageResponse.ok) {
        const details = await imageResponse.text();
        return reply(imageResponse.status, {
          error: "سرویس ساخت تصویر خطا داد.",
          details: details.slice(0, 1200)
        });
      }

      const contentType = imageResponse.headers.get("content-type") || "";

      if (!contentType.startsWith("image/")) {
        const details = await imageResponse.text();
        return reply(502, {
          error: "سرویس به‌جای تصویر، پاسخ دیگری برگرداند.",
          details: details.slice(0, 1000)
        });
      }

      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const imageBase64 = imageBuffer.toString("base64");

      return reply(200, {
        image: "data:" + contentType + ";base64," + imageBase64,
        provider: "Hugging Face"
      });
    }

    // چت هوشمند با Groq
    if (action === "chat" || action === "text") {
      const apiKey = process.env.GROQ_API_KEY;

      if (!apiKey) {
        return reply(500, {
          error: "متغیر GROQ_API_KEY در تنظیمات Netlify تنظیم نشده است."
        });
      }

      const groqResponse = await fetch(
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
                content: "تو mi.AI هستی؛ یک دستیار هوش مصنوعی مفید. به فارسی روان و روشن پاسخ بده، مگر اینکه کاربر زبان دیگری بخواهد. در درخواست‌های برنامه‌نویسی، پاسخ دقیق و کد قابل استفاده ارائه کن."
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

      const raw = await groqResponse.text();
      let data;

      try {
        data = JSON.parse(raw);
      } catch (_) {
        return reply(502, {
          error: "پاسخ Groq قابل خواندن نیست.",
          details: raw.slice(0, 800)
        });
      }

      if (!groqResponse.ok) {
        return reply(groqResponse.status, {
          error: data.error?.message || "خطا در دریافت پاسخ از Groq."
        });
      }

      const answer = data.choices?.[0]?.message?.content;

      if (typeof answer !== "string" || !answer.trim()) {
        return reply(502, {
          error: "پاسخ متنی معتبری از Groq دریافت نشد."
        });
      }

      return reply(200, {
        answer: answer.trim(),
        provider: "Groq"
      });
    }

    return reply(400, {
      error: "این عملیات هنوز پشتیبانی نمی‌شود: " + action
    });

  } catch (error) {
    return reply(500, {
      error: "خطای داخلی سرور.",
      details: error.message || "خطای ناشناخته"
    });
  }
};
        
