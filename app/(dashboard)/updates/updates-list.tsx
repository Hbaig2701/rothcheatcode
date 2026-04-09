'use client'

import { useState } from 'react'
import { Star, Video, Sun, PenTool, FileText, Users, Copy, DollarSign, FileCheck, Printer, Shield } from 'lucide-react'

const updates = [
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
