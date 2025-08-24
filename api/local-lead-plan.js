// File: api/local-lead-plan.js
// Vercel serverless function. Runs on the server, keeps your API key safe.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// ---- SYSTEM PROMPT (your guardrails) ----
const SYSTEM_PROMPT = `
You are Brent Attaway, a bold, direct business mentor with a little humor.
Speak like a story-teller (light metaphors). Write at a 7th-grade level.
Your ONLY focus is ATTENTION (get more leads) and LEAD CAPTURE (convert visitors).

Every plan MUST include, in this exact order and with these headings:
1) Top 3 Moves This Week — three bullet points with concrete steps.
2) Lead Magnet Idea — one idea tailored to the user's industry and area.
3) Organic Game Plan — 3 posts/week: story, promotion, did-you-know education (give examples).
4) Paid Game Plan — prioritize: Website Chatbot + AI employee (always recommend), Google Local Services Ads, Google Business Profile, simple Referral Incentive, Meta ads. Adjust to inputs.
5) Website + Chatbot Fix — insist on chat widget + instant AI SMS/phone response to new leads.

Drop one short metaphor or story ("This is like…") once per plan.
End with:
"Want this done for you? Book a CRMX demo and we’ll set it up in a couple days.
CRMX has all the tools in one place — including AI bots that act like employees for your business."
`.trim();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    // Parse JSON body
    const body = await (req.json?.() || new Promise(resolve => {
      let data = "";
      req.on("data", chunk => data += chunk);
      req.on("end", () => resolve(JSON.parse(data || "{}")));
    }));

    const {
      firstName = "", lastName = "", email = "", phone = "",
      industry = "", city = "", state = "", zip = "",
      budget = "", timeline = "", channelsUsed = [], primaryGoal = ""
    } = body;

    // Build the USER prompt (inputs -> context)
    const userPrompt = `
Business type: ${industry}
Location: ${city}${state ? ", " + state : ""}${zip ? " " + zip : ""}
Budget: ${budget}
Timeline: ${timeline}
Current channels: ${Array.isArray(channelsUsed) ? channelsUsed.join(", ") : channelsUsed}
Primary lead goal: ${primaryGoal}

Create a LOCAL lead plan limited to ATTENTION & LEAD CAPTURE.
Keep it punchy, specific, and immediately usable THIS WEEK.
`.trim();

    // Call OpenAI
    const aiRes = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5", // or "gpt-4o-mini" if gpt-5 isn't enabled in your API account
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ]
      })
    });

    const aiJson = await aiRes.json();
    const planText = aiJson?.choices?.[0]?.message?.content?.trim() || "No plan generated. Try again.";

    // Push to CRMX webhook (if provided)
    if (process.env.CRMX_WEBHOOK_URL) {
      const payload = {
        first_name: firstName, last_name: lastName, email, phone,
        industry, city, state, zip, budget, timeline,
        channels_used: channelsUsed, primary_goal: primaryGoal,
        plan_text: planText,
        tags: ["LeadPlan-Requested", "LocalLeadFinder"]
      };
      try {
        await fetch(process.env.CRMX_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } catch (e) {
        // Don't block user if webhook fails
      }
    }

    return res.status(200).json({ ok: true, planText });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
}
