import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AgentApprovalRequest,
  decideAgentApproval,
  listAgentApprovals,
} from '../api/agent-approvals-client.js'
import { agentDisplayName, describeAiErrorLine, toolName } from '../ai/server-text.js'
import { Button, Card, CardBody, CardHeader, CardTitle, Modal, Notice } from '../ui/index.js'

export function AgentApprovals({ token }: { readonly token: string }): JSX.Element {
  const { t, i18n } = useTranslation()
  const [requests, setRequests] = useState<readonly AgentApprovalRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<AgentApprovalRequest | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      try {
        const items = await listAgentApprovals(token)
        if (active) {
          setRequests(items)
          setError(null)
        }
      } catch (caught) {
        if (active) setError(describeAiErrorLine(caught, t, t('agentApprovals.loadError')))
      }
    }
    void load()
    const interval = setInterval(() => {
      void load()
    }, 3000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [token, t])

  const decide = useCallback(
    async (item: AgentApprovalRequest, decision: 'approve' | 'reject'): Promise<void> => {
      setBusy(true)
      setError(null)
      try {
        await decideAgentApproval(token, item.id, decision)
        setRequests((current) => current.filter((entry) => entry.id !== item.id))
        setReviewing(null)
      } catch (caught) {
        setError(describeAiErrorLine(caught, t, t('agentApprovals.decisionError')))
      } finally {
        setBusy(false)
      }
    },
    [token, t],
  )

  return (
    <Card aria-labelledby="agent-approvals-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="agent-approvals-heading">{t('agentApprovals.heading')}</h2>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-2">
        <p className="m-0 text-sm text-muted-foreground">{t('agentApprovals.description')}</p>
        {error !== null && (
          <Notice tone="danger" live="assertive">
            {error}
          </Notice>
        )}
        {requests.length === 0 && <p className="m-0 text-sm font-medium">{t('agentApprovals.empty')}</p>}
        {requests.map((item) => (
          <div key={item.id} className="flex min-w-0 flex-col gap-2 border-b py-4">
            <h3 className="m-0 break-words text-base" title={item.toolName}>
              {toolName(item.toolName, t)} — {agentDisplayName(item.agentName, true, t)}
            </h3>
            <p className="m-0 text-xs text-muted-foreground">
              <time dateTime={item.requestedAt}>
                {new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(item.requestedAt))}
              </time>
            </p>
            <pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(item.input, null, 2)}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => setReviewing(item)}>
                {t('agentApprovals.review')}
              </Button>
              <Button
                disabled={busy}
                variant="ghost"
                onClick={() => {
                  void decide(item, 'reject')
                }}
              >
                {t('agentApprovals.reject')}
              </Button>
            </div>
          </div>
        ))}
      </CardBody>
      <Modal
        open={reviewing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setReviewing(null)
        }}
        title={t('agentApprovals.confirmTitle')}
        description={t('agentApprovals.confirmDescription')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setReviewing(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (reviewing !== null) void decide(reviewing, 'approve')
              }}
            >
              {t('agentApprovals.approve')}
            </Button>
          </>
        }
      >
        {reviewing !== null && (
          <>
            <p className="m-0 font-medium" title={reviewing.toolName}>
              {toolName(reviewing.toolName, t)} — {agentDisplayName(reviewing.agentName, true, t)}
            </p>
            <pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(reviewing.input, null, 2)}
            </pre>
          </>
        )}
      </Modal>
    </Card>
  )
}
