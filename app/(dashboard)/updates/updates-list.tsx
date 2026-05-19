'use client'

import { useState } from 'react'
import { Star, Video, Sun, PenTool, FileText, Users, Copy, DollarSign, FileCheck, Printer, Shield, Table2, ArrowUpDown, MoveHorizontal, UserCog, Columns, Tags, HandCoins, Heart, Sparkles, GitCompare, SlidersHorizontal, MessageCircle, GraduationCap, Scale, BookOpen, Calculator, Wrench } from 'lucide-react'

const updates = [
  {
    id: '30',
    date: 'May 19, 2026',
    title: 'AI Chat Assistant (Beta)',
    description: "A new floating chat in the bottom-right of every page. Ask anything about your clients, the math, the theory, the assumptions, or how to use a feature. The assistant knows the platform end-to-end and can pull up real numbers from any client's projection (lifetime wealth advantage, year-by-year bracket, conversion sizing, heir tax impact) so the answers are grounded in your data, not generic AI guesses.\n\nWhat it does well today:\n\n* Explains why a number is what it is (\"why is Tax on RMDs lower than Total Tax?\", \"why didn't conversions trigger this year?\")\n* Pulls up specific years on demand and walks you through them\n* Compares clients side by side\n* Catches actual bugs and offers to file a support ticket with the right context attached\n* Knows the real IRS brackets, RMD divisors, IRMAA tiers, and engine defaults we use\n\nUpload a screenshot if you want it to look at something specific. Past conversations are saved so you can come back to them. It's marked Beta because we're still polishing; if it gets a number wrong or sounds off, let us know.",
    category: 'New Feature',
    icon: MessageCircle,
  },
  {
    id: '29',
    date: 'May 18, 2026',
    title: 'Favourite Column Layouts in Settings',
    description: "Tired of re-picking the same columns on every new client? Settings now has a \"My Columns\" tab where you set your favourite year-by-year layout once. Every new client opens with that layout by default.\n\nSeparate favourites for Growth FIA and Guaranteed Income reports (since the useful columns differ). Per-client edits still win once you make them, so you can fine-tune a single client without losing the default for everyone else.",
    category: 'New Feature',
    icon: Columns,
  },
  {
    id: '28',
    date: 'May 15, 2026',
    title: 'Parallel Tax Breakdowns in the Lifetime Tax Card',
    description: "The Lifetime Tax Cost tooltip now shows matching buckets on both sides:\n\n* Baseline: Tax on RMDs (marginal) + Other baseline income tax + IRMAA + Heir\n* Strategy: Conversion tax + Tax on remaining RMDs + AUM drag + Other + Penalty + IRMAA + Heir\n\nBefore, baseline collapsed to a single \"Income tax on RMDs (lifetime)\" line that was actually total fed+state lumped together, which made the comparison feel apples-to-oranges. Now the buckets line up so you can see exactly where each side spends its tax dollars.\n\nThe \"Tax on RMDs\" number you see here is the marginal tax caused by the RMDs themselves (not the year's full tax bill). Same figure now appears in the PDF Distributions summary, locked in with a fixture test so it can't silently drift on future calculation changes.",
    category: 'Enhancement',
    icon: Scale,
  },
  {
    id: '27',
    date: 'May 14, 2026',
    title: 'PDF Glossary & Assumptions Page (Optional)',
    description: "When exporting a PDF, you can now toggle on a Glossary page that defines every term the report uses (Lifetime Wealth, Tax on RMDs, Forced Distributions, Conversion Cost & Payback, etc.) plus the key engine assumptions (rate of return, heir tax rate, end age, RMD divisors).\n\nGreat for clients who want to understand what they're looking at without having to interrupt the meeting to ask. Toggle it in the same Export Report dialog where you pick which tables to include.",
    category: 'New Feature',
    icon: BookOpen,
  },
  {
    id: '26',
    date: 'May 13, 2026',
    title: 'Roth Theory Training Curriculum',
    description: "The Training Centre now has a full 8-module curriculum on the theory behind Roth conversions, separate from the platform walkthrough videos. Each module pairs a short narrative with an interactive playground so you can move sliders and see the math respond in real time.\n\nModules cover: marginal vs effective tax, bracket-fill conversions, gross-up math (pay tax from inside vs outside the IRA), RMDs and the age-73 cliff, the IRMAA cliff, the widow's penalty, annuity bonuses and conversions, and a capstone on reading a report end-to-end.\n\nFind it under Training in the sidebar. Progress badges track which modules you've completed.",
    category: 'New Feature',
    icon: GraduationCap,
  },
  {
    id: '25',
    date: 'May 18, 2026',
    title: 'Custom Product Saves Now Stick',
    description: "Fixed a bug where custom products built on top of an engine preset would have their bonus, carrier name, and surrender values silently overwritten with the preset's defaults on certain page renders. If you'd set your Allianz custom product to a 15% bonus but kept seeing it revert to 14%, this is why.\n\nNow when a custom product is loaded, every field you defined is sticky. The Bonus field is also no longer locked on custom products (the lock icon was meant for built-in presets, not your own).",
    category: 'Bug Fix',
    icon: Wrench,
  },
  {
    id: '24',
    date: 'May 12, 2026',
    title: 'New \"Total Fed Tax on IRA W/D\" Column',
    description: "Added a new year-by-year column that sums federal tax on conversions AND on RMDs in a single number. Useful when you want to see what the IRA's tax cost was for the year regardless of whether the dollars came out as a conversion or a forced RMD.\n\nPair it with the existing \"Fed Tax (Conversions)\" column to isolate the conversion-only piece. The new column is auto-added to existing column preferences so you don't have to re-pick.",
    category: 'Enhancement',
    icon: Calculator,
  },
  {
    id: '23',
    date: 'May 5, 2026',
    title: 'Voluntary IRA / Roth Withdrawals',
    description: 'Schedule voluntary withdrawals from the IRA or Roth at specific ages — on top of RMDs and conversions. Each row picks a year, amount, and source: Traditional IRA, Roth, or Auto. The "Auto" source pulls from Roth first and falls back to IRA, which gives the natural baseline-vs-strategy comparison: the baseline drains the IRA, the strategy uses the Roth bucket the conversions built up.\n\nIRA pulls add to taxable income (federal/state/IRMAA/SS torpedo), Roth pulls are tax-free, and pulls before age 59½ trigger the 10% early-withdrawal penalty automatically.\n\nFind it in the new "IRA / Roth Withdrawals" section of the client form.',
    category: 'New Feature',
    icon: HandCoins,
  },
  {
    id: '22',
    date: 'May 4, 2026',
    title: "Widow's Penalty Analysis",
    description: "When you check \"Show Widow's Penalty\" on an MFJ client, the report now surfaces a dedicated section below the year-by-year table. It re-prices every projected year side-by-side as Married Filing Jointly vs. Single, showing the bracket compression, the lost SS check, and the incremental tax burden the surviving spouse would face year by year.\n\nA new \"First-Death Age\" input (default: older spouse + 85) lets you anchor the analysis to a specific year — so you can illustrate \"if it happens in 5 years\" or \"if your husband lives to 90\" without changing the rest of the projection.\n\nWorks for Growth FIA and Guaranteed Income clients — the analysis consumes the same projection your dashboard is already showing, so the joint baseline matches what's on the report.",
    category: 'New Feature',
    icon: Heart,
  },
  {
    id: '21',
    date: 'May 3, 2026',
    title: 'AI Product Builder',
    description: "Build custom carrier products in seconds and use them on illustrations alongside the built-in presets. Three creation paths in Settings → My Products:\n\n• Upload a brochure or spec sheet (most accurate — AI reads the carrier PDF)\n• Search by product name (quick web research)\n• Manual builder for when you already know the specs\n\nThe AI extracts every parameter — bonus type and percentage, vesting schedule, surrender charges, rider fees, roll-up rates, payout factors, state variations — and flags anything it had to assume so you can verify before using on a client.\n\nCustom products show up in your scenario picker grouped under \"Yours\" alongside system presets. The engine honors all of it: rider fee, GI roll-up rate, payout factors, bonus targeting, and per-state bonus/surrender overrides all flow through to the projection.",
    category: 'New Feature',
    icon: Sparkles,
  },
  {
    id: '20',
    date: 'April 27, 2026',
    title: 'Year-by-Year Comparison View',
    description: "The year-by-year table on Growth FIA reports now has a third tab: Comparison. Each money column you've selected expands into three side-by-side sub-columns — Baseline / Strategy / Δ — so you can see exactly where the strategy diverges year by year.\n\nUses the same column selector as the Strategy and Baseline tabs, so your column choice carries across all three views.",
    category: 'New Feature',
    icon: GitCompare,
  },
  {
    id: '19',
    date: 'April 25, 2026',
    title: 'New Conversion Options & Product Updates',
    description: "Several improvements to how conversions are sized and which products are available:\n\n• \"0%\" tax bracket on the conversion ceiling — fills just up to the standard deduction so federal tax stays at $0 (useful for low-income clients with disability income or pre-SS years).\n\n• \"Partial Conversion\" type — convert exactly N dollars total across the projection, leaving the rest in the IRA. Engine optimizes year-by-year fills until the cumulative cap is hit.\n\n• \"Carrier Penalty-Free Cap\" toggle — when on, each year's conversion is capped at the contract's penalty-free withdrawal allowance during the surrender period. Models Allianz / American Equity-style contracts where exceeding the limit triggers surrender charges.\n\n• Phased Bonus Growth preset bonus updated 8% → 11% to match EquiTrust's current contract (8% base + 3% promo). Anniversary 4% × 3 years still applies.\n\n• New \"Generic Income Product\" preset — fully customizable Guaranteed Income illustration when no specific carrier preset fits.",
    category: 'Enhancement',
    icon: SlidersHorizontal,
  },
  {
    id: '18',
    date: 'April 22, 2026',
    title: 'Breakeven Reframed as Tax Payback',
    description: "The Breakeven chart now models \"tax payback\" instead of legacy-to-heirs crossover — the year the conversion's upfront tax hit is recovered through future tax savings + heir benefit + product bonus. The old framing produced \"never breaks even\" results for many advisors; the new one matches how most planners actually pitch the strategy.\n\nThe chart, summary stat, and tooltip text all use the same number now, so what's on the dashboard matches what's in the conversation.",
    category: 'Enhancement',
    icon: Star,
  },
  {
    id: '17',
    date: 'April 18, 2026',
    title: 'Customizable Columns for Guaranteed Income Products',
    description: 'Your Guaranteed Income reports now use the same adjustable year-by-year table as Growth FIA. Hit "Adjust Columns" to pick from 40+ data points, including seven GI-specific columns: Phase (Convert/Purchase/Grow/Income), GI Income (Net), Cumulative GI Income, Roll-Up Growth, Payout Rate, Conversion Tax, and Product Bonus.\n\nThe old fixed Summary/Strategy/Baseline layout is now a simpler Strategy/Baseline toggle — show whatever columns your client conversation actually needs.',
    category: 'New Feature',
    icon: Table2,
  },
  {
    id: '16',
    date: 'April 18, 2026',
    title: 'Reorderable Columns with Drag & Drop',
    description: 'The column selector now has a dedicated "Selected Columns" section at the top. Grab any column by its handle and drag it up or down to reorder how they appear in your table. Unchecking a selected column sends it back to the "Available Columns" pool below; checking one adds it to the end of your selection.\n\nYour custom order is saved per client, so each scenario keeps its own layout.',
    category: 'Enhancement',
    icon: ArrowUpDown,
  },
  {
    id: '15',
    date: 'April 17, 2026',
    title: 'Expanded Column Limit & Excel-Style Horizontal Scroll',
    description: 'Raised the maximum from 10 to 20 visible columns. When your selection exceeds the screen width, the table now scrolls horizontally like a spreadsheet — Year and Age stay pinned on the left while the rest of the columns slide under your cursor.\n\nNumeric columns are also now right-aligned with monospaced digits for easier scanning.',
    category: 'Enhancement',
    icon: MoveHorizontal,
  },
  {
    id: '14',
    date: 'April 17, 2026',
    title: 'Per-Client Column Preferences',
    description: 'Column selections and widths are now saved per client instead of globally. Customize one client\'s view for a tax deep dive and another\'s for an IRMAA focus — switching between them preserves each setup automatically.',
    category: 'Enhancement',
    icon: UserCog,
  },
  {
    id: '13',
    date: 'April 16, 2026',
    title: 'Per-Income-Type Projection Columns',
    description: 'Building on structured income categories, you can now add dedicated columns to your year-by-year table for each income type — Pension, Rental Income, Dividends & Interest, Capital Gains, Wages, Annuity, and Other. Break down exactly where each year\'s income is coming from at a glance.',
    category: 'New Feature',
    icon: Columns,
  },
  {
    id: '12',
    date: 'April 16, 2026',
    title: 'Structured Income Categories',
    description: 'Non-SSI income entries now carry a type: Pension, Rental, Dividends & Interest, Capital Gains, Wages / Part-Time, Annuity, or Other. Categorize each entry individually so the data flows through to both the client questionnaire and the year-by-year projection with proper categorization.',
    category: 'Enhancement',
    icon: Tags,
  },
  {
    id: '11',
    date: 'April 9, 2026',
    title: 'Penalty-Free Withdrawal Warnings',
    description: 'The report now flags years where Roth conversions exceed the annuity\'s penalty-free withdrawal allowance during the surrender period. A collapsible warning section shows each affected year, the excess amount, the applicable surrender charge percentage, and the estimated charge.\n\nThis helps you quickly spot potential surrender penalties and adjust conversion amounts accordingly.',
    category: 'Enhancement',
    icon: Shield,
  },
  {
    id: '10',
    date: 'April 9, 2026',
    title: 'Story Mode Print & PDF Export',
    description: 'You can now print or save the Story Mode narrative report as a PDF directly from your browser. Click the print icon at the top of the story view to generate a clean, client-ready document that walks through the retirement strategy in plain English.\n\nPerfect for handing off to clients who prefer a written summary over tables and charts.',
    category: 'New Feature',
    icon: Printer,
  },
  {
    id: '9',
    date: 'April 8, 2026',
    title: 'Customizable PDF Report Sections',
    description: 'When exporting a PDF report, you now get a checklist to pick exactly which tables to include. Choose from 6 sections: Baseline Income Projection, Strategy Income Projection, Tax-Free Roth Growth, Conversion Cost & Payback, Legacy Comparison, and RMD Avoidance.\n\nThis lets you tailor each report to the conversation you\'re having with a specific client, rather than overwhelming them with every table.',
    category: 'New Feature',
    icon: FileCheck,
  },
  {
    id: '8',
    date: 'April 7, 2026',
    title: 'Recurring Income Fill',
    description: 'Tired of adding non-SSI income entries one year at a time? The new "Recurring" button lets you bulk-fill income from now until a target age with a single click. Set the annual gross taxable and tax-exempt amounts, pick an end age, and hit Fill.\n\nExisting entries outside the range are preserved, so you can layer recurring income on top of one-off entries.',
    category: 'Enhancement',
    icon: DollarSign,
  },
  {
    id: '7',
    date: 'April 5, 2026',
    title: 'Multi-Scenario Support & Client Duplication',
    description: 'You can now duplicate any client to quickly model different strategies side by side. Change the conversion type, tax rate ceiling, or product preset on the copy and compare the projections without losing your original scenario.\n\nGreat for showing clients the impact of aggressive vs. conservative Roth conversion approaches.',
    category: 'New Feature',
    icon: Copy,
  },
  {
    id: '6',
    date: 'April 3, 2026',
    title: 'Client Intake Questionnaire',
    description: 'Generate a shareable link that your clients can use to submit their financial details directly into the platform. The intake form collects everything needed to build a projection — account balances, filing status, Social Security, and more.\n\nOnce submitted, a new client record is automatically created and ready for you to review and run scenarios on. No more back-and-forth data collection over email.',
    category: 'New Feature',
    icon: Users,
  },
  {
    id: '5',
    date: 'March 31, 2026',
    title: 'Light Mode Support',
    description: 'We have officially rolled out a pristine Light Mode for the entire platform! Designed for enhanced readability in brightly lit environments, you can easily toggle between a dark and light theme to suit your workflow.\n\nYou can access this right now by going to Settings -> Appearance and toggling your theme.',
    category: 'Feature',
    icon: Sun,
  },
  {
    id: '4',
    date: 'March 31, 2026',
    title: 'Platform Updates Channel Launched',
    description: 'Welcome to the new Updates channel! This is your central hub for discovering the latest features, enhancements, and performance improvements we bring to the platform.\n\nUpdates are timestamped and organized so you always know what\'s new and why it matters for your advisory workflow.',
    category: 'Announcement',
    icon: Star,
  },
  {
    id: '3',
    date: 'March 29, 2026',
    title: 'Training Centre with Video Guides',
    description: 'We have launched a brand new Training Centre to help you hit the ground running! Dive right into guided video walkthroughs to learn step-by-step how to enter client details, model financial scenarios, and customize beautiful PDF reports for your clients.\n\nThese concise tutorials are located in the "Training" tab on the left sidebar to ensure you get the most out of Retirement Expert.',
    category: 'New Feature',
    icon: Video,
  },
  {
    id: '2',
    date: 'March 20, 2026',
    title: 'Chart and Report Annotations',
    description: 'You can now add custom annotations directly to projection charts and graphs! This lets you highlight key milestones, clarify tax implications, or emphasize critical insights for your clients, making the discussion on retirement strategies more interactive and personalized.',
    category: 'Feature',
    icon: PenTool,
  },
  {
    id: '1',
    date: 'March 15, 2026',
    title: 'White-Label PDF Reporting',
    description: 'Elevate your brand with comprehensive White-Label PDF Reporting. You can now customize your generated PDF reports with your own firm\'s logo and custom elements. Deliver a premium, seamless experience to your clients with reports that look completely tailored to your business.',
    category: 'New Feature',
    icon: FileText,
  }
]

