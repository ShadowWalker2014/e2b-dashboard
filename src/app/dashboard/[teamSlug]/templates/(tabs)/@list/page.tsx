import { Suspense } from 'react'
import LoadingLayout from '@/features/dashboard/loading-layout'
import TemplatesTable from '@/features/dashboard/templates/list/table'
import { HydrateClient, prefetch, trpc } from '@/trpc/server'

export default async function ListPage({
  params,
}: PageProps<'/dashboard/[teamSlug]/templates'>) {
  const { teamSlug } = await params

  prefetch(
    trpc.templates.getTemplates.queryOptions({
      teamSlug,
    })
  )

  return (
    <HydrateClient>
      <Suspense fallback={<LoadingLayout />}>
        <TemplatesTable />
      </Suspense>
    </HydrateClient>
  )
}
