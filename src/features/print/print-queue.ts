import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import { getTerminalId } from '@/features/control/session-store'
import { getSelectedAdapter, type RenderedDocument } from '@/features/print/hal'
import {
  renderReceipt,
  renderLabels,
  renderReport,
  type ReceiptPayload,
  type LabelPayload,
  type ReportPayload,
} from '@/features/print/renderers'
import type { Database, PrintJobType, PrintMediumHint } from '@/types/database'

export type PrintJob = Database['public']['Tables']['print_jobs']['Row']

/**
 * PrintQueue — every print request becomes a row before it becomes paper.
 *
 * Queueing rather than printing directly is what makes the rest possible:
 * business events can enqueue jobs nobody is watching yet, a job survives a
 * refresh, and the offline path is the same code with a different drain time.
 * The Print Engine drains; nothing prints straight from a click handler.
 */

interface EnqueueInput {
  jobType: PrintJobType
  payload: Record<string, unknown>
  copies?: number
}

export function useEnqueuePrintJob() {
  const { business, membership } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: EnqueueInput) => {
      const { data, error } = await supabase
        .from('print_jobs')
        .insert({
          business_id: business!.id,
          terminal_id: getTerminalId(),
          job_type: input.jobType,
          payload: input.payload,
          copies: input.copies ?? 1,
          requested_by: membership?.id ?? null,
        })
        .select()
        .single()
      if (error) {
        console.error('[print_jobs.insert] failed', { jobType: input.jobType, error })
        throw error
      }
      return data as PrintJob
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['print-jobs', business?.id] }),
  })
}

export function usePrintQueue(statuses: PrintJob['status'][] = ['queued', 'printing', 'failed']) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['print-jobs', business?.id, statuses.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('print_jobs')
        .select('*')
        .eq('business_id', business!.id)
        .in('status', statuses)
        .order('created_at', { ascending: true })
        .limit(200)
      if (error) throw error
      return (data ?? []) as PrintJob[]
    },
    enabled: !!business,
    refetchInterval: 20_000,
  })
}

export function useUpdatePrintJob() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; status: PrintJob['status'] }) => {
      const { error } = await supabase
        .from('print_jobs')
        .update({ status: input.status })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['print-jobs', business?.id] }),
  })
}

/**
 * Turns a stored job payload into a document. The payload is device-neutral by
 * design — this is the only place that decides what a job LOOKS like, so a ZPL
 * adapter can later render the same payload completely differently.
 */
export function renderJob(job: PrintJob): RenderedDocument {
  // Called during render to label a queued job, so it must never throw: a row
  // written by an older build, or with a payload that doesn't match its
  // job_type, would otherwise take the whole page down with it.
  try {
    return renderJobUnsafe(job)
  } catch (error) {
    console.error('[renderJob] malformed payload', { id: job.id, type: job.job_type, error })
    return {
      html: '<!doctype html><html><body><p>This job could not be rendered.</p></body></html>',
      medium: 'a4',
      title: 'Unreadable job',
    }
  }
}

function renderJobUnsafe(job: PrintJob): RenderedDocument {
  const payload = (job.payload ?? {}) as Record<string, unknown>
  const medium = (payload.medium as PrintMediumHint | undefined) ?? undefined

  switch (job.job_type) {
    case 'receipt':
      return renderReceipt(
        payload as unknown as ReceiptPayload,
        medium === 'receipt-58mm' ? 'receipt-58mm' : 'receipt-80mm',
      )
    case 'product_label':
    case 'shelf_label':
    case 'warehouse_label':
      return renderLabels(
        (payload.labels ?? []) as LabelPayload[],
        medium === 'label-40x30' ? 'label-40x30' : 'label-50x25',
      )
    case 'variance_report':
    case 'count_report':
    case 'po_document':
    default:
      return renderReport(payload as unknown as ReportPayload)
  }
}

/**
 * PrintEngine — drains a job through the selected HAL adapter.
 *
 * No screen calls window.print(). Everything arrives here, and here is the one
 * place that knows a device exists.
 */
export function usePrintEngine() {
  const update = useUpdatePrintJob()

  return useMutation({
    mutationFn: async (job: PrintJob) => {
      const adapter = getSelectedAdapter()
      await update.mutateAsync({ id: job.id, status: 'printing' })
      try {
        await adapter.print({
          id: job.id,
          jobType: job.job_type,
          copies: job.copies,
          document: renderJob(job),
        })
        await update.mutateAsync({ id: job.id, status: 'done' })
      } catch (error) {
        await update.mutateAsync({ id: job.id, status: 'failed' })
        throw error
      }
    },
  })
}

/** QR for the receipt verification token. Inline SVG so no asset is fetched. */
export async function qrSvg(value: string): Promise<string> {
  return QRCode.toString(value, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
  })
}

export function buildReceiptNumber(saleId: string): string {
  return `R-${saleId.slice(0, 8).toUpperCase()}`
}
