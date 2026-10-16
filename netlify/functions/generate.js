
exports.handler = async (event) => {
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
    return {
      statusCode: 204,
      headers,
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return reply(405, {
      error: "Only POST requests are allowed"
    });
  }

  try {
    const key = process.env.FAL_KEY;

    if (!key) {
      return reply(500, {
        error: "کلید FAL_KEY در تنظیمات Netlify پیدا نشد."
      });
    }

    const data = JSON.parse(event.body || "{}");
    const prompt = String(
      data.prompt || data.message || ""
    ).trim();

    const mode = String(data.mode || "chat").toLowerCase();

    if (!prompt) {
      return reply(400, {
        error: "لطفاً پیام خود را وارد کنید."
      });
    }

    // فعلاً اتصال واقعی چت
    if (mode === "chat") {
      const response = await fetch(
        "https://queue.fal.run/fal-ai/any-llm",
        {
          method: "POST",
          headers: {
            "Authorization": `Key ${key}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            prompt:
              "You are mi.AI, a helpful AI assistant. " +
              "Reply in Persian unless the user asks otherwise.\n\n" +
              prompt
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        return reply(response.status, {
          error: result.detail ||
                 result.error ||
                 "خطا در سرویس هوش مصنوعی",
          details: result
        });
      }

      return reply(200, {
        success: true,
        result,
        request_id: result.request_id || null
      });
    }

    return reply(400, {
      error:
        "اتصال این قابلیت هنوز تنظیم نشده است.",
      mode
    });

  } catch (error) {
    return reply(500, {
      error: error.message || "خطای داخلی سرور"
    });
  }
};
