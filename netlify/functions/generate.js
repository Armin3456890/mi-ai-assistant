
exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: "Only POST requests are allowed"
      })
    };
  }

  try {
    if (!process.env.FAL_KEY) {
      throw new Error("FAL_KEY is not configured");
    }

    const data = JSON.parse(event.body || "{}");
    const prompt = String(data.prompt || "").trim();

    if (!prompt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "لطفاً توضیحات ساخت محتوا را وارد کنید."
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: "اتصال سرور آماده است.",
        prompt: prompt,
        nextStep: "Choose the appropriate fal.ai model for this task."
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message || "Server error"
      })
    };
  }
};
    
