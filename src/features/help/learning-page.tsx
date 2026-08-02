import { Link } from 'react-router-dom'
import {
  Rocket,
  HelpCircle,
  Compass,
  Lightbulb,
  ScrollText,
  BookA,
  Calculator,
  ArrowRight,
  ShoppingCart,
  Package,
  Wallet,
  ShoppingBag,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface GuideLink {
  label: string
  to: string
  icon: typeof Rocket
  description: string
}

// Getting-started steps point at the real screens, so the shell is useful
// before any long-form content exists.
const GETTING_STARTED: GuideLink[] = [
  {
    label: 'Add your products',
    to: '/products/new',
    icon: Package,
    description: 'Set what you sell, the unit you sell it in, and the pack size you buy it in.',
  },
  {
    label: 'Make your first sale',
    to: '/pos',
    icon: ShoppingCart,
    description: 'Ring up a sale in the point of sale — stock and cash update together.',
  },
  {
    label: 'Order and receive stock',
    to: '/purchase-orders/new',
    icon: ShoppingBag,
    description: 'Raise a purchase order, then receive it — cost converts to your selling unit.',
  },
  {
    label: 'Open a cash drawer shift',
    to: '/shifts/open',
    icon: Wallet,
    description: 'Start a shift with a float, then close it with a blind count at the end of the day.',
  },
]

const FAQS: { question: string; answer: string }[] = [
  {
    question: 'Why is my profit healthy but my cash low?',
    answer:
      'Profit and cash are different things. Profit is what you earned on the goods you sold; cash is what you can spend right now. Money tied up in new stock, or owed to suppliers, reduces cash without reducing profit. The Finance overview shows both side by side.',
  },
  {
    question: 'I bought a carton for 12,000. Why does each pack show a much smaller cost?',
    answer:
      'Because cost is always stored per selling unit. A carton of 12 packs at 12,000 is 1,000 per pack, and 1,000 is what the app uses when it works out your profit on a pack. You enter the carton price; the app does the division.',
  },
  {
    question: 'What is a blind close, and why can I not see the expected amount first?',
    answer:
      'A blind close asks you to count the drawer and enter what you actually found before the app reveals what it expected. Seeing the target first would make the check meaningless. After you submit, the app shows counted, expected, and the difference.',
  },
  {
    question: 'Does creating a purchase order change my stock?',
    answer:
      'No. A purchase order records what you intend to buy. Stock only increases when you receive the goods, and only the usable quantity enters inventory — damaged items are recorded separately.',
  },
  {
    question: 'Can I edit or delete a sale or a stock movement?',
    answer:
      'No, and this is deliberate. History is kept intact so every number can be explained. To reverse a sale you void it, and to correct stock you record an adjustment — both leave a visible trail.',
  },
  {
    question: 'Why do some numbers stay hidden from cashiers?',
    answer:
      'Cost, profit, and the business-wide financial position are limited to owners and managers. Cashiers can sell, receive stock, record expenses, and run shifts without seeing your margins.',
  },
]

const WALKTHROUGHS: GuideLink[] = [
  {
    label: 'Selling and voiding',
    to: '/sales',
    icon: ShoppingCart,
    description: 'How a sale records revenue, cost, and cash — and what voiding one does.',
  },
  {
    label: 'Stock and valuation',
    to: '/reports/inventory',
    icon: Package,
    description: 'Where average cost comes from and how stock value is worked out.',
  },
  {
    label: 'Purchasing and receiving',
    to: '/purchase-history',
    icon: ShoppingBag,
    description: 'Ordering, partial deliveries, damaged goods, and supplier price history.',
  },
  {
    label: 'Cash control',
    to: '/finance',
    icon: Wallet,
    description: 'Shifts, safe drops, petty cash, expenses, and the cashbook.',
  },
]

const TIPS: string[] = [
  'Open a shift before you start selling — cash sales attach to it automatically, which makes the end-of-day count meaningful.',
  'Set a low-stock threshold on the things you sell most. The Restock screen then groups what to reorder by supplier.',
  'Record expenses as they happen rather than in a weekly batch. Your profit figure stays honest that way.',
  'Link each product to the suppliers you buy it from, with their pack size. Receiving then gets the per-unit cost right without you doing the maths.',
  'Use a safe drop when the till gets full. The money stays yours — it has only moved — so your profit does not change.',
  'Check the Insights strip on the dashboard. It flags margin slips and stock running short before they become problems.',
]

export function LearningCenterPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Learning Center"
        description="How to run the business, not just the software. Short answers, practical guides."
      />

      {/* Quick links to the other help modules */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          to="/help/dictionary"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-border-strong"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
            <BookA className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-text-primary">Business Dictionary</p>
            <p className="text-xs text-text-muted">Plain-language meanings for every term.</p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-text-muted" />
        </Link>
        <Link
          to="/help/calculator"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-border-strong"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-secondary/10 text-accent-secondary">
            <Calculator className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-text-primary">Business Calculator</p>
            <p className="text-xs text-text-muted">Margin, markup, discount, packs, profit.</p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-text-muted" />
        </Link>
      </div>

      <Section icon={Rocket} title="Getting started" iconClass="text-success bg-success/10">
        <ol className="space-y-2">
          {GETTING_STARTED.map((step, index) => (
            <li key={step.to}>
              <Link
                to={step.to}
                className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-surface-muted"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-primary/10 text-xs font-bold text-accent-primary">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">{step.label}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">{step.description}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 self-center text-text-muted" />
              </Link>
            </li>
          ))}
        </ol>
      </Section>

      <Section icon={HelpCircle} title="Frequently asked" iconClass="text-info bg-info/10">
        <div className="divide-y divide-border">
          {FAQS.map((faq) => (
            <details key={faq.question} className="group py-3 first:pt-0 last:pb-0">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text-primary marker:content-none">
                <ArrowRight className="size-3.5 shrink-0 text-text-muted transition-transform group-open:rotate-90" />
                {faq.question}
              </summary>
              <p className="mt-2 pl-5 text-sm leading-relaxed text-text-secondary">{faq.answer}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section icon={Compass} title="Feature walkthroughs" iconClass="text-accent-primary bg-accent-primary/10">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {WALKTHROUGHS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-surface-muted"
            >
              <item.icon className="mt-0.5 size-4 shrink-0 text-text-muted" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{item.label}</p>
                <p className="mt-0.5 text-xs text-text-secondary">{item.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section icon={Lightbulb} title="Tips &amp; best practice" iconClass="text-warning bg-warning/10">
        <ul className="space-y-2">
          {TIPS.map((tip) => (
            <li key={tip} className="flex items-start gap-2.5 text-sm text-text-secondary">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warning" />
              {tip}
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={ScrollText} title="What's new" iconClass="text-accent-tertiary bg-accent-tertiary/10">
        <ul className="space-y-3">
          <ReleaseNote
            title="Help &amp; Learning"
            items={[
              'Business dictionary with inline ⓘ definitions you can switch off',
              'Business calculator — margin, markup, discount, pack conversion, profit',
              'Coaching insights on the dashboard',
            ]}
          />
          <ReleaseNote
            title="Financial management"
            items={[
              'Cash drawer shifts with blind end-of-day counts',
              'Expenses with categories, and a unified cashbook',
              'Split payments at the point of sale',
            ]}
          />
          <ReleaseNote
            title="Purchasing"
            items={[
              'Suppliers with per-supplier pack sizes',
              'Purchase orders, receiving with damage tracking, and price history',
              'Restock suggestions grouped by supplier',
            ]}
          />
        </ul>
      </Section>
    </div>
  )
}

function Section({
  icon: Icon,
  title,
  iconClass,
  children,
}: {
  icon: typeof Rocket
  title: string
  iconClass: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 text-base">
          <span className={cn('flex size-8 items-center justify-center rounded-lg', iconClass)}>
            <Icon className="size-4" />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function ReleaseNote({ title, items }: { title: string; items: string[] }) {
  return (
    <li className="rounded-lg border border-border p-3">
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-xs text-text-secondary">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-text-muted" />
            {item}
          </li>
        ))}
      </ul>
    </li>
  )
}