export function UpdatesList() {
  const [visibleCount, setVisibleCount] = useState(4)

  const showMore = () => {
    setVisibleCount(prev => prev + 4)
  }

  return (
    <div className="space-y-6">
      {updates.slice(0, visibleCount).map((update) => (
        <div
          key={update.id}
          className="flex flex-col md:flex-row gap-6 p-6 rounded-[14px] bg-bg-card border border-border-default transition-all hover:border-gold-border"
        >
          {/* Left col: Date & Category */}
          <div className="md:w-56 shrink-0 flex flex-col gap-3">
            <span className="text-sm font-medium text-text-dimmer pt-1">{update.date}</span>
            <div className="inline-flex max-w-fit items-center rounded-md border border-border-default px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 bg-accent/50 text-foreground shadow-sm">
              <update.icon className="w-3.5 h-3.5 mr-1.5 text-gold" />
              {update.category}
            </div>
          </div>

          {/* Right col: Content */}
          <div className="flex-1">
            <h2 className="text-[20px] font-display font-semibold text-foreground mb-2.5">{update.title}</h2>
            <p className="text-[15px] text-text-dim leading-relaxed whitespace-pre-wrap">
              {update.description}
            </p>
          </div>
        </div>
      ))}

      {updates.length === 0 && (
        <div className="py-12 text-center border-2 border-dashed border-border-default rounded-[14px]">
          <p className="text-text-dimmer">No updates published yet.</p>
        </div>
      )}

      {visibleCount < updates.length && (
        <div className="pt-4 flex justify-center">
          <button
            onClick={showMore}
            className="inline-flex items-center justify-center rounded-[10px] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-border-default bg-bg-card shadow-sm hover:bg-accent hover:text-accent-foreground h-11 px-8 hover:border-gold-border"
          >
            Show Older
          </button>
        </div>
      )}
    </div>
  )
}
