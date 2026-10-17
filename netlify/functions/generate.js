
const MODEL = "fal-ai/kling-video/v3/turbo/standard/text-to-video";
const BASE_URL = "https://queue.fal.run";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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

  const readable = (value) => {
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  const readResponse = async (response) => {
    const raw = await response.text();
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return { raw_response: raw };
    }
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return reply(405, {
      error: "این مسیر فقط درخواست POST می‌پذیرد."
    });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const action = body.action;

    // چت هوشمند فارسی با OpenRouter
    if (action === "chat") {
      const apiKey = process.env.OPENROUTER_API_KEY;

      if (!apiKey) {
        return reply(500, {
          error: "کلید OPENROUTER_API_KEY در تنظیمات Netlify پیدا نشد."
        });
      }

      const prompt = String(body.prompt || "").trim();

      if (!prompt) {
        return reply(400, {
          error: "لطفاً پیام خودت را بنویس."
        });
      }

      if (prompt.length > 10000) {
        return reply(400, {
          error: "پیام بیش از حد طولانی است."
        });
      }

      const incomingMessages = Array.isArray(body.messages)
        ? body.messages
            .filter((m) =>
              m &&
              ["user", "assistant"].includes(m.role) &&
              typeof m.content === "string"
            )
            .slice(-12)
            .map((m) => ({
              role: m.role,
              content: m.content.slice(0, 10000)
            }))
        : [];

      const messages = [
        {
          role: "system",
          content:
            "تو mi.AI هستی، یک دستیار هوش مصنوعی مفید و دقیق. " +
            "به‌طور پیش‌فرض به زبان فارسی روان پاسخ بده، مگر کاربر زبان دیگری بخواهد. " +
            "پاسخ‌ها را روشن، کاربردی و متناسب با سؤال ارائه کن."
        },
        ...incomingMessages,
        {
          role: "user",
          content: prompt
        }
      ];

      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-OpenRouter-Title": "mi.AI"
        },
        body: JSON.stringify({
          model: "openrouter/free",
          messages,
          temperature: 0.7,
          max_tokens: 1200
        })
      });

      const data = await readResponse(response);

      if (!response.ok) {
        return reply(response.status, {
          error: "OpenRouter نتوانست پاسخ تولید کند.",
          http_status: response.status,
          details: readable(data.error || data)
        });
      }

      const answer = data.choices?.[0]?.message?.content;

      if (typeof answer !== "string" || !answer.trim()) {
        return reply(502, {
          error: "پاسخ متنی معتبری از مدل دریافت نشد."
        });
      }

      return reply(200, {
        success: true,
        answer: answer.trim(),
        model: data.model || "openrouter/free"
      });
    }

    // عملیات ویدئو و بررسی وضعیت آن با fal.ai
    if (action === "video" || action === "video_status") {
      const apiKey = process.env.FAL_KEY;

      if (!apiKey) {
        return reply(500, {
          error: "کلید FAL_KEY در تنظیمات Netlify پیدا نشد."
        });
      }

      const authHeaders = {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json"
      };

      if (action === "video") {
        const prompt = String(body.prompt || "").trim();

        if (!prompt) {
          return reply(400, {
            error: "لطفاً توضیحات ویدئو را وارد کن."
          });
        }

        if (prompt.length > 2500) {
          return reply(400, {
            error: "توضیحات ویدئو باید حداکثر ۲۵۰۰ کاراکتر باشد."
          });
        }

        const response = await fetch(`${BASE_URL}/${MODEL}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            prompt,
            duration: "5",
            aspect_ratio: "16:9"
          })
        });

        const data = await readResponse(response);

        if (!response.ok) {
          return reply(response.status, {
            error: "fal.ai درخواست ساخت ویدئو را نپذیرفت.",
            http_status: response.status,
            details: readable(data)
          });
        }

        if (!data.request_id) {
          return reply(502, {
            error: "شناسه درخواست از fal.ai دریافت نشد.",
            details: readable(data)
          });
        }

        return reply(200, {
          success: true,
          request_id: data.request_id,
          status: "IN_QUEUE",
          message: "درخواست ساخت ویدئو ثبت شد."
        });
      }

      const requestId = String(body.request_id || "").trim();

      if (!requestId) {
        return reply(400, {
          error: "شناسه درخواست ارسال نشده است."
        });
      }

      const statusResponse = await fetch(
        `${BASE_URL}/${MODEL}/requests/${encodeURIComponent(requestId)}/status`,
        { headers: authHeaders }
      );

      const statusData = await readResponse(statusResponse);

      if (!statusResponse.ok) {
        return reply(statusResponse.status, {
          error: "بررسی وضعیت ویدئو ناموفق بود.",
          http_status: statusResponse.status,
          details: readable(statusData)
        });
      }

      if (statusData.status === "COMPLETED") {
        const resultResponse = await fetch(
          `${BASE_URL}/${MODEL}/requests/${encodeURIComponent(requestId)}`,
          { headers: authHeaders }
        );

        const resultData = await readResponse(resultResponse);

        if (!resultResponse.ok) {
          return reply(resultResponse.status, {
            error: "دریافت نتیجه ویدئو ناموفق بود.",
            http_status: resultResponse.status,
            details: readable(resultData)
          });
        }

        const videoUrl = resultData.video?.url;

        if (!videoUrl) {
          return reply(502, {
            error: "لینک ویدئو در پاسخ fal.ai پیدا نشد.",
            details: readable(resultData)
          });
        }

        return reply(200, {
          success: true,
          status: "COMPLETED",
          video_url: videoUrl
        });
      }

      if (statusData.status === "FAILED") {
        return reply(502, {
          error: "fal.ai در ساخت ویدئو ناموفق بود.",
          details: readable(statusData)
        });
      }

      return reply(200, {
        success: true,
        status: statusData.status || "IN_PROGRESS",
        message: "ویدئو هنوز در حال ساخت است."
      });
    }

    return reply(400, {
      error: "عملیات نامعتبر است.",
      supported_actions: ["chat", "video", "video_status"]
    });

  } catch (error) {
    return reply(500, {
      error: "خطای داخلی در تابع mi.AI رخ داد.",
      details: error?.message || String(error)
    });
  }
};
