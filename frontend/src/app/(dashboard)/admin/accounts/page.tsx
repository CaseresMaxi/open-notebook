'use client'
import { useState } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  useManagedAccounts,
  useAccountPolicy,
  type ManagedAccount,
  type AccountPolicy,
} from '@/lib/hooks/use-account-usage'
import { useModels } from '@/lib/hooks/use-models'
import { Input } from '@/components/arc/input/input'
import { Drawer, DrawerContent } from '@/components/arc/drawer/drawer'
import { Button } from '@/components/ui/button'
import { StudyDataTable } from '@/components/ui/study-data-table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
export default function AccountsPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const accounts = useManagedAccounts(!!user?.admin)
  const models = useModels()
  const save = useAccountPolicy()
  const [selected, setSelected] = useState<ManagedAccount | null>(null)
  const [draft, setDraft] = useState<AccountPolicy | null>(null)
  if (!user?.admin)
    return (
      <div className="product-page">
        <h1>{t('commercial.adminRequired')}</h1>
      </div>
    )
  return (
    <div className="product-page">
      <div className="product-heading">
        <h1>{t('commercial.accounts')}</h1>
      </div>
      {accounts.isPending ? (
        <LoadingSpinner />
      ) : accounts.isError ? (
        <div role="alert">
          <p>{t('commercial.loadError')}</p>
          <Button onClick={() => accounts.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <StudyDataTable
          caption={t('commercial.accounts')}
          emptyMessage={t('commercial.noAccounts')}
          rows={accounts.data || []}
          rowKey="uid"
          columns={[
            {
              key: 'email',
              label: t('product.email'),
              sortable: true,
              render: (_, row) => (
                <Button
                  variant="ghost"
                  className="max-w-full whitespace-normal break-words"
                  onClick={() => {
                    setSelected(row)
                    setDraft({ ...row.policy })
                    save.reset()
                  }}
                >
                  {row.email}
                </Button>
              ),
            },
            {
              key: 'usage',
              label: t('commercial.tokens'),
              render: (_, row) => (
                <span className="tabular-nums">
                  {row.usage.used.tokens.toLocaleString()} /{' '}
                  {row.policy.monthly_tokens.toLocaleString()}
                </span>
              ),
            },
            {
              key: 'policy',
              label: t('commercial.status'),
              render: (_, row) =>
                t(
                  row.policy.disabled
                    ? 'commercial.paused'
                    : 'commercial.active'
                ),
            },
          ]}
        />
      )}
      <Drawer
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <DrawerContent
          title={t('commercial.accounts')}
          closeLabel={t('common.close')}
        >
          {selected && draft && (
            <form
              className="space-y-6"
              onSubmit={async (event) => {
                event.preventDefault()
                await save
                  .mutateAsync({ uid: selected.uid, policy: draft })
                  .catch(() => {})
              }}
            >
              <p className="break-all text-muted-foreground">
                {selected.email}
              </p>
              <label className="block space-y-2">
                <span>{t('commercial.studyModel')}</span>
                <Select
                  value={draft.model_id || 'default'}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      model_id: value === 'default' ? null : value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">
                      {t('commercial.operatorDefault')}
                    </SelectItem>
                    {models.data
                      ?.filter((m) => m.type === 'language')
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </label>
              {(
                [
                  ['monthly_tokens', t('commercial.monthly_tokens')],
                  ['monthly_calls', t('commercial.monthly_calls')],
                  ['monthly_images', t('commercial.monthly_images')],
                  ['concurrent_calls', t('commercial.concurrent_calls')],
                  ['storage_bytes', t('commercial.storage_bytes')],
                ] as const
              ).map(([key, label]) => (
                <Input
                  key={key}
                  label={label}
                  type="number"
                  min={key === 'concurrent_calls' ? 1 : 0}
                  required
                  value={draft[key]}
                  onChange={(event) =>
                    setDraft({ ...draft, [key]: Number(event.target.value) })
                  }
                />
              ))}
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={draft.disabled}
                  onChange={(event) =>
                    setDraft({ ...draft, disabled: event.target.checked })
                  }
                />
                {t('commercial.pauseAccount')}
              </label>
              {save.isError && (
                <p role="alert" className="text-destructive">
                  {t('commercial.saveError')}
                </p>
              )}
              {save.isSuccess && <p role="status">{t('commercial.saved')}</p>}
              <Button type="submit" disabled={save.isPending}>
                {t('commercial.saveLimits')}
              </Button>
            </form>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  )
}
