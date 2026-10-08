'use client'

import { useState } from 'react'
import { CreditCard, Receipt, Check, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { AppShell } from '@/components/layout/AppShell'
import { BillingToggle } from '@/components/arc/billing-toggle/billing-toggle'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function PaymentsPage() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState('monthly')
  const plans = [
    {
      name: t('product.personalPlan'),
      description: t('product.personalPlanDesc'),
    },
    { name: t('product.studyPlan'), description: t('product.studyPlanDesc') },
    { name: t('product.teamPlan'), description: t('product.teamPlanDesc') },
  ]
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="product-page">
          <div className="product-heading">
            <div>
              <h1>{t('product.payments')}</h1>
              <p>{t('product.paymentsDesc')}</p>
            </div>
            <span className="rounded-full border px-3 py-1 text-sm">
              {t('product.preview')}
            </span>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl" role="note">
            {t('product.paymentsNotice')}
          </p>
          <section className="product-panel" aria-labelledby="current-plan">
            <div className="product-heading">
              <div>
                <h2 id="current-plan" className="text-lg">
                  {t('product.currentPlan')}
                </h2>
                <p className="text-2xl mt-3 text-foreground">
                  {t('product.selfHosted')}
                </p>
              </div>
              <span className="flex items-center gap-2 text-sm">
                <Check className="size-4 text-primary" />
                {t('product.included')}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              {t('product.planDesc')}
            </p>
          </section>
          <section aria-labelledby="billing-plans" className="grid gap-4">
            <div className="product-heading">
              <h2 id="billing-plans" className="text-xl">
                {t('product.plans')}
              </h2>
              <BillingToggle
                value={period}
                onValueChange={setPeriod}
                label={t('product.billingPeriod')}
                options={[
                  { value: 'monthly', label: t('product.monthly') },
                  { value: 'yearly', label: t('product.yearly') },
                ]}
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {plans.map((plan) => (
                <article
                  className="product-panel flex flex-col gap-4"
                  key={plan.name}
                >
                  <h3 className="text-lg font-medium">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                  <p className="mt-4 text-xl">{t('product.pricingPending')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t(`product.${period}`)}
                  </p>
                  <Button
                    variant="outline"
                    disabled
                    className="mt-auto"
                    aria-describedby="billing-unavailable"
                  >
                    {t('product.unavailable')}
                  </Button>
                </article>
              ))}
            </div>
            <p
              id="billing-unavailable"
              className="text-sm text-muted-foreground"
            >
              {t('product.paymentsNotice')}
            </p>
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            <section
              className="product-panel"
              aria-labelledby="payment-methods"
            >
              <h2 id="payment-methods" className="text-lg">
                {t('product.paymentMethods')}
              </h2>
              <EmptyState
                icon={<CreditCard />}
                title={t('product.noPaymentMethods')}
                description={t('product.noPaymentMethodsDesc')}
              />
            </section>
            <section className="product-panel" aria-labelledby="invoices">
              <h2 id="invoices" className="text-lg">
                {t('product.invoices')}
              </h2>
              <EmptyState
                icon={<Receipt />}
                title={t('product.noInvoices')}
                description={t('product.noInvoicesDesc')}
              />
            </section>
          </div>
          <Link href="/profile" className="product-link">
            {t('product.profile')}
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </div>
    </AppShell>
  )
}
