
exports.handler = async (event) => {
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
      error: "فقط درخواست POST پذیرفته می‌شود."
    });
  }

  try {
    const data = JSON.parse(event.body || "{}");
    const action = String(
      data.action || data.mode || "chat"
    ).toLowerCase();

    // بخش ساخت تصویر
    if (action === "image") {
      const hfToken = process.env.HF_TOKEN;

      if (!hfToken) {
        return respond(500, {
          error: "متغیر HF_TOKEN در Netlify تنظیم نشده است."
        });
      }

      const prompt = String(
        data.prompt || data.message || ""
      ).trim();

      if (!prompt) {
        return respond(400, {
          error: "توضیحات تصویر را وارد کن."
        });
      }

      if (prompt.length > 2000) {
        return respond(413, {
          error: "توضیحات تصویر بیش از حد طولانی است."
        });
      }

      const imageResponse = await fetch(
        "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-3-medium-diffusers",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${hfToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              width: 512,
              height: 512,
              num_inference_steps: 20
            }
          })
        }
      );

      if (!imageResponse.ok) {
        const rawError = await imageResponse.text();
        let detail = rawError;

        try {
          const parsed = JSON.parse(rawError);
          detail =
            parsed.error ||
            parsed.message ||
            parsed.detail ||
            rawError;
        } catch (_) {}

        if (typeof detail !== "string") {
          detail = JSON.stringify(detail);
        }

        return respond(imageResponse.status, {
          error: "سرویس ساخت تصویر: " + detail.slice(0, 1000)
        });
      }

      const contentType =
        imageResponse.headers.get("content-type") || "";

      if (!contentType.startsWith("image/")) {
        const raw = await imageResponse.text();

        return respond(502, {
          error:
            "سرویس به‌جای تصویر، پاسخ دیگری فرستاد: " +
            raw.slice(0, 500)
        });
      }

      const imageBuffer = Buffer.from(
        await imageResponse.arrayBuffer()
      );

      if (!imageBuffer.length) {
        return respond(502, {
          error: "تصویر خالی دریافت شد."
        });
      }

      return respond(200, {
        image:
          `data:${contentType};base64,` +
          imageBuffer.toString("base64"),
        provider: "Hugging Face"
      });
    }

    // بخش چت Groq
    const groqKey = process.env.GROQ_API_KEY;

    if (!groqKey) {
      return respond(500, {
        error: "کلید GROQ_API_KEY در Netlify پیدا نشد."
      });
    }

    const prompt = String(
      data.message || data.prompt || data.text || ""
    ).trim();

    if (!prompt) {
      return respond(400, {
        error: "پیام خالی است."
      });
    }

    if (prompt.length > 12000) {
      return respond(413, {
        error: "پیام بیش از حد طولانی است."
      });
    }

    const chatResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content:
                "تو mi.AI هستی؛ یک دستیار هوش مصنوعی مفید. " +
                "به فارسی روان پاسخ بده، مگر اینکه کاربر زبان دیگری بخواهد. " +
                "در برنامه‌نویسی پاسخ دقیق و کاربردی ارائه کن."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          max_completion_tokens: 1200,
          temperature: 0.7
        })
      }
    );

    const raw = await chatResponse.text();
    let result = {};

    try {
      result = JSON.parse(raw);
    } catch (_) {}

    if (!chatResponse.ok) {
      const detail =
        result?.error?.message ||
        result?.message ||
        raw ||
        "سرویس Groq درخواست را نپذیرفت.";

      return respond(chatResponse.status, {
        error: String(detail).slice(0, 1000),
        provider: "Groq"
      });
    }

    const answer =
      result?.choices?.[0]?.message?.content;

    if (!answer) {
      return respond(502, {
        error: "پاسخ متنی از Groq دریافت نشد."
      });
    }

    return respond(200, {
      answer,
      provider: "Groq"
    });

  } catch (error) {
    return respond(500, {
      error: "خطا در اجرای mi.AI.",
      details: String(error?.message || error)
    });
  }
};
