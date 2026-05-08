# Wishlist

Internal backlog of ideas we've discussed but aren't actively building. Not a roadmap — just a parking lot so nothing gets lost. Move items out to `.planning/` when we decide to pick them up.

---

## AI Assistant Chat for Advisors

**The pitch:** Advisors struggle with theory and the "why" behind the numbers. Today they ping Hamza, who pings Claude. An in-app chat would let them self-serve.

**Two tiers:**

### Tier 1 — Generic (theory chat)
- Scope: Roth conversion theory, baseline-vs-strategy methodology, Growth FIA vs GI product types, IRMAA mechanics, 4-phase GI model, early-withdrawal penalty rules, etc.
- Build: Claude API + system prompt loaded with curated methodology docs (`/docs/methodology/*.md`).
- Knowledge base discipline: every feature PR must update the relevant methodology doc — that's the only thing that keeps it from drifting.
- With Claude's 1M context, skip RAG for V1. Just concatenate docs into the system prompt.
- Estimated effort: **3–5 days** for a solid V1.
- Cost: ~$0.01–0.05 per message at Sonnet pricing.

### Tier 2 — Specific (client-aware)
- Builds on Tier 1. Adds tool calls over Supabase: `getClient`, `getProjection`, `explainYear(id, year)`, `whyThisConversionSize`, etc.
- Advisor asks "why is the 2028 conversion $87K?" — the model pulls real numbers via tools, doesn't hallucinate dollar figures.
- Supabase RLS handles auth so advisors only see their own clients.
- Estimated effort: **1–2 weeks on top of Tier 1**.

**Risks to design around:**
1. Hallucination on tax rules — mitigate by citing the methodology doc or actual engine output, not free-recall.
2. Liability ("the AI said I could do X") — persistent disclaimer + "confirm with a tax professional" framing.
3. Knowledge-base drift — this is a process problem. Add "update methodology doc" to the definition-of-done.

**Recommended path:** Ship Tier 1 first, measure usage, then layer Tier 2 on top if advisors actually use it.
