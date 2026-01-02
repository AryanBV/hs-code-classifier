import { Metadata } from 'next'
import { HistoryPage } from '@/components/history/history-page'

export const metadata: Metadata = {
  title: 'Classification History | TradeCode',
  description: 'View and manage your past HS code classifications. Search, filter, and export your classification history.',
  openGraph: {
    title: 'Classification History | TradeCode',
    description: 'View and manage your past HS code classifications.',
    type: 'website',
  },
}

/**
 * History Page
 *
 * Displays all past classifications with search, filter, and export capabilities.
 * Server component that renders the client-side HistoryPage component.
 */
export default function HistoryPageRoute() {
  return <HistoryPage />
}
