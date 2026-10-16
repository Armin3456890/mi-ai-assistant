
const MODEL = "fal-ai/kling-video/v3/turbo/standard/text-to-video";
const BASE_URL = "https://queue.fal.run";

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
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return reply(405, {
      error: "این مسیر فقط درخواست POST می‌پذیرد."
    });
  }

  const apiKey = process.env.FAL_KEY;

  if (!apiKey) {
    return reply(500, {
      error: "کلید FAL_KEY در تنظیمات Netlify پیدا نشد."
    });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const action = body.action;
    const authHeaders = {
      "Authorization": `Key ${apiKey}`,
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

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return reply(response.status, {
          error: "fal.ai درخواست ساخت ویدئو را نپذیرفت.",
          details: data
        });
      }

      if (!data.request_id) {
        return reply(502, {
          error: "شناسه درخواست از fal.ai دریافت نشد.",
          details: data
        });
      }

      return reply(200, {
        success: true,
        request_id: data.request_id,
        status: "IN_QUEUE",
        message: "درخواست ساخت ویدئو ثبت شد."
      });
    }

    if (action === "video_status") {
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

      const statusData = await statusResponse.json().catch(() => ({}));

      if (!statusResponse.ok) {
        return reply(statusResponse.status, {
          error: "بررسی وضعیت ویدئو ناموفق بود.",
          details: statusData
        });
      }

      const status = statusData.status;

      if (status === "COMPLETED") {
        const resultResponse = await fetch(
          `${BASE_URL}/${MODEL}/requests/${encodeURIComponent(requestId)}`,
          { headers: authHeaders }
        );

        const resultData = await resultResponse.json().catch(() => ({}));

        if (!resultResponse.ok) {
          return reply(resultResponse.status, {
            error: "دریافت ویدئوی ساخته‌شده ناموفق بود.",
            details: resultData
          });
        }

        const videoUrl = resultData.video?.url;

        if (!videoUrl) {
          return reply(502, {
            error: "لینک ویدئو در پاسخ fal.ai پیدا نشد.",
            details: resultData
          });
        }

        return reply(200, {
          success: true,
          status: "COMPLETED",
          video_url: videoUrl
        });
      }

      if (status === "FAILED") {
        return reply(502, {
          error: "ساخت ویدئو توسط fal.ai ناموفق بود.",
          details: statusData
        });
      }

      return reply(200, {
        success: true,
        status: status || "IN_PROGRESS",
        message: "ویدئو هنوز در حال ساخت است."
      });
    }

    return reply(400, {
      error: "عملیات نامعتبر است.",
      supported_actions: ["video", "video_status"]
    });

  } catch (error) {
    return reply(500, {
      error: "خطای داخلی در تابع mi.AI رخ داد.",
      details: error.message
    });
  }
};
