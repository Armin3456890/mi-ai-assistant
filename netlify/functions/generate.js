
exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  function respond(statusCode, data) {
    return {
      statusCode,
      headers,
      body: JSON.stringify(data)
    };
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return respond(405, { error: "فقط درخواست POST پشتیبانی می‌شود." });
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return respond(400, { error: "داده ارسالی معتبر نیست." });
  }

  const action = body.action || body.mode || "chat";
  const prompt = String(body.prompt || body.message || "").trim();

  if (!prompt) {
    return respond(400, { error: "متن درخواست خالی است." });
  }

  try {
    // ساخت تصویر با Hugging Face
    if (action === "image") {
      const token = process.env.HF_TOKEN;

      if (!token) {
        return respond(500, {
          error: "متغیر HF_TOKEN در تنظیمات Netlify تنظیم نشده است."
        });
      }

      const result = await fetch(
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

      if (!result.ok) {
        const details = await result.text();

        return respond(result.status, {
          error: "سرویس ساخت تصویر خطا داد.",
          details: details.slice(0, 1200)
        });
      }

      const contentType = result.headers.get("content-type") || "";

      if (!contentType.startsWith("image/")) {
        return respond(502, {
          error: "سرویس به‌جای تصویر، پاسخ دیگری برگرداند."
        });
      }

      const buffer = Buffer.from(await result.arrayBuffer());

      return respond(200, {
        image: "data:" + contentType + ";base64," +
          buffer.toString("base64"),
        provider: "Hugging Face"
      });
    }

    // چت هوشمند با Groq
    if (action === "chat" || action === "text") {
      const apiKey = process.env.GROQ_API_KEY;

      if (!apiKey) {
        return respond(500, {
          error: "متغیر GROQ_API_KEY در تنظیمات Netlify تنظیم نشده است."
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
      } catch (error) {
        return respond(502, {
          error: "پاسخ Groq قابل خواندن نیست."
        });
      }

      if (!result.ok) {
        return respond(result.status, {
          error: data.error?.message || "خطا در دریافت پاسخ از Groq."
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
          
