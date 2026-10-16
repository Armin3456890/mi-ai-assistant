
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
    return {
      statusCode: 204,
      headers,
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return respond(405, {
      error: "فقط درخواست POST پذیرفته می‌شود."
    });
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return respond(500, {
      error: "کلید GROQ_API_KEY در تنظیمات Netlify پیدا نشد."
    });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const userMessage = String(
      body.message || body.prompt || body.text || ""
    ).trim();

    if (!userMessage) {
      return respond(400, {
        error: "پیام خالی است."
      });
    }

    if (userMessage.length > 12000) {
      return respond(413, {
        error: "پیام بیش از حد طولانی است."
      });
    }

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content:
                "تو mi.AI هستی؛ یک دستیار هوش مصنوعی مفید. " +
                "به فارسی روان و واضح پاسخ بده، مگر اینکه کاربر زبان دیگری بخواهد. " +
                "در برنامه‌نویسی، پاسخ دقیق و کاربردی ارائه کن."
            },
            {
              role: "user",
              content: userMessage
            }
          ],
          max_completion_tokens: 1200,
          temperature: 0.7
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      const message =
        result?.error?.message ||
        result?.message ||
        "سرویس Groq درخواست را نپذیرفت.";

      return respond(response.status, {
        error: message,
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
      error: "خطا در اجرای تابع mi.AI.",
      details: String(error?.message || error)
    });
  }
};
  
