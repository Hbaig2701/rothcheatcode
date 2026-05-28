/**
 * Server-rendered Story Mode PDF export.
 *
 * Mirrors /api/generate-pdf — auth, plan check, branding, Puppeteer render —
 * but feeds a Story-specific Handlebars template instead of the standard
 * dashboard one. Renders the same StoryEntry[] the on-screen Story Mode uses
 * (generateStory in lib/calculations/story-generator), so the PDF and the
 * screen view always tell the same story.
 *
 * Output: PDF binary returned as application/pdf attachment.
 */

import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import Handlebars from "handlebars";
import fs from "fs";
import path from "path";
import { createClient } from "@/lib/supabase/server";
import { getVisibleUserIds } from "@/lib/auth/visibleUserIds";
import { checkUsageLimit, incrementUsage, getEffectivePlan } from "@/lib/usage";
import { hasFeature } from "@/lib/config/plans";
import { generateStory } from "@/lib/calculations/story-generator";

interface BrandingData {
  companyName: string;
  tagline: string;
  logoUrl: string;
  logoLightUrl: string;
  phone: string;
  email: string;
  website: string;
  primaryColor: string;
  secondaryColor: string;
}

// Branded header/footer helpers — same shapes as /api/generate-pdf so the
// templates can share the {{{brandingHeader}}} / {{{brandingFooter}}} calls.
Handlebars.registerHelper("brandingHeader", function (this: { branding?: BrandingData }, title: string) {
  const branding = this.branding;
  let leftHtml = "";
  if (branding?.logoUrl) {
    leftHtml = `<img class="header-logo" src="${Handlebars.Utils.escapeExpression(branding.logoUrl)}" alt="" />`;
  } else if (branding?.companyName) {
    leftHtml = `<span class="header-company">${Handlebars.Utils.escapeExpression(branding.companyName)}</span>`;
  }
  return new Handlebars.SafeString(
    `<div class="page-branding-header">${leftHtml}<span class="header-title">${Handlebars.Utils.escapeExpression(title)}</span></div>`
  );
});

Handlebars.registerHelper("brandingFooter", function (this: { branding?: BrandingData }) {
  const branding = this.branding;
  if (!branding) return "";
  const parts: string[] = [];
  if (branding.companyName) parts.push(Handlebars.Utils.escapeExpression(branding.companyName));
  if (branding.phone) parts.push(Handlebars.Utils.escapeExpression(branding.phone));
  if (branding.email) parts.push(Handlebars.Utils.escapeExpression(branding.email));
  if (branding.website) parts.push(Handlebars.Utils.escapeExpression(branding.website));
  return new Handlebars.SafeString(
    `<div class="page-branding-footer">${parts.join(" &middot; ")}</div>`
  );
});

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // PDF exports share the same usage bucket as the standard report PDF.
    const usageCheck = await checkUsageLimit(user.id, "pdf_exports");
    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: "PDF export limit reached",
          message: `You've used ${usageCheck.current}/${usageCheck.limit} PDF exports this month. Upgrade to Pro for unlimited exports.`,
          current: usageCheck.current,
          limit: usageCheck.limit,
          showUpgrade: true,
        },
        { status: 403 }
      );
    }

    const { plan: effectivePlan } = await getEffectivePlan(user.id);
    const _showPoweredBy = !hasFeature(effectivePlan, "whiteLabel");
    // showPoweredBy is reserved for a future "powered by Retirement Expert"
    // footer flag — kept here so the route's plan-check stays consistent with
    // /api/generate-pdf. Reference once to satisfy the linter.
    void _showPoweredBy;

    const body = await request.json();
    const { reportData, brandingOverrides } = body;
    if (!reportData || !reportData.client || !reportData.projection) {
      return NextResponse.json(
        { error: "Missing required report data" },
        { status: 400 }
      );
    }

    // Defense-in-depth: ensure the authenticated user owns the client.
    if (reportData.client?.id) {
      const visibleUserIdsForReport = await getVisibleUserIds(supabase, user.id);
      const { data: authorizedClient } = await supabase
        .from("clients")
        .select("user_id")
        .eq("id", reportData.client.id)
        .in("user_id", visibleUserIdsForReport)
        .maybeSingle();
      if (!authorizedClient) {
        return NextResponse.json(
          { error: "Forbidden — client not in your scope" },
          { status: 403 }
        );
      }
    }

    // Load branding (mirrors generate-pdf).
    const { data: settings } = await supabase
      .from("user_settings")
      .select("company_name, tagline, company_phone, company_email, company_website, logo_url, logo_light_url, primary_color, secondary_color")
      .eq("user_id", user.id)
      .single();

    const branding: BrandingData = {
      companyName: settings?.company_name || "",
      tagline: settings?.tagline || "",
      logoUrl: settings?.logo_url || "",
      logoLightUrl: settings?.logo_light_url || settings?.logo_url || "",
      phone: settings?.company_phone || "",
      email: settings?.company_email || "",
      website: settings?.company_website || "",
      primaryColor: settings?.primary_color || "#D4AF37",
      secondaryColor: settings?.secondary_color || "#1a1a1a",
    };

    // Apply branding overrides (Pro / white-label).
    if (brandingOverrides && hasFeature(effectivePlan, "whiteLabel")) {
      Object.assign(branding, brandingOverrides);
    }

    // Build story entries with the same generator the screen uses.
    const storyEntries = generateStory(reportData.client, reportData.projection);

    // Annotate entries with template-friendly card classes (the on-screen
    // version computes these from sentiment + trigger; mirror it here).
    const annotatedEntries = storyEntries.map((e) => {
      const isCelebration = ["break_even", "roth_exceeds_original", "fully_converted", "conversion_end"].includes(e.trigger);
      const isLegacy = e.trigger === "death_legacy";
      const classes: string[] = [];
      if (e.sentiment === "positive") classes.push("sentiment-positive");
      if (e.sentiment === "caution") classes.push("sentiment-caution");
      if (isCelebration) classes.push("celebration");
      if (isLegacy) classes.push("legacy");
      const annotatedMetrics = (e.metrics ?? []).map((m) => ({
        ...m,
        chipClass: m.label.toLowerCase().includes("extra") || m.label.toLowerCase().includes("strategy")
          ? "highlight"
          : "",
      }));
      return {
        ...e,
        cardClasses: classes.join(" "),
        metrics: annotatedMetrics,
      };
    });

    const templateData = {
      client: reportData.client,
      startAge: reportData.client.age ?? 62,
      endAge: reportData.client.end_age ?? 100,
      branding,
      storyEntries: annotatedEntries,
      generatedDate: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    };

    const templatePath = path.join(process.cwd(), "templates", "story-pdf-template.html");
    const templateHtml = fs.readFileSync(templatePath, "utf8");
    const template = Handlebars.compile(templateHtml);
    const html = template(templateData);

    // Render via Puppeteer.
    const executablePath = await chromium.executablePath();
    let browser;
    try {
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: chromium.headless,
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({
        format: "Letter",
        printBackground: true,
        margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
      });

      await browser.close();
      browser = null;

      // Track usage on success.
      await incrementUsage(user.id, "pdf_exports").catch(() => undefined);

      const clientName = reportData.client.name || "Client";
      const sanitizedName = clientName.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "_");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
      const fileName = `RetirementExpert_Story_${sanitizedName}_${timestamp}.pdf`;

      return new NextResponse(pdf as unknown as ArrayBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          // Already closed or failed to close — nothing we can do.
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[generate-story-pdf] error:", msg);
    return NextResponse.json(
      { error: "Failed to generate Story PDF", details: msg },
      { status: 500 }
    );
  }
}
