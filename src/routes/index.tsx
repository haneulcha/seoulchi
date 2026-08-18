import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return <main className="p-4 text-lg font-bold">서울치</main>
}
